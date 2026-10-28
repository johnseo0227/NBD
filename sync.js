'use strict';

// Supabase를 통한 기기 간 동기화.
// 날짜별 일기와 주간 회고를 문서 하나씩으로 올리고, 같은 문서는 더 나중에 수정된 쪽이 이긴다.
// 서버 쪽 표와 규칙은 supabase/schema.sql 참고.
const Sync = (() => {
  const KEY = 'gratitude-journal-sync';
  const PAGE = 500;
  // 거의 동시에 저장된 변경을 놓치지 않도록, 마지막으로 받은 시점보다 조금 앞부터 다시 받는다
  const OVERLAP_MS = 10_000;

  let s = load();
  let hooks = null;
  let timer = null;
  let running = false;
  let again = false;

  function load() {
    const empty = { session: null, cursor: null, dirty: {}, server: { url: '', key: '' }, lastSync: null, error: null };
    try {
      return { ...empty, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch {
      return empty;
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* 저장 공간이 없으면 다음 실행 때 다시 동기화한다 */ }
  }
  const status = () => hooks?.onStatus();

  function server() {
    const c = window.JOURNAL_CONFIG || {};
    return {
      url: (s.server.url || c.supabaseUrl || '').trim().replace(/\/+$/, ''),
      key: (s.server.key || c.supabaseKey || '').trim(),
    };
  }
  const configured = () => { const { url, key } = server(); return !!(url && key); };

  async function api(path, { method = 'GET', body, auth = true, headers = {}, retried = false } = {}) {
    const { url, key } = server();
    const h = { apikey: key, 'Content-Type': 'application/json', ...headers };
    if (auth) h.Authorization = `Bearer ${await accessToken()}`;
    let res;
    try {
      res = await fetch(url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error('서버에 연결하지 못했어요');
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* 본문이 JSON이 아님 */ }
    // 기기 시계가 어긋나 토큰이 먼저 만료된 경우: 한 번 갱신하고 다시 시도한다
    if (res.status === 401 && auth && !retried && s.session) {
      s.session.expires_at = 0;
      return api(path, { method, body, auth, headers, retried: true });
    }
    if (!res.ok) {
      const err = new Error(json?.msg || json?.error_description || json?.message || json?.error || `오류 ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  // ---------- 인증 ----------
  function setSession(j) {
    s.session = {
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
      user: { id: j.user.id, email: j.user.email },
    };
    save();
  }

  async function accessToken() {
    if (!s.session) throw new Error('로그인이 필요해요');
    if (Date.now() / 1000 > s.session.expires_at - 60) {
      try {
        setSession(await api('/auth/v1/token?grant_type=refresh_token', {
          method: 'POST', auth: false, body: { refresh_token: s.session.refresh_token },
        }));
      } catch (err) {
        // 갱신 토큰이 만료되었거나 취소됨: 다시 로그인해야 한다
        if (err.status === 400 || err.status === 401) {
          s.session = null;
          save();
          throw new Error('로그인이 만료되었어요. 다시 로그인해 주세요');
        }
        throw err;
      }
    }
    return s.session.access_token;
  }

  function afterLogin() {
    // 이 기기에 있던 기록도 모두 올려서 계정의 기록과 합친다
    s.cursor = null;
    s.error = null;
    for (const { kind, key, ts } of hooks.allDocs()) {
      const k = `${kind}|${key}`;
      s.dirty[k] = Math.max(s.dirty[k] || 0, ts);
    }
    save();
    syncNow();
  }

  async function signIn(email, password) {
    setSession(await api('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } }));
    afterLogin();
    return 'in';
  }

  async function signUp(email, password) {
    const j = await api('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } });
    if (j?.access_token) {
      setSession(j);
      afterLogin();
      return 'in';
    }
    return 'confirm';
  }

  async function signOut() {
    if (s.session) {
      try { await api('/auth/v1/logout', { method: 'POST' }); } catch { /* 이미 만료된 세션이어도 로컬에서는 로그아웃한다 */ }
    }
    clearTimeout(timer);
    s.session = null;
    s.cursor = null;
    s.dirty = {};
    s.lastSync = null;
    s.error = null;
    save();
    status();
  }

  // ---------- 동기화 ----------
  function markDirty(kind, key, ts) {
    const k = `${kind}|${key}`;
    s.dirty[k] = Math.max(s.dirty[k] || 0, ts);
    save();
    schedule();
    status();
  }

  function schedule(delay = 1500) {
    if (!s.session || !configured()) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, delay);
  }

  async function syncNow() {
    if (!s.session || !configured()) { status(); return; }
    if (!navigator.onLine) { status(); return; }
    if (running) { again = true; return; }
    clearTimeout(timer);
    running = true;
    status();
    try {
      await pull();
      await push();
      s.lastSync = Date.now();
      s.error = null;
    } catch (err) {
      s.error = err.message;
    } finally {
      running = false;
      save();
      status();
      if (again) { again = false; schedule(300); }
    }
  }

  async function pull() {
    const applied = [];
    let since = s.cursor ? new Date(Date.parse(s.cursor) - OVERLAP_MS).toISOString() : null;
    for (;;) {
      let q = `/rest/v1/journal_docs?select=kind,key,data,deleted,updated_at,synced_at&order=synced_at.asc&limit=${PAGE}`;
      if (since) q += `&synced_at=gt.${encodeURIComponent(since)}`;
      const rows = await api(q);
      for (const row of rows) {
        const k = `${row.kind}|${row.key}`;
        const local = Math.max(hooks.localTs(row.kind, row.key), s.dirty[k] || 0);
        if (row.updated_at > local) {
          hooks.apply(row.kind, row.key, row.deleted ? null : { ...row.data, updatedAt: row.updated_at });
          delete s.dirty[k];
          applied.push(k);
        }
        s.cursor = row.synced_at;
      }
      if (rows.length < PAGE) break;
      since = rows[rows.length - 1].synced_at;
    }
    if (applied.length) hooks.afterApply(applied);
  }

  async function push() {
    const pending = Object.entries(s.dirty);
    if (!pending.length) return;
    const userId = s.session.user.id;
    for (let i = 0; i < pending.length; i += 200) {
      const chunk = pending.slice(i, i + 200);
      const rows = chunk.map(([k, ts]) => {
        const sep = k.indexOf('|');
        const kind = k.slice(0, sep);
        const key = k.slice(sep + 1);
        const doc = hooks.getDoc(kind, key);
        if (!doc) return { user_id: userId, kind, key, data: null, deleted: true, updated_at: ts };
        const { updatedAt, ...data } = doc;
        return { user_id: userId, kind, key, data, deleted: false, updated_at: updatedAt || ts };
      });
      await api('/rest/v1/journal_docs?on_conflict=user_id,kind,key', {
        method: 'POST',
        body: rows,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
      // 올리는 동안 다시 수정된 문서는 대기열에 남겨 둔다
      for (const [k, ts] of chunk) if (s.dirty[k] === ts) delete s.dirty[k];
    }
  }

  function setServer(url, key) {
    s.server = { url, key };
    save();
  }

  function info() {
    return {
      configured: configured(),
      email: s.session?.user.email || null,
      syncing: running,
      lastSync: s.lastSync,
      error: s.error,
      pending: Object.keys(s.dirty).length,
      online: navigator.onLine,
    };
  }

  function init(h) {
    hooks = h;
    window.addEventListener('online', () => syncNow());
    window.addEventListener('offline', status);
  }

  return {
    init, signIn, signUp, signOut, syncNow, markDirty, setServer, server, info,
    request: api,
    userId: () => s.session?.user.id || null,
  };
})();
