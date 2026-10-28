'use strict';

const STORAGE_KEY = 'gratitude-journal-v1';
const MOODS = ['😞', '😕', '😐', '🙂', '😄'];
const CATEGORIES = [
  { id: 'people', label: '사람', icon: '🧑‍🤝‍🧑' },
  { id: 'experience', label: '경험', icon: '✨' },
  { id: 'self', label: '나', icon: '🙋' },
  { id: 'nature', label: '자연', icon: '🌿' },
  { id: 'things', label: '물건·환경', icon: '🏠' },
];
const PROMPTS = [
  '오늘 나를 도와준 사람은 누구였나요?',
  '당연하게 여겼지만 사실 고마운 것은? (건강, 집, 물…)',
  '오늘 작게 웃었던 순간은?',
  '오늘 뜻밖에 좋았던 일은?',
  '오늘 먹은 것 중 가장 맛있었던 것은?',
  '오늘 내 몸이 해낸 일은?',
  '최근 누군가 건넨 말 중 기억에 남는 것은?',
  '지금 내 주변에서 보이는 고마운 물건 하나는?',
  '오늘 날씨나 자연에서 좋았던 점은?',
  '1년 전의 나는 갖지 못했지만 지금은 가진 것은?',
  '오늘 배운 새로운 것은?',
  '오늘 누군가를 도왔다면, 그 기회가 고마운 이유는?',
];
const HARD_PROMPTS = [
  '힘들었지만 그래도 버틸 수 있게 해 준 것은?',
  '오늘 아주 잠깐이라도 숨 돌릴 수 있었던 순간은?',
  '힘든 하루 속에서 나를 걱정해 준 사람은?',
  '이 어려움 속에서 배우고 있는 것은?',
  '그래도 오늘 해낸 아주 작은 일 하나는?',
];
const STOPWORDS = new Set(['오늘', '정말', '너무', '그리고', '그래서', '있었다', '했다', '좋았다', '고마웠다', '감사했다', '것이', '수가', '덕분에', '같다', '나를', '내가', '나의', '났다', '있다', '없다', '하는', '해서']);
const PARTICLES = /(에게서|에서|에게|한테|께서|으로|로|은|는|이|가|을|를|와|과|도|의|에|랑|이랑)$/;

// ---------- 저장소 ----------
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return {
      entries: data.entries || {},
      reviews: data.reviews || {},
      people: data.people || {},
      settings: { itemCount: 3, morning: false, ...(data.settings || {}) },
    };
  } catch {
    return { entries: {}, reviews: {}, people: {}, settings: { itemCount: 3, morning: false } };
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

const COLLECTION = { entry: 'entries', review: 'reviews', person: 'people' };
// 기록이 바뀔 때마다 호출: 동기화 대기열에 올린다
function changed(kind, key, ts) {
  Sync.markDirty(kind, key, ts);
}

// ---------- 날짜 ----------
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const todayKey = () => toKey(new Date());
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (k) => { const d = fromKey(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`; };
const weekStart = (k) => { const d = fromKey(k); const diff = (d.getDay() + 6) % 7; return addDays(k, -diff); };
const fmtDateY = (k) => `${fromKey(k).getFullYear()}년 ${fmtDate(k)}`;
const fmtShort = (k) => { const d = fromKey(k); return `${d.getMonth() + 1}/${d.getDate()}`; };
const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86_400_000);
const monthKey = (k) => k.slice(0, 7);
const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };

// ---------- 유틸 ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => s.replace(/[\s.,!?~·…'"]/g, '').toLowerCase();
const hasContent = (e) => !!e && e.items.some((it) => it.what.trim());
const normItem = (it) => ({ what: '', why: '', who: '', category: null, role: '', starred: false, ...it });
const splitPeople = (who) => (who || '').split(/[,，、/]+/).map((s) => s.trim()).filter(Boolean);
const catOf = (id) => CATEGORIES.find((c) => c.id === id);

function itemTags(it) {
  const c = catOf(it.category);
  return (c ? `<span class="tag">${c.icon} ${c.label}</span>` : '') +
    splitPeople(it.who).map((p) => `<span class="tag">@${esc(p)}</span>`).join('');
}

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

function getDraft() {
  const saved = state.entries[currentDate];
  const e = saved
    ? { hardDay: false, intention: '', self: '', ...structuredClone(saved) }
    : { moodBefore: null, moodAfter: null, items: [], self: '', hardDay: false, intention: '' };
  e.items = e.items.map(normItem);
  while (e.items.length < state.settings.itemCount) e.items.push(normItem({}));
  return e;
}
let draft = getDraft();

const prompts = () => (draft.hardDay ? HARD_PROMPTS : PROMPTS);

function renderMoods() {
  document.querySelectorAll('.moods').forEach((box) => {
    const field = box.dataset.field;
    box.innerHTML = MOODS.map((m, i) =>
      `<button type="button" class="mood${draft[field] === i ? ' selected' : ''}" data-i="${i}" aria-label="기분 ${i + 1}">${m}</button>`).join('');
  });
}

function renderItems() {
  const placeholder = draft.hardDay ? '힘들었지만 그래도 고마웠던 것' : '무엇이 감사했나요? (구체적으로)';
  $('#items-hint').textContent = draft.hardDay
    ? '힘든 날엔 하나만 써도 충분해요.'
    : '많이보다 깊게. 하나만 써도 괜찮아요.';
  $('#items').innerHTML = draft.items.map((it, i) => `
    <div class="card item" data-i="${i}">
      <div class="item-head">
        <span class="item-num">${i + 1}.</span>
        <button type="button" class="star${it.starred ? ' on' : ''}" data-act="star" aria-label="별표">★</button>
      </div>
      <input type="text" data-field="what" placeholder="${placeholder}" value="${esc(it.what)}">
      <span class="dup-warn" hidden></span>
      <textarea data-field="why" rows="2" placeholder="왜 고마웠나요?">${esc(it.why)}</textarea>
      <div class="cats">${CATEGORIES.map((c) =>
        `<button type="button" class="cat${it.category === c.id ? ' on' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('')}</div>
      <input type="text" data-field="who" placeholder="누구 덕분인가요? (선택)" value="${esc(it.who)}" list="people-list">
      <details${it.role ? ' open' : ''}>
        <summary class="muted">내가 한 역할도 적기</summary>
        <input type="text" data-field="role" placeholder="예: 먼저 연락한 건 나였다" value="${esc(it.role)}">
      </details>
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
  let msg = '';
  if (currentDate === t) {
    const isSunday = fromKey(t).getDay() === 0;
    const reviewed = state.reviews[weekStart(t)];
    if (isSunday && !reviewed) {
      msg = '일요일이에요. 회고 탭에서 이번 주를 돌아보고 고마운 사람에게 마음을 전해 보세요.';
    } else if (!hasContent(state.entries[t]) && !hasContent(state.entries[addDays(t, -1)]) &&
        Object.values(state.entries).some(hasContent)) {
      msg = '어제는 쉬었네요. 이틀 연속으로 빠지지만 않으면 습관은 유지돼요. 하나만 써도 괜찮아요!';
    }
  }
  el.textContent = msg;
  el.hidden = !msg;
}

function renderWrite() {
  $('#entry-date').value = currentDate;
  $('#entry-date').max = todayKey();
  $('#next-day').disabled = currentDate >= todayKey();
  $('#hard-day').setAttribute('aria-pressed', String(!!draft.hardDay));
  $('#intention-card').hidden = !state.settings.morning;
  $('#intention').value = draft.intention || '';
  promptIdx %= prompts().length;
  $('#prompt-text').textContent = prompts()[promptIdx];
  $('#self').value = draft.self;
  $('#save-status').textContent = state.entries[currentDate] ? '저장됨' : '';
  renderPeopleList();
  renderMoods();
  renderItems();
  renderNudge();
  renderMemory();
}

function renderPeopleList() {
  const counts = peopleCounts(Object.values(state.entries));
  $('#people-list').innerHTML = counts.slice(0, 30).map(([p]) => `<option value="${esc(p)}">`).join('');
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
  const items = draft.items
    .map((it) => ({ what: it.what.trim(), why: it.why.trim(), who: it.who.trim(), category: it.category, role: it.role.trim(), starred: it.starred }))
    .filter((it) => it.what || it.why);
  const empty = !items.length && !draft.self.trim() && !(draft.intention || '').trim() &&
    draft.moodBefore === null && draft.moodAfter === null;
  const now = Date.now();
  if (empty) {
    if (state.entries[currentDate]) {
      delete state.entries[currentDate];
      changed('entry', currentDate, now);
    }
  } else {
    state.entries[currentDate] = {
      moodBefore: draft.moodBefore, moodAfter: draft.moodAfter, items,
      self: draft.self.trim(), hardDay: !!draft.hardDay, intention: (draft.intention || '').trim(), updatedAt: now,
    };
    changed('entry', currentDate, now);
  }
  const ok = persist();
  let status = empty ? '' : '저장됨';
  const saved = state.entries[currentDate];
  if (saved && hasMoods(saved)) {
    status += ` · 오늘 기분 ${signed(saved.moodAfter - saved.moodBefore)} (평균 ${signed(moodEffect(Object.values(state.entries)).avg)})`;
  }
  $('#save-status').textContent = ok ? status : '저장 실패 (브라우저 저장소를 사용할 수 없어요)';
  // 오늘 일기를 쓰면 앱 아이콘의 알림 배지를 지운다
  if (currentDate === todayKey() && hasContent(saved)) navigator.clearAppBadge?.().catch(() => {});
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
  const field = ev.target.dataset.field;
  if (!card || !field) return;
  const i = Number(card.dataset.i);
  draft.items[i][field] = ev.target.value;
  if (field === 'what') checkDuplicate(i);
  scheduleSave();
});
$('#items').addEventListener('click', (ev) => {
  const card = ev.target.closest('.item');
  if (!card) return;
  const i = Number(card.dataset.i);
  if (ev.target.dataset.act === 'star') {
    draft.items[i].starred = !draft.items[i].starred;
    ev.target.classList.toggle('on', draft.items[i].starred);
    scheduleSave();
  }
  const cat = ev.target.closest('.cat')?.dataset.cat;
  if (cat) {
    draft.items[i].category = draft.items[i].category === cat ? null : cat;
    card.querySelectorAll('.cat').forEach((b) => b.classList.toggle('on', b.dataset.cat === draft.items[i].category));
    scheduleSave();
  }
});
document.querySelectorAll('.moods').forEach((box) => box.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.mood');
  if (!btn) return;
  const i = Number(btn.dataset.i);
  draft[box.dataset.field] = draft[box.dataset.field] === i ? null : i;
  renderMoods();
  scheduleSave();
}));
$('#hard-day').addEventListener('click', () => {
  draft.hardDay = !draft.hardDay;
  promptIdx = 0;
  memoryIdx = 0;
  renderMemory();
  $('#hard-day').setAttribute('aria-pressed', String(draft.hardDay));
  $('#prompt-text').textContent = prompts()[promptIdx];
  renderItems();
  scheduleSave();
});
$('#intention').addEventListener('input', (ev) => { draft.intention = ev.target.value; scheduleSave(); });
$('#self').addEventListener('input', (ev) => { draft.self = ev.target.value; scheduleSave(); });
$('#save').addEventListener('click', () => { clearTimeout(saveTimer); saveDraft(); });
$('#new-prompt').addEventListener('click', () => {
  const list = prompts();
  promptIdx = (promptIdx + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  $('#prompt-text').textContent = list[promptIdx];
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
  const ql = q.toLowerCase();
  const starredOnly = $('#starred-only').checked;
  const keys = Object.keys(state.entries).sort().reverse();
  const html = keys.map((k) => {
    const e = state.entries[k];
    let items = e.items.map((it, idx) => ({ ...normItem(it), idx }));
    if (starredOnly) items = items.filter((it) => it.starred);
    if (q) items = items.filter((it) => [it.what, it.why, it.who, it.role].join(' ').toLowerCase().includes(ql));
    const selfMatch = e.self && !starredOnly && (!q || e.self.toLowerCase().includes(ql));
    if (!items.length && !selfMatch) return '';
    const mood = e.moodBefore !== null || e.moodAfter !== null
      ? `<span class="muted">${e.moodBefore !== null ? MOODS[e.moodBefore] : '·'} → ${e.moodAfter !== null ? MOODS[e.moodAfter] : '·'}</span>` : '';
    return `<div class="card day">
      <h3><span>${fmtDate(k)} ${e.hardDay ? '😮‍💨 ' : ''}${mood}</span><button data-edit="${k}">수정</button></h3>
      <ul>${items.map((it) => `<li><button class="star${it.starred ? ' on' : ''}" data-day="${k}" data-idx="${it.idx}" aria-label="별표">★</button>
        <div>${highlight(it.what, q)}${itemTags(it)}${it.why ? `<span class="why">${highlight(it.why, q)}</span>` : ''}${it.role ? `<span class="why">내 역할: ${highlight(it.role, q)}</span>` : ''}</div></li>`).join('')}
        ${selfMatch ? `<li><span>🙋</span><div><span class="why">나에게: ${highlight(e.self, q)}</span></div></li>` : ''}
      </ul></div>`;
  }).join('');
  $('#history-list').innerHTML = html || `<p class="empty">${keys.length ? '조건에 맞는 기록이 없어요.' : '아직 기록이 없어요. 오늘의 감사로 시작해 보세요.'}</p>`;
}

function toggleStar(day, idx) {
  const e = state.entries[day];
  const it = e?.items[idx];
  if (!it) return;
  it.starred = !it.starred;
  e.updatedAt = Date.now();
  persist();
  changed('entry', day, e.updatedAt);
  if (day === currentDate) draft = getDraft();
}

$('#search').addEventListener('input', renderHistory);
$('#starred-only').addEventListener('change', renderHistory);
$('#history-list').addEventListener('click', (ev) => {
  const edit = ev.target.dataset.edit;
  if (edit) { goToDate(edit); switchView('write'); return; }
  if (ev.target.dataset.day) { toggleStar(ev.target.dataset.day, Number(ev.target.dataset.idx)); renderOverview(); renderHistory(); }
});

// ---------- 모아보기: 한눈에 ----------
let overviewYear = fromKey(todayKey()).getFullYear();
const writtenDays = () => Object.keys(state.entries).filter((k) => hasContent(state.entries[k])).sort();
const countItems = (e) => e.items.filter((it) => it.what.trim()).length;

function longestStreak() {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of writtenDays()) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

function renderOverview() {
  const written = writtenDays();
  const items = written.flatMap((k) => state.entries[k].items.map((it, idx) => ({ ...normItem(it), idx, day: k })).filter((it) => it.what));
  const people = peopleCounts(written.map((k) => state.entries[k]));
  $('#ov-stats').innerHTML = `
    <div class="stat"><b>${written.length}</b><span>기록한 날</span></div>
    <div class="stat"><b>${items.length}</b><span>감사한 것</span></div>
    <div class="stat"><b>${people.length}</b><span>함께한 사람</span></div>
    <div class="stat"><b>${longestStreak()}일</b><span>최장 연속</span></div>`;
  renderHeatmap();

  $('#ov-people').innerHTML = people.length
    ? people.slice(0, 8).map(([p, n]) => `<button class="chip-btn" data-person="${esc(p)}">${esc(p)}<b>${n}</b></button>`).join('')
    : '<span class="muted">"누구 덕분인가요?"를 채우면 여기에 모여요.</span>';

  const cats = CATEGORIES.map((c) => [`${c.icon} ${c.label}`, items.filter((it) => it.category === c.id).length]);
  $('#ov-cats').innerHTML = items.some((it) => catOf(it.category))
    ? barRows(cats, Math.max(1, ...cats.map(([, n]) => n)))
    : '<p class="muted">항목마다 범주를 고르면 내 감사가 어디에 많은지 보여요.</p>';

  const stars = items.filter((it) => it.starred).reverse();
  $('#ov-stars').innerHTML = stars.length
    ? starList(stars.slice(0, 5)) + (stars.length > 5 ? `<button id="all-stars" class="link-btn">⭐ ${stars.length}개 모두 보기</button>` : '')
    : '<p class="muted">마음에 남는 감사에 ⭐를 눌러 두면 여기 모여요.</p>';
}

// 한 해를 달력 12개로 보여 준다. 그날 감사한 개수만큼 진하게
function renderHeatmap() {
  const t = todayKey();
  const thisYear = fromKey(t).getFullYear();
  const minYear = Math.min(thisYear, ...Object.keys(state.entries).map((k) => Number(k.slice(0, 4))));
  $('#year-label').textContent = `${overviewYear}년`;
  $('#prev-year').disabled = overviewYear <= minYear;
  $('#next-year').disabled = overviewYear >= thisYear;
  let html = '';
  for (let m = 1; m <= 12; m++) {
    const lead = (new Date(overviewYear, m - 1, 1).getDay() + 6) % 7; // 월요일 시작
    let cells = '<i class="pad"></i>'.repeat(lead);
    for (let d = 1; d <= new Date(overviewYear, m, 0).getDate(); d++) {
      const k = `${overviewYear}-${pad(m)}-${pad(d)}`;
      const n = hasContent(state.entries[k]) ? countItems(state.entries[k]) : 0;
      const today = k === t ? ' today' : '';
      cells += n
        ? `<button class="l${Math.min(n, 3)}${today}" data-day="${k}" title="${fmtDate(k)} · ${n}개" aria-label="${fmtDate(k)} 감사 ${n}개"></button>`
        : `<i class="${k > t ? 'future' : ''}${today}"></i>`;
    }
    html += `<div class="hm-month"><b>${m}월</b><div class="hm-days">${cells}</div></div>`;
  }
  $('#heatmap').innerHTML = html;
}

$('#heatmap').addEventListener('click', (ev) => {
  const day = ev.target.dataset.day;
  if (!day) return;
  goToDate(day);
  switchView('write');
});
$('#prev-year').addEventListener('click', () => { overviewYear--; renderHeatmap(); });
$('#next-year').addEventListener('click', () => { overviewYear++; renderHeatmap(); });
$('#ov-people').addEventListener('click', (ev) => {
  const name = ev.target.closest('.chip-btn')?.dataset.person;
  if (!name) return;
  currentPerson = name;
  letterEdited = false;
  letterExcluded = new Set();
  switchView('people');
});
$('#ov-stars').addEventListener('click', (ev) => {
  if (ev.target.id === 'all-stars') {
    $('#starred-only').checked = true;
    renderHistory();
    $('#all-entries').scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (!ev.target.dataset.day) return;
  toggleStar(ev.target.dataset.day, Number(ev.target.dataset.idx));
  renderOverview();
  renderHistory();
});

// ---------- 감사 책 ----------
function renderBook() {
  const days = Object.keys(state.entries).filter((k) => hasContent(state.entries[k]) || state.entries[k].self).sort();
  if (!days.length) {
    $('#book').innerHTML = '<p class="empty">아직 기록이 없어요.</p>';
    return;
  }
  const total = days.reduce((n, k) => n + countItems(state.entries[k]), 0);
  const months = [...new Set(days.map(monthKey))];
  let html = `<h1>나의 감사 책</h1>
    <p class="book-sub">${fmtDateY(days[0])} – ${fmtDateY(days.at(-1))}<br>${days.length}일 동안 ${total}가지에 감사했어요</p>`;
  for (const m of months) {
    const [y, mo] = m.split('-').map(Number);
    html += `<section class="month"><h2>${y}년 ${mo}월</h2>`;
    for (const k of days.filter((d) => monthKey(d) === m)) {
      const e = state.entries[k];
      const items = e.items.map(normItem).filter((it) => it.what);
      html += `<div class="book-day"><h3>${fmtDate(k)}${e.hardDay ? ' 😮‍💨' : ''}</h3><ul>${items.map((it) => `<li>${it.starred ? '⭐ ' : ''}${esc(it.what)}${
        it.who ? ` <span class="note">— ${esc(splitPeople(it.who).join(', '))} 덕분에</span>` : ''}${
        it.why ? `<br><span class="why">${esc(it.why)}</span>` : ''}</li>`).join('')}</ul>${
        e.self ? `<p class="note">🙋 나에게: ${esc(e.self)}</p>` : ''}</div>`;
    }
    const reviews = Object.keys(state.reviews).filter((w) => monthKey(w) === m).sort()
      .map((w) => state.reviews[w]).filter((r) => r.note || r.deep || (r.thanksSent && r.thanksTo));
    if (reviews.length) {
      html += `<div class="reviews"><b>이 달의 회고</b><ul>${reviews.map((r) => `<li>${[
        r.note && esc(r.note),
        r.deep && `<span class="why">이게 없었다면: ${esc(r.deep)}</span>`,
        r.thanksSent && r.thanksTo && `<span class="why">💌 ${esc(r.thanksTo)}에게 마음을 전함</span>`,
      ].filter(Boolean).join('<br>')}</li>`).join('')}</ul></div>`;
    }
    html += '</section>';
  }
  $('#book').innerHTML = html;
}

$('#open-book').addEventListener('click', () => {
  renderBook();
  $('#book-view').hidden = false;
  $('#book-view').scrollTop = 0;
});
$('#close-book').addEventListener('click', () => { $('#book-view').hidden = true; });
$('#print-book').addEventListener('click', () => window.print());

// ---------- 회고: 공통 ----------
function topWords(texts) {
  const counts = new Map();
  texts.join(' ').split(/[\s.,!?~·…'"()[\]]+/).forEach((w) => {
    w = w.replace(PARTICLES, '');
    if (w.length < 2 || STOPWORDS.has(w) || /^\d+$/.test(w)) return;
    counts.set(w, (counts.get(w) || 0) + 1);
  });
  return [...counts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
}

function peopleCounts(entries) {
  const counts = new Map();
  entries.forEach((e) => e.items.forEach((it) => splitPeople(it.who).forEach((p) => counts.set(p, (counts.get(p) || 0) + 1))));
  return [...counts].sort((a, b) => b[1] - a[1]);
}

function periodSummary(dayKeys) {
  const written = dayKeys.filter((k) => hasContent(state.entries[k]));
  const items = written.flatMap((k) => state.entries[k].items.map((it, idx) => ({ ...normItem(it), idx, day: k })).filter((it) => it.what));
  const gains = written.map((k) => state.entries[k]).filter((e) => e.moodBefore !== null && e.moodAfter !== null)
    .map((e) => e.moodAfter - e.moodBefore);
  const avgGain = gains.length ? gains.reduce((a, b) => a + b, 0) / gains.length : null;
  return { written, items, avgGain };
}

function statsHtml(written, total, items, avgGain) {
  return `
    <div class="stat"><b>${written}/${total}</b><span>쓴 날</span></div>
    <div class="stat"><b>${items}</b><span>감사한 것</span></div>
    <div class="stat"><b>${avgGain === null ? '–' : (avgGain > 0 ? '+' : '') + avgGain.toFixed(1)}</b><span>평균 기분 변화</span></div>`;
}

function starList(items) {
  return `<div class="day"><ul>${items.map((it) => `<li><button class="star${it.starred ? ' on' : ''}" data-day="${it.day}" data-idx="${it.idx}" aria-label="별표">★</button>
    <div>${esc(it.what)}${itemTags(it)}<span class="why">${fmtDate(it.day)}${it.why ? ' · ' + esc(it.why) : ''}</span></div></li>`).join('')}</ul></div>`;
}

let reviewPeriod = 'week';
document.querySelector('#view-review .segmented').addEventListener('click', (ev) => {
  const p = ev.target.dataset.period;
  if (!p) return;
  flushReview();
  reviewPeriod = p;
  document.querySelectorAll('#view-review .seg').forEach((b) => b.classList.toggle('active', b.dataset.period === p));
  $('#review-week').hidden = p !== 'week';
  $('#review-month').hidden = p !== 'month';
  renderReview();
});
function renderReview() {
  if (reviewPeriod === 'week') renderWeek(); else renderMonth();
}

// ---------- 회고: 주간 ----------
let reviewWeek = weekStart(todayKey());
let weekItems = [];

function renderWeek() {
  const days = Array.from({ length: 7 }, (_, i) => addDays(reviewWeek, i));
  $('#week-label').textContent = `${fmtDate(reviewWeek)} – ${fmtDate(days[6])}`;
  $('#next-week').disabled = addDays(reviewWeek, 7) > todayKey();

  const { written, items, avgGain } = periodSummary(days);
  weekItems = items;
  $('#week-stats').innerHTML = statsHtml(written.length, 7, items.length, avgGain);
  $('#week-items').innerHTML = items.length ? starList(items) : '<p class="muted">이 주에는 기록이 없어요.</p>';

  const words = topWords(items.map((it) => `${it.what} ${it.why}`));
  $('#week-words').innerHTML = words.length
    ? words.map(([w, c]) => `<span class="chip">${esc(w)} ×${c}</span>`).join('')
    : '<span class="muted">두 번 이상 나온 단어가 아직 없어요.</span>';

  const r = state.reviews[reviewWeek] || {};
  // 별표한 항목을 먼저 보여 준다
  const ordered = [...items].sort((a, b) => Number(b.starred) - Number(a.starred));
  $('#deep-pick').innerHTML = '<option value="">깊이 쓸 항목 고르기</option>' +
    ordered.map((it) => `<option value="${it.day}|${it.idx}">${it.starred ? '⭐ ' : ''}${esc(it.what)}</option>`).join('');
  $('#deep-pick').value = r.deepPick && ordered.some((it) => `${it.day}|${it.idx}` === r.deepPick) ? r.deepPick : '';
  $('#deep-text').value = r.deep || '';

  const weekPeople = peopleCounts(written.map((k) => state.entries[k])).map(([p]) => p);
  $('#people-list').innerHTML = weekPeople.map((p) => `<option value="${esc(p)}">`).join('');
  $('#thanks-to').value = r.thanksTo || '';
  $('#thanks-to').placeholder = weekPeople.length ? `누구에게? (이번 주: ${weekPeople.slice(0, 3).join(', ')})` : '누구에게?';
  $('#thanks-msg').value = r.thanksMsg || '';
  $('#thanks-sent').checked = !!r.thanksSent;
  $('#week-note').value = r.note || '';
  $('#week-status').textContent = state.reviews[reviewWeek] ? '저장됨' : '';
}

let reviewTimer = null;
function saveReview() {
  reviewTimer = null;
  const r = {
    deepPick: $('#deep-pick').value,
    deep: $('#deep-text').value.trim(),
    thanksTo: $('#thanks-to').value.trim(),
    thanksMsg: $('#thanks-msg').value.trim(),
    thanksSent: $('#thanks-sent').checked,
    note: $('#week-note').value.trim(),
  };
  const empty = !r.deep && !r.thanksTo && !r.thanksMsg && !r.thanksSent && !r.note;
  const now = Date.now();
  if (empty) {
    if (state.reviews[reviewWeek]) { delete state.reviews[reviewWeek]; changed('review', reviewWeek, now); }
  } else {
    state.reviews[reviewWeek] = { ...r, updatedAt: now };
    changed('review', reviewWeek, now);
  }
  $('#week-status').textContent = persist() ? (empty ? '' : '저장됨') : '저장 실패';
}
function scheduleReviewSave() {
  $('#week-status').textContent = '작성 중…';
  clearTimeout(reviewTimer);
  reviewTimer = setTimeout(saveReview, 600);
}
function flushReview() {
  if (reviewTimer === null) return;
  clearTimeout(reviewTimer);
  saveReview();
}
['#deep-text', '#thanks-to', '#thanks-msg', '#week-note'].forEach((id) => $(id).addEventListener('input', scheduleReviewSave));
['#deep-pick', '#thanks-sent'].forEach((id) => $(id).addEventListener('change', scheduleReviewSave));

$('#deep-pick').addEventListener('change', () => {
  const [day, idx] = $('#deep-pick').value.split('|');
  const it = weekItems.find((x) => x.day === day && String(x.idx) === idx);
  if (it && !$('#deep-text').value.trim()) $('#deep-text').placeholder = `"${it.what}"이(가) 없었다면…`;
});

$('#send-thanks').addEventListener('click', async () => {
  const to = $('#thanks-to').value.trim();
  const msg = $('#thanks-msg').value.trim();
  if (!msg) { $('#thanks-msg').focus(); return; }
  const text = to ? `${to}에게,\n${msg}` : msg;
  try {
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
      $('#week-status').textContent = '메시지를 복사했어요. 메신저에 붙여 넣어 보내세요.';
    }
    $('#thanks-sent').checked = true;
    scheduleReviewSave();
  } catch (err) {
    if (err.name !== 'AbortError') $('#week-status').textContent = '공유하지 못했어요. 메시지를 직접 복사해 주세요.';
  }
});

$('#week-items').addEventListener('click', (ev) => {
  if (!ev.target.dataset.day) return;
  flushReview();
  toggleStar(ev.target.dataset.day, Number(ev.target.dataset.idx));
  renderWeek();
});
$('#prev-week').addEventListener('click', () => { flushReview(); reviewWeek = addDays(reviewWeek, -7); renderWeek(); });
$('#next-week').addEventListener('click', () => { flushReview(); reviewWeek = addDays(reviewWeek, 7); renderWeek(); });

// ---------- 회고: 월간 ----------
let reviewMonth = monthKey(todayKey());

function barRows(rows, max) {
  return rows.map(([label, n]) => `<div class="bar-row"><span>${label}</span><span class="bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span><span class="n">${n}</span></div>`).join('');
}

function renderMonth() {
  const [y, m] = reviewMonth.split('-').map(Number);
  $('#month-label').textContent = `${y}년 ${m}월`;
  $('#next-month').disabled = addMonths(reviewMonth, 1) > monthKey(todayKey());
  const daysInMonth = new Date(y, m, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => `${reviewMonth}-${pad(i + 1)}`);
  const { written, items, avgGain } = periodSummary(days);
  const elapsed = reviewMonth === monthKey(todayKey()) ? fromKey(todayKey()).getDate() : daysInMonth;
  $('#month-stats').innerHTML = statsHtml(written.length, elapsed, items.length, avgGain);

  const people = peopleCounts(written.map((k) => state.entries[k])).slice(0, 7);
  $('#month-people').innerHTML = people.length
    ? barRows(people.map(([p, n]) => [esc(p), n]), people[0][1])
    : '<p class="muted">"누구 덕분인가요?" 칸을 채우면 고마운 사람이 여기 모여요.</p>';

  const catCounts = CATEGORIES.map((c) => [`${c.icon} ${c.label}`, items.filter((it) => it.category === c.id).length]);
  const untagged = items.filter((it) => !catOf(it.category)).length;
  const maxCat = Math.max(1, ...catCounts.map(([, n]) => n));
  $('#month-cats').innerHTML = items.length
    ? barRows(catCounts, maxCat) + (untagged ? `<p class="muted small">범주를 고르지 않은 항목 ${untagged}개</p>` : '')
    : '<p class="muted">이 달에는 기록이 없어요.</p>';

  renderEffect(days);

  const stars = items.filter((it) => it.starred);
  $('#month-stars').innerHTML = stars.length ? starList(stars) : '<p class="muted">별표한 항목이 없어요.</p>';
}

$('#month-stars').addEventListener('click', (ev) => {
  if (!ev.target.dataset.day) return;
  toggleStar(ev.target.dataset.day, Number(ev.target.dataset.idx));
  renderMonth();
});
$('#prev-month').addEventListener('click', () => { reviewMonth = addMonths(reviewMonth, -1); renderMonth(); });
$('#next-month').addEventListener('click', () => { reviewMonth = addMonths(reviewMonth, 1); renderMonth(); });

// ---------- 사람 노트 ----------
// 사람마다 그 사람 덕분에 감사했던 순간을 날짜순으로 모은다
function momentsByPerson() {
  const map = new Map();
  Object.keys(state.entries).sort().forEach((day) => {
    state.entries[day].items.forEach((raw, idx) => {
      const it = normItem(raw);
      if (!it.what) return;
      splitPeople(it.who).forEach((p) => {
        if (!map.has(p)) map.set(p, []);
        map.get(p).push({ day, idx, what: it.what, why: it.why, starred: it.starred });
      });
    });
  });
  return map;
}

// 마지막으로 고마움을 전한 날: 편지를 보낸 날과 주간 회고에서 "전했어요"로 표시한 주 가운데 늦은 쪽
function lastThanked(name) {
  let last = state.people[name]?.lastThanked || '';
  for (const [week, r] of Object.entries(state.reviews)) {
    if (!r.thanksSent || !splitPeople(r.thanksTo).includes(name)) continue;
    const end = addDays(week, 6) < todayKey() ? addDays(week, 6) : todayKey();
    if (end > last) last = end;
  }
  return last;
}

let currentPerson = null;
let letterTone = 'casual';
let letterEdited = false;
let letterExcluded = new Set();

function renderPeople() {
  const map = momentsByPerson();
  if (currentPerson && !map.has(currentPerson)) currentPerson = null;
  $('#people-index').hidden = !!currentPerson;
  $('#person-detail').hidden = !currentPerson;
  if (currentPerson) { renderPerson(map.get(currentPerson)); return; }

  const t = todayKey();
  const people = [...map].sort((a, b) => b[1].length - a[1].length || (b[1].at(-1).day > a[1].at(-1).day ? 1 : -1));
  $('#people-cards').innerHTML = people.length ? people.map(([name, ms]) => {
    const thanked = lastThanked(name);
    // 여러 번 고마웠는데 한 달 넘게 마음을 전하지 않은 사람
    const due = ms.length >= 3 && (!thanked || daysBetween(thanked, t) > 30);
    return `<button class="card person-card" data-person="${esc(name)}">
      <span><b>${esc(name)}</b>
        <span class="meta">최근 ${fmtDate(ms.at(-1).day)}${thanked ? ` · 💌 ${fmtShort(thanked)}에 전함` : ''}</span>
        ${due ? '<span class="nudge-tag">고마움을 전해 볼까요?</span>' : ''}</span>
      <span class="count">${ms.length}번</span></button>`;
  }).join('') : '<p class="empty">아직 사람이 없어요. 오늘 탭에서 "누구 덕분인가요?"를 채워 보세요.</p>';
}

function buildLetter(name, moments) {
  if (!moments.length) return '';
  const n = moments.length;
  const lines = moments.map((m) => {
    const d = fromKey(m.day);
    return `· ${d.getMonth() + 1}월 ${d.getDate()}일 — ${m.what}${m.why ? ` (${m.why})` : ''}`;
  }).join('\n');
  if (letterTone === 'polite') {
    return `${name}님께,\n\n요즘 감사 일기를 쓰고 있는데, ${name}님 덕분에 감사했던 순간이 ${n > 1 ? `${n}번이나 있었어요. 그 순간들을 모아 보았어요.` : '있었어요. 그때 이야기를 꼭 전하고 싶었어요.'}\n\n${lines}\n\n덕분에 제 하루가 더 따뜻했어요. 진심으로 감사드립니다.`;
  }
  return `${name}에게,\n\n요즘 감사 일기를 쓰고 있는데, 네 덕분에 고마웠던 순간이 ${n > 1 ? `${n}번이나 있더라. 그 순간들을 모아 봤어.` : '있었어. 그때 이야기를 꼭 하고 싶었어.'}\n\n${lines}\n\n덕분에 내 하루가 더 따뜻했어. 정말 고마워.`;
}

function renderPerson(moments) {
  const name = currentPerson;
  const thanked = lastThanked(name);
  $('#person-name').textContent = name;
  $('#person-stats').innerHTML = `
    <div class="stat"><b>${moments.length}</b><span>감사한 순간</span></div>
    <div class="stat"><b>${daysBetween(moments[0].day, todayKey()) + 1}일</b><span>첫 기록부터</span></div>
    <div class="stat"><b>${thanked ? fmtShort(thanked) : '–'}</b><span>마지막으로 전한 날</span></div>`;
  $('#person-moments').innerHTML = [...moments].reverse().map((m) => {
    const id = `${m.day}|${m.idx}`;
    return `<label class="moment"><input type="checkbox" data-moment="${id}"${letterExcluded.has(id) ? '' : ' checked'}>
      <span>${m.starred ? '⭐ ' : ''}${esc(m.what)}<span class="why">${fmtDate(m.day)}${m.why ? ' · ' + esc(m.why) : ''}</span></span></label>`;
  }).join('');
  document.querySelectorAll('.tone .seg').forEach((b) => b.classList.toggle('active', b.dataset.tone === letterTone));
  if (!letterEdited) {
    $('#letter').value = buildLetter(name, moments.filter((m) => !letterExcluded.has(`${m.day}|${m.idx}`)));
    $('#letter-status').textContent = '';
  }
}

function refreshLetter() {
  if (letterEdited) {
    $('#letter-status').textContent = '직접 고친 편지는 그대로 두었어요. "다시 만들기"를 누르면 반영돼요.';
    renderPeople();
    return;
  }
  renderPeople();
}

$('#people-cards').addEventListener('click', (ev) => {
  const name = ev.target.closest('.person-card')?.dataset.person;
  if (!name) return;
  currentPerson = name;
  letterEdited = false;
  letterExcluded = new Set();
  renderPeople();
  window.scrollTo(0, 0);
});
$('#person-back').addEventListener('click', () => { currentPerson = null; renderPeople(); });
$('#person-moments').addEventListener('change', (ev) => {
  const id = ev.target.dataset.moment;
  if (!id) return;
  if (ev.target.checked) letterExcluded.delete(id); else letterExcluded.add(id);
  refreshLetter();
});
document.querySelector('.tone').addEventListener('click', (ev) => {
  const tone = ev.target.dataset.tone;
  if (!tone) return;
  letterTone = tone;
  refreshLetter();
});
$('#letter').addEventListener('input', () => { letterEdited = true; });
$('#regen-letter').addEventListener('click', () => { letterEdited = false; renderPeople(); });
$('#send-letter').addEventListener('click', async () => {
  const text = $('#letter').value.trim();
  if (!text) return;
  try {
    if (navigator.share) {
      await navigator.share({ text });
    } else {
      await navigator.clipboard.writeText(text);
    }
  } catch (err) {
    if (err.name !== 'AbortError') $('#letter-status').textContent = '공유하지 못했어요. 편지를 직접 복사해 주세요.';
    return;
  }
  const now = Date.now();
  state.people[currentPerson] = { ...state.people[currentPerson], lastThanked: todayKey(), updatedAt: now };
  persist();
  changed('person', currentPerson, now);
  renderPeople();
  $('#letter-status').textContent = navigator.share ? '마음을 전했어요 💌' : '편지를 복사했어요. 메신저에 붙여 넣어 보내세요 💌';
});

// ---------- 다시 찾아오는 감사 ----------
// years/months 전의 같은 날짜. 그 달에 없는 날(예: 2월 30일)이면 null
function shiftBack(k, { years = 0, months = 0 }) {
  const d = fromKey(k);
  const day = d.getDate();
  d.setDate(1);
  d.setFullYear(d.getFullYear() - years);
  d.setMonth(d.getMonth() - months);
  if (day > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) return null;
  d.setDate(day);
  return toKey(d);
}
const pickItem = (e) => {
  const items = e.items.map(normItem).filter((it) => it.what);
  return items.find((it) => it.starred) || items[0];
};
const hash = (str) => [...str].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

function memoryCandidates(today, hardDay) {
  const out = [];
  const add = (label, day, it) => {
    if (it && !out.some((m) => m.day === day && m.what === it.what)) out.push({ label, day, what: it.what, why: it.why });
  };
  // 일주일 넘게 지난 별표 항목. 날마다 순서가 바뀌도록 날짜로 섞는다
  const starred = [];
  for (const [day, e] of Object.entries(state.entries)) {
    if (daysBetween(day, today) < 7) continue;
    e.items.map(normItem).forEach((it) => { if (it.starred && it.what) starred.push([day, it]); });
  }
  starred.sort((a, b) => hash(today + a[0] + a[1].what) - hash(today + b[0] + b[1].what));
  const starLabel = hardDay ? '😮‍💨 힘든 날엔, 이런 날도 있었어요' : '⭐ 예전에 별표한 순간';

  if (hardDay) starred.forEach(([d, it]) => add(starLabel, d, it));
  for (const [shift, label] of [[{ years: 1 }, '📅 1년 전 오늘'], [{ months: 6 }, '📅 6개월 전 오늘'], [{ months: 1 }, '📅 한 달 전 오늘']]) {
    const d = shiftBack(today, shift);
    if (d && state.entries[d]) add(label, d, pickItem(state.entries[d]));
  }
  if (!hardDay) starred.forEach(([d, it]) => add(starLabel, d, it));
  return out;
}

let memoryIdx = 0;
function renderMemory() {
  const today = todayKey();
  const list = currentDate === today ? memoryCandidates(today, !!draft.hardDay) : [];
  $('#memory-card').hidden = !list.length;
  if (!list.length) return;
  const m = list[memoryIdx % list.length];
  const when = fromKey(m.day).getFullYear() === fromKey(today).getFullYear() ? fmtDate(m.day) : fmtDateY(m.day);
  $('#memory-label').textContent = `${m.label} · ${when}`;
  $('#memory-text').innerHTML = `${esc(m.what)}${m.why ? `<span class="why">${esc(m.why)}</span>` : ''}`;
  $('#memory-next').hidden = list.length < 2;
}
$('#memory-next').addEventListener('click', () => { memoryIdx++; renderMemory(); });

// ---------- 나만의 효과 리포트 ----------
const signed = (v) => (v > 0 ? '+' : '') + v.toFixed(1);
const hasMoods = (e) => hasContent(e) && e.moodBefore != null && e.moodAfter != null;

function moodEffect(entries) {
  const rated = entries.filter(hasMoods);
  const avg = (list) => (list.length ? list.reduce((a, e) => a + e.moodAfter - e.moodBefore, 0) / list.length : 0);
  const hard = rated.filter((e) => e.hardDay);
  return {
    n: rated.length,
    avg: avg(rated),
    upShare: rated.length ? rated.filter((e) => e.moodAfter > e.moodBefore).length / rated.length : 0,
    hardN: hard.length,
    hardAvg: avg(hard),
  };
}

function renderEffect(days) {
  const all = moodEffect(Object.values(state.entries));
  if (!all.n) {
    $('#effect-report').innerHTML = '<p class="muted">쓰기 전·후 기분을 함께 고르면, 감사 일기가 나에게 주는 효과를 숫자로 보여 드려요.</p>';
    return;
  }
  const month = moodEffect(days.map((k) => state.entries[k]).filter(Boolean));
  // 날마다 기분 변화를 가운데 선 기준 위(좋아짐)·아래(나빠짐) 막대로 그린다. 최대 ±4단계
  const bars = days.map((k) => {
    const e = state.entries[k];
    if (!e || !hasMoods(e)) return '<span class="none"></span>';
    const g = e.moodAfter - e.moodBefore;
    const h = Math.max((Math.abs(g) / 4) * 50, 2);
    const style = g >= 0 ? `bottom:50%;height:${h}%` : `top:50%;height:${h}%`;
    return `<span title="${fmtDate(k)} ${signed(g)}"><i class="${g < 0 ? 'neg' : ''}" style="${style}"></i></span>`;
  }).join('');
  $('#effect-report').innerHTML = `
    ${month.n ? `<div class="effect-big">${signed(month.avg)}</div>
      <p class="effect-line">이번 달, 감사 일기를 쓰고 나면 기분이 평균 <b>${signed(month.avg)}단계</b> 달라졌어요 (${month.n}일).</p>`
      : '<p class="effect-line">이번 달에는 아직 기분 기록이 없어요.</p>'}
    <p class="effect-line muted">전체 기간 평균 ${signed(all.avg)}단계 · 기분이 좋아진 날 ${Math.round(all.upShare * 100)}% (${all.n}일)</p>
    ${all.hardN >= 2 ? `<p class="effect-line muted">힘든 날에도 평균 ${signed(all.hardAvg)}단계 (${all.hardN}일)</p>` : ''}
    <div class="daybars" aria-hidden="true">${bars}</div>
    <div class="axis"><span>1일</span><span>${days.length}일</span></div>`;
}

// ---------- 설정 ----------
$('#item-count').value = String(state.settings.itemCount);
$('#item-count').addEventListener('change', (ev) => {
  flushSave();
  state.settings.itemCount = Number(ev.target.value);
  persist();
  draft = getDraft();
  renderWrite();
});
$('#morning-toggle').checked = !!state.settings.morning;
$('#morning-toggle').addEventListener('change', (ev) => {
  state.settings.morning = ev.target.checked;
  persist();
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
      if (!cur || (e.updatedAt || 0) > (cur.updatedAt || 0)) {
        state.entries[k] = { ...e, updatedAt: e.updatedAt || Date.now() };
        changed('entry', k, state.entries[k].updatedAt);
        added++;
      }
    }
    for (const [k, r] of Object.entries(data.reviews || {})) {
      const cur = state.reviews[k];
      if (!cur || (r.updatedAt || 0) > (cur.updatedAt || 0)) {
        state.reviews[k] = { ...r, updatedAt: r.updatedAt || Date.now() };
        changed('review', k, state.reviews[k].updatedAt);
      }
    }
    for (const [k, m] of Object.entries(data.people || {})) {
      const cur = state.people[k];
      if (!cur || (m.updatedAt || 0) > (cur.updatedAt || 0)) {
        state.people[k] = { ...m, updatedAt: m.updatedAt || Date.now() };
        changed('person', k, state.people[k].updatedAt);
      }
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

// ---------- 동기화 ----------
function renderSync() {
  const info = Sync.info();
  $('#sync-unconfigured').hidden = info.configured;
  $('#sync-signed-out').hidden = !info.configured || !!info.email;
  $('#sync-signed-in').hidden = !info.email;
  $('#sync-user').textContent = info.email || '';
  let detail;
  if (info.syncing) detail = '동기화 중…';
  else if (info.error) detail = `⚠️ ${info.error}`;
  else if (!info.online) detail = '오프라인: 연결되면 자동으로 동기화해요.';
  else if (info.lastSync) detail = `마지막 동기화 ${new Date(info.lastSync).toLocaleString('ko-KR')}`;
  else detail = '';
  if (info.pending && !info.syncing) detail += ` (보낼 변경 ${info.pending}건)`;
  $('#sync-detail').textContent = detail;

  const badge = $('#sync-badge');
  badge.hidden = !info.email;
  badge.textContent = info.syncing ? '⏳' : info.error ? '⚠️' : (!info.online || info.pending) ? '☁️…' : '☁️';
  badge.title = detail;

  const server = Sync.server();
  if (document.activeElement !== $('#server-url')) $('#server-url').value = server.url;
  if (document.activeElement !== $('#server-key')) $('#server-key').value = server.key;
}

async function authAction(fn, okMsg) {
  const email = $('#sync-email').value.trim();
  const password = $('#sync-password').value;
  if (!email || password.length < 6) { $('#sync-msg').textContent = '이메일과 6자 이상의 비밀번호를 입력해 주세요.'; return; }
  $('#sync-msg').textContent = '잠시만요…';
  try {
    const result = await fn(email, password);
    $('#sync-msg').textContent = result === 'confirm'
      ? '확인 메일을 보냈어요. 메일의 링크를 누른 뒤 여기서 로그인해 주세요.'
      : okMsg;
    $('#sync-password').value = '';
  } catch (err) {
    $('#sync-msg').textContent = `실패: ${err.message}`;
  }
  renderSync();
}
$('#sync-signed-out').addEventListener('submit', (ev) => { ev.preventDefault(); authAction(Sync.signIn, '로그인했어요. 기록을 동기화합니다.'); });
$('#sign-up').addEventListener('click', () => authAction(Sync.signUp, '가입하고 로그인했어요.'));
$('#sign-out').addEventListener('click', async () => {
  // 이 기기의 알림도 함께 끈다. 다른 사람이 이 기기로 로그인해도 내 기록으로 알림이 가지 않도록
  if (Push.isOn()) await Push.disable();
  await Sync.signOut();
  $('#sync-msg').textContent = '로그아웃했어요. 이 기기의 기록은 그대로 남아 있어요.';
  renderSync();
});
$('#sync-now').addEventListener('click', () => { flushSave(); flushReview(); Sync.syncNow(); });
$('#save-server').addEventListener('click', () => {
  Sync.setServer($('#server-url').value.trim(), $('#server-key').value.trim());
  $('#sync-msg').textContent = '서버 설정을 저장했어요.';
  renderSync();
});

Sync.init({
  getDoc: (kind, key) => state[COLLECTION[kind]][key] || null,
  localTs: (kind, key) => state[COLLECTION[kind]][key]?.updatedAt || 0,
  allDocs: () => Object.entries(COLLECTION).flatMap(([kind, coll]) =>
    Object.entries(state[coll]).map(([key, doc]) => ({ kind, key, ts: doc.updatedAt || Date.now() }))),
  apply(kind, key, doc) {
    const coll = state[COLLECTION[kind]];
    if (doc) coll[key] = doc; else delete coll[key];
  },
  // 다른 기기에서 받은 변경을 화면에 반영한다 (지금 고치는 중인 곳은 건드리지 않는다)
  afterApply(keys) {
    persist();
    renderStreak();
    const editingEntry = saveTimer !== null;
    const editingReview = reviewTimer !== null;
    if (!editingEntry && keys.includes(`entry|${currentDate}`)) { draft = getDraft(); renderWrite(); }
    const view = document.querySelector('.view.active').id;
    if (view === 'view-history') { renderOverview(); renderHistory(); }
    if (view === 'view-review' && !editingReview) renderReview();
    if (view === 'view-people' && !letterEdited) renderPeople();
  },
  onStatus: () => { renderSync(); Push.render(); },
});

Push.init({
  getPrefs: () => state.settings.notify,
  setPrefs(p) { state.settings.notify = p; persist(); },
});

// ---------- 설치와 소개 ----------
const appUrl = () => new URL('./', location.href).href;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installEvent = null;

function renderInstallBanner() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const show = !isStandalone() && !state.settings.installDismissed && (installEvent || ios);
  $('#install-banner').hidden = !show;
  if (!show) return;
  $('#install-text').textContent = installEvent
    ? '📲 앱으로 설치하면 홈 화면에서 바로 열고 알림도 받을 수 있어요.'
    : '📲 아래 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 쓰고 알림도 받을 수 있어요.';
  $('#install-btn').hidden = !installEvent;
}
// 크롬·엣지·안드로이드: 브라우저의 설치 창을 우리 버튼으로 띄운다
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  installEvent = ev;
  renderInstallBanner();
});
window.addEventListener('appinstalled', () => { installEvent = null; renderInstallBanner(); });
$('#install-btn').addEventListener('click', async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice.catch(() => {});
  installEvent = null;
  renderInstallBanner();
});
$('#install-close').addEventListener('click', () => {
  state.settings.installDismissed = true;
  persist();
  renderInstallBanner();
});

function renderShare() {
  if (typeof qrcode !== 'function' || $('#share-qr').dataset.url === appUrl()) return;
  const qr = qrcode(0, 'M');
  qr.addData(appUrl());
  qr.make();
  $('#share-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  $('#share-qr').dataset.url = appUrl();
}
$('#share-app').addEventListener('click', async () => {
  const text = '매일 감사한 일을 기록하는 "감사 일기" 앱이에요. 아이폰은 Safari로 열어 공유 → "홈 화면에 추가"를 누르면 앱처럼 쓸 수 있어요.';
  try {
    if (navigator.share) {
      await navigator.share({ title: '감사 일기', text, url: appUrl() });
    } else {
      await navigator.clipboard.writeText(`${text}\n${appUrl()}`);
      $('#share-msg').textContent = '링크를 복사했어요. 메신저에 붙여 넣어 보내세요.';
    }
  } catch (err) {
    if (err.name !== 'AbortError') $('#share-msg').textContent = `주소를 직접 알려 주세요: ${appUrl()}`;
  }
});

// ---------- 탭 ----------
function switchView(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  if (name === 'history') { renderOverview(); renderHistory(); }
  if (name === 'review') renderReview();
  if (name === 'write') { draft = getDraft(); renderWrite(); }
  if (name === 'settings') { renderSync(); renderShare(); }
  if (name === 'people') renderPeople();
}
document.querySelector('.tabs').addEventListener('click', (ev) => {
  const view = ev.target.dataset.view;
  if (!view) return;
  flushSave();
  flushReview();
  switchView(view);
});

function renderAll() {
  renderInstallBanner();
  renderStreak();
  renderWrite();
  renderSync();
}
function flushAll() { flushSave(); flushReview(); }
window.addEventListener('beforeunload', flushAll);
// 아이폰은 앱을 닫을 때 beforeunload가 오지 않을 수 있어 화면이 가려질 때도 저장한다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAll();
  Sync.syncNow();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// 브라우저가 저장 공간이 부족할 때 기록을 지우지 않도록 요청한다
navigator.storage?.persist?.().catch(() => {});

renderAll();
Sync.syncNow();

// 알림을 눌러 열었을 때 해당 화면으로 이동한다 (./?view=review 등)
const VIEWS = ['write', 'history', 'review', 'people', 'settings'];
const openView = (view) => { if (VIEWS.includes(view)) { flushAll(); switchView(view); } };
openView(new URLSearchParams(location.search).get('view'));
navigator.serviceWorker?.addEventListener('message', (ev) => {
  if (ev.data?.type === 'open-view') openView(ev.data.view);
});
