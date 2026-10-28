'use strict';

const STORAGE_KEY = 'gratitude-journal-v1';
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const PROMPTS = [
  '오늘 나를 도와준 사람은 누구였나요?',
  '당연하게 여겼지만 사실 고마운 것은? (건강, 집, 물…)',
  '오늘 작게 웃었던 순간은?',
  '힘들었던 일 속에서 배운 것은?',
  '오늘 먹은 것 중 가장 맛있었던 것은?',
  '오늘 내 몸이 해낸 일은?',
  '최근 누군가 건넨 말 중 기억에 남는 것은?',
  '지금 내 주변에서 보이는 고마운 물건 하나는?',
  '오늘 날씨나 자연에서 좋았던 점은?',
  '1년 전의 나는 갖지 못했지만 지금은 가진 것은?',
  '오늘 배운 새로운 것은?',
  '오늘 편리하게 써 준 기술이나 서비스는?',
];
const STOPWORDS = new Set(['오늘', '정말', '너무', '그리고', '그래서', '있었다', '했다', '좋았다', '고마웠다', '감사했다', '것이', '수가', '덕분에', '같다', '나를', '내가', '나의']);
const PARTICLES = /(에게서|에서|에게|한테|께서|으로|로|은|는|이|가|을|를|와|과|도|의|에|랑|이랑)$/;

// ---------- 저장소 ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return { entries: data.entries || {}, reviews: data.reviews || {}, settings: { itemCount: 3, ...(data.settings || {}) } };
  } catch {
    return { entries: {}, reviews: {}, settings: { itemCount: 3 } };
  }
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
let state = load();

// ---------- 날짜 ----------
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const todayKey = () => toKey(new Date());
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (k) => { const d = fromKey(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`; };
const weekStart = (k) => { const d = fromKey(k); const diff = (d.getDay() + 6) % 7; return addDays(k, -diff); };

// ---------- 유틸 ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => s.replace(/[\s.,!?~·…'"]/g, '').toLowerCase();
const hasContent = (e) => e && e.items.some((it) => it.what.trim());

// ---------- 연속 기록 ----------
function renderStreak() {
  const t = todayKey();
  let k = hasContent(state.entries[t]) ? t : addDays(t, -1);
  let n = 0;
  while (hasContent(state.entries[k])) { n++; k = addDays(k, -1); }
  const total = Object.values(state.entries).filter(hasContent).length;
  $('#streak').innerHTML = `🔥 <b>${n}</b>일 연속 · 총 ${total}일`;
}

// ---------- 작성 화면 ----------
let currentDate = todayKey();
let promptIdx = Math.floor(Math.random() * PROMPTS.length);

function blankEntry() {
  return { moodBefore: null, moodAfter: null, items: [], self: '' };
}
function getDraft() {
  const e = state.entries[currentDate] ? structuredClone(state.entries[currentDate]) : blankEntry();
  while (e.items.length < state.settings.itemCount) e.items.push({ what: '', why: '', starred: false });
  return e;
}
let draft = getDraft();

function renderMoods() {
  document.querySelectorAll('.moods').forEach((box) => {
    const field = box.dataset.field;
    box.innerHTML = MOODS.map((m, i) =>
      `<button type="button" class="mood${draft[field] === i ? ' selected' : ''}" data-i="${i}" aria-label="기분 ${i + 1}">${m}</button>`).join('');
  });
}

function renderItems() {
  $('#items').innerHTML = draft.items.map((it, i) => `
    <div class="card item" data-i="${i}">
      <div class="item-head">
        <span class="item-num">${i + 1}.</span>
        <button type="button" class="star${it.starred ? ' on' : ''}" data-act="star" aria-label="별표">★</button>
      </div>
      <input type="text" data-field="what" placeholder="무엇이 감사했나요? (구체적으로)" value="${esc(it.what)}">
      <span class="dup-warn" hidden></span>
      <textarea data-field="why" rows="2" placeholder="왜 고마웠나요?">${esc(it.why)}</textarea>
    </div>`).join('');
  draft.items.forEach((_, i) => checkDuplicate(i));
}

function checkDuplicate(i) {
  const card = document.querySelector(`.item[data-i="${i}"]`);
  const warn = card.querySelector('.dup-warn');
  const q = norm(draft.items[i].what);
  warn.hidden = true;
  if (q.length < 3) return;
  const dates = Object.keys(state.entries).filter((k) => k !== currentDate).sort().reverse();
  for (const k of dates) {
    if (state.entries[k].items.some((it) => { const p = norm(it.what); return p && (p === q || (p.length >= 5 && q.includes(p)) || (q.length >= 5 && p.includes(q))); })) {
      warn.textContent = `${fmtDate(k)}에도 비슷한 내용을 썼어요. 새로운 감사거리를 찾아볼까요?`;
      warn.hidden = false;
      return;
    }
  }
}

function renderNudge() {
  const t = todayKey();
  const el = $('#nudge');
  if (currentDate === t && !hasContent(state.entries[t]) && !hasContent(state.entries[addDays(t, -1)]) &&
      Object.values(state.entries).some(hasContent)) {
    el.textContent = '어제는 쉬었네요. 이틀 연속으로 빠지지만 않으면 습관은 유지돼요. 하나만 써도 괜찮아요!';
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function renderWrite() {
  $('#entry-date').value = currentDate;
  $('#entry-date').max = todayKey();
  $('#next-day').disabled = currentDate >= todayKey();
  $('#prompt-text').textContent = PROMPTS[promptIdx];
  $('#self').value = draft.self;
  $('#save-status').textContent = state.entries[currentDate] ? '저장됨' : '';
  renderMoods();
  renderItems();
  renderNudge();
}

function goToDate(k) {
  if (!k || k > todayKey()) return;
  flushSave();
  currentDate = k;
  draft = getDraft();
  renderWrite();
}

function saveDraft() {
  saveTimer = null;
  const items = draft.items.map((it) => ({ what: it.what.trim(), why: it.why.trim(), starred: it.starred }))
    .filter((it) => it.what || it.why);
  const empty = !items.length && !draft.self.trim() && draft.moodBefore === null && draft.moodAfter === null;
  if (empty) {
    delete state.entries[currentDate];
  } else {
    state.entries[currentDate] = { moodBefore: draft.moodBefore, moodAfter: draft.moodAfter, items, self: draft.self.trim(), updatedAt: Date.now() };
  }
  const ok = persist();
  $('#save-status').textContent = ok ? (empty ? '' : '저장됨') : '저장 실패 (브라우저 저장소를 사용할 수 없어요)';
  renderStreak();
  renderNudge();
}

let saveTimer = null;
function scheduleSave() {
  $('#save-status').textContent = '작성 중…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 600);
}
// 수정 중인 내용이 있을 때만 저장 (다른 탭의 기록을 덮어쓰지 않도록)
function flushSave() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveDraft();
}

$('#items').addEventListener('input', (ev) => {
  const card = ev.target.closest('.item');
  if (!card || !ev.target.dataset.field) return;
  const i = Number(card.dataset.i);
  draft.items[i][ev.target.dataset.field] = ev.target.value;
  if (ev.target.dataset.field === 'what') checkDuplicate(i);
  scheduleSave();
});
$('#items').addEventListener('click', (ev) => {
  if (ev.target.dataset.act !== 'star') return;
  const i = Number(ev.target.closest('.item').dataset.i);
  draft.items[i].starred = !draft.items[i].starred;
  ev.target.classList.toggle('on', draft.items[i].starred);
  scheduleSave();
});
document.querySelectorAll('.moods').forEach((box) => box.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.mood');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  draft[box.dataset.field] = draft[box.dataset.field] === i ? null : i;
  renderMoods();
  scheduleSave();
}));
$('#self').addEventListener('input', (ev) => { draft.self = ev.target.value; scheduleSave(); });
$('#save').addEventListener('click', () => { clearTimeout(saveTimer); saveDraft(); });
$('#new-prompt').addEventListener('click', () => {
  promptIdx = (promptIdx + 1 + Math.floor(Math.random() * (PROMPTS.length - 1))) % PROMPTS.length;
  $('#prompt-text').textContent = PROMPTS[promptIdx];
});
$('#prev-day').addEventListener('click', () => goToDate(addDays(currentDate, -1)));
$('#next-day').addEventListener('click', () => goToDate(addDays(currentDate, 1)));
$('#entry-date').addEventListener('change', (ev) => goToDate(ev.target.value));

// ---------- 기록 화면 ----------
function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return safe.replace(re, (m) => `<mark>${m}</mark>`);
}

function renderHistory() {
  const q = $('#search').value.trim();
  const starredOnly = $('#starred-only').checked;
  const keys = Object.keys(state.entries).sort().reverse();
  const html = keys.map((k) => {
    const e = state.entries[k];
    let items = e.items.map((it, idx) => ({ ...it, idx }));
    if (starredOnly) items = items.filter((it) => it.starred);
    if (q) items = items.filter((it) => (it.what + ' ' + it.why).toLowerCase().includes(q.toLowerCase()));
    const selfMatch = e.self && !starredOnly && (!q || e.self.toLowerCase().includes(q.toLowerCase()));
    if (!items.length && !selfMatch) return '';
    const mood = e.moodBefore !== null || e.moodAfter !== null
      ? `<span class="muted">${e.moodBefore !== null ? MOODS[e.moodBefore] : '·'} → ${e.moodAfter !== null ? MOODS[e.moodAfter] : '·'}</span>` : '';
    return `<div class="card day">
      <h3><span>${fmtDate(k)} ${mood}</span><button data-edit="${k}">수정</button></h3>
      <ul>${items.map((it) => `<li><button class="star${it.starred ? ' on' : ''}" data-day="${k}" data-idx="${it.idx}" aria-label="별표">★</button>
        <div>${highlight(it.what, q)}${it.why ? `<span class="why">${highlight(it.why, q)}</span>` : ''}</div></li>`).join('')}
        ${selfMatch ? `<li><span>🙌</span><div><span class="why">나에게: ${highlight(e.self, q)}</span></div></li>` : ''}
      </ul></div>`;
  }).join('');
  $('#history-list').innerHTML = html || `<p class="empty">${keys.length ? '조건에 맞는 기록이 없어요.' : '아직 기록이 없어요. 오늘의 감사 세 가지로 시작해 보세요.'}</p>`;
}

function toggleStar(day, idx) {
  const it = state.entries[day]?.items[idx];
  if (!it) return;
  it.starred = !it.starred;
  persist();
  if (day === currentDate) draft = getDraft();
}

$('#search').addEventListener('input', renderHistory);
$('#starred-only').addEventListener('change', renderHistory);
$('#history-list').addEventListener('click', (ev) => {
  const edit = ev.target.dataset.edit;
  if (edit) { goToDate(edit); switchView('write'); return; }
  if (ev.target.dataset.day) { toggleStar(ev.target.dataset.day, Number(ev.target.dataset.idx)); renderHistory(); }
});

// ---------- 회고 화면 ----------
let reviewWeek = weekStart(todayKey());

function topWords(texts) {
  const counts = new Map();
  texts.join(' ').split(/[\s.,!?~·…'"()\[\]]+/).forEach((w) => {
    w = w.replace(PARTICLES, '');
    if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) return;
    counts.set(w, (counts.get(w) || 0) + 1);
  });
  return [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
}

function renderReview() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(reviewWeek, i));
  const end = days[6];
  $('#week-label').textContent = `${fmtDate(reviewWeek)} – ${fmtDate(end)}`;
  $('#next-week').disabled = addDays(reviewWeek, 7) > todayKey();

  const written = days.filter((k) => hasContent(state.entries[k]));
  const items = written.flatMap((k) => state.entries[k].items.map((it, idx) => ({ ...it, idx, day: k })).filter((it) => it.what));
  const moodGains = written.map((k) => state.entries[k]).filter((e) => e.moodBefore !== null && e.moodAfter !== null)
    .map((e) => e.moodAfter - e.moodBefore);
  const avgGain = moodGains.length ? (moodGains.reduce((a, b) => a + b, 0) / moodGains.length) : null;

  $('#week-stats').innerHTML = `
    <div class="stat"><b>${written.length}/7</b><span>쓴 날</span></div>
    <div class="stat"><b>${items.length}</b><span>감사한 것</span></div>
    <div class="stat"><b>${avgGain === null ? '–' : (avgGain > 0 ? '+' : '') + avgGain.toFixed(1)}</b><span>평균 기분 변화</span></div>`;

  $('#week-items').innerHTML = items.length
    ? `<div class="day"><ul>${items.map((it) => `<li><button class="star${it.starred ? ' on' : ''}" data-day="${it.day}" data-idx="${it.idx}" aria-label="별표">★</button>
        <div>${esc(it.what)}<span class="why">${fmtDate(it.day)}${it.why ? ' · ' + esc(it.why) : ''}</span></div></li>`).join('')}</ul></div>`
    : '<p class="muted">이 주에는 기록이 없어요.</p>';

  const words = topWords(items.map((it) => `${it.what} ${it.why}`));
  $('#week-words').innerHTML = words.length
    ? words.map(([w, c]) => `<span class="chip">${esc(w)} ×${c}</span>`).join('')
    : '<span class="muted">두 번 이상 나온 단어가 아직 없어요.</span>';

  $('#week-note').value = state.reviews[reviewWeek]?.note || '';
  $('#week-status').textContent = '';
}

$('#week-items').addEventListener('click', (ev) => {
  if (!ev.target.dataset.day) return;
  toggleStar(ev.target.dataset.day, Number(ev.target.dataset.idx));
  renderReview();
});
$('#prev-week').addEventListener('click', () => { reviewWeek = addDays(reviewWeek, -7); renderReview(); });
$('#next-week').addEventListener('click', () => { reviewWeek = addDays(reviewWeek, 7); renderReview(); });
$('#save-week').addEventListener('click', () => {
  const note = $('#week-note').value.trim();
  if (note) state.reviews[reviewWeek] = { note, updatedAt: Date.now() };
  else delete state.reviews[reviewWeek];
  $('#week-status').textContent = persist() ? '저장됨' : '저장 실패';
});

// ---------- 설정 ----------
$('#item-count').value = String(state.settings.itemCount);
$('#item-count').addEventListener('change', (ev) => {
  flushSave();
  state.settings.itemCount = Number(ev.target.value);
  persist();
  draft = getDraft();
  renderWrite();
});

$('#export').addEventListener('click', async () => {
  const name = `gratitude-journal-${todayKey()}.json`;
  const json = JSON.stringify(state, null, 2);
  // 아이폰 홈 화면 앱에서는 다운로드가 잘 안 되므로 공유 시트(파일에 저장, 에어드롭 등)를 쓴다
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try {
      await navigator.share({ files: [file], title: '감사 일기 백업' });
      $('#data-status').textContent = '백업 파일을 공유했어요.';
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  $('#data-status').textContent = '백업 파일을 내려받았어요.';
});

$('#import').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.entries !== 'object') throw new Error('형식 오류');
    // 기존 기록과 합치되, 같은 날짜는 더 최근에 수정된 쪽을 남긴다
    let added = 0;
    for (const [k, e] of Object.entries(data.entries)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !Array.isArray(e?.items)) continue;
      const cur = state.entries[k];
      if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) { state.entries[k] = e; added++; }
    }
    for (const [k, r] of Object.entries(data.reviews || {})) {
      const cur = state.reviews[k];
      if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) state.reviews[k] = r;
    }
    persist();
    draft = getDraft();
    renderAll();
    $('#data-status').textContent = `${added}일 분량의 기록을 가져왔어요.`;
  } catch {
    $('#data-status').textContent = '가져오기에 실패했어요. 내보내기로 만든 JSON 파일인지 확인해 주세요.';
  }
  ev.target.value = '';
});

// ---------- 탭 ----------
function switchView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'history') renderHistory();
  if (name === 'review') renderReview();
  if (name === 'write') renderWrite();
}
document.querySelector('.tabs').addEventListener('click', (ev) => {
  const view = ev.target.dataset.view;
  if (!view) return;
  flushSave();
  switchView(view);
});

function renderAll() {
  renderStreak();
  renderWrite();
}
window.addEventListener('beforeunload', flushSave);
// 아이폰은 앱을 닫을 때 beforeunload가 오지 않을 수 있어 화면이 가려질 때도 저장한다
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// 브라우저가 저장 공간이 부족할 때 기록을 지우지 않도록 요청한다
navigator.storage?.persist?.().catch(() => {});
renderAll();
