// 알림 보내기. supabase/cron.sql이 5분마다 이 함수를 부른다.
// 기기마다 정한 시각(현지 시간)이 되면 하루에 한 번씩 알림을 보낸다.
//   daily  : 매일 쓰기 알림. 그날 이미 썼으면 보내지 않는다
//   review : 일요일 회고 알림. 그 주 회고를 이미 했으면 보내지 않는다
//   memory : 1년·6개월·한 달 전 오늘, 또는 예전에 별표한 순간을 다시 보여 준다
import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import webpush from 'npm:web-push@3.6.7';

export type Kind = 'daily' | 'review' | 'memory';
export type Prefs = Partial<Record<Kind, { on?: boolean; time?: string }>>;
export interface Subscription {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  tz: string;
  prefs: Prefs;
  last_sent: Partial<Record<Kind, string>>;
}
interface Item { what?: string; why?: string; starred?: boolean }
interface Entry { items?: Item[] }
export interface Docs { entries: Record<string, Entry>; reviews: Record<string, unknown> }
export interface Payload { title: string; body: string; url: string; tag: string; badge?: number }

const DEFAULT_PREFS: Record<Kind, { on: boolean; time: string }> = {
  daily: { on: true, time: '19:00' },
  review: { on: true, time: '20:00' },
  memory: { on: true, time: '08:30' },
};
// 크론이 늦게 돌아도 놓치지 않도록, 정한 시각부터 이 시간 안이면 보낸다
const WINDOW_MIN = 30;

// ---------- 날짜 ----------
export function localNow(now: Date, tz: string) {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]));
  } catch {
    return localNow(now, 'Asia/Seoul');
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    sunday: parts.weekday === 'Sun',
  };
}
const toMinutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const keyToDate = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const dateToKey = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (k: string, n: number) => { const d = keyToDate(k); d.setUTCDate(d.getUTCDate() + n); return dateToKey(d); };
const daysBetween = (a: string, b: string) => Math.round((keyToDate(b).getTime() - keyToDate(a).getTime()) / 86_400_000);
const weekStart = (k: string) => addDays(k, -((keyToDate(k).getUTCDay() + 6) % 7));
function shiftBack(k: string, years: number, months: number): string | null {
  const d = keyToDate(k);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCMonth(d.getUTCMonth() - months);
  if (day > new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()) return null;
  d.setUTCDate(day);
  return dateToKey(d);
}
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const hasContent = (e?: Entry) => !!e?.items?.some((it) => it.what?.trim());

// ---------- 무엇을 보낼지 ----------
export function dueKinds(sub: Subscription, now: Date): Kind[] {
  const local = localNow(now, sub.tz);
  return (Object.keys(DEFAULT_PREFS) as Kind[]).filter((kind) => {
    const pref = { ...DEFAULT_PREFS[kind], ...(sub.prefs?.[kind] || {}) };
    if (!pref.on || sub.last_sent?.[kind] === local.date) return false;
    if (kind === 'review' && !local.sunday) return false;
    const start = toMinutes(pref.time);
    return local.minutes >= start && local.minutes < start + WINDOW_MIN;
  });
}

const DAILY_LINES = [
  '오늘 고마웠던 일 하나만 떠올려 볼까요?',
  '오늘 나를 웃게 한 작은 순간이 있었나요?',
  '오늘 누구 덕분에 하루가 조금 나아졌나요?',
  '하루를 닫기 전에, 감사 하나만 적어 볼까요?',
];

function streakUntil(entries: Docs['entries'], day: string) {
  let n = 0;
  while (hasContent(entries[day])) { n++; day = addDays(day, -1); }
  return n;
}

function memoryFor(entries: Docs['entries'], today: string): { title: string; item: Item } | null {
  const pick = (e: Entry) => {
    const items = (e.items || []).filter((it) => it.what?.trim());
    return items.find((it) => it.starred) || items[0];
  };
  for (const [years, months, title] of [[1, 0, '📅 1년 전 오늘'], [0, 6, '📅 6개월 전 오늘'], [0, 1, '📅 한 달 전 오늘']] as const) {
    const d = shiftBack(today, years, months);
    if (d && hasContent(entries[d])) return { title, item: pick(entries[d])! };
  }
  const starred: [string, Item][] = [];
  for (const [day, e] of Object.entries(entries)) {
    if (daysBetween(day, today) < 7) continue;
    for (const it of e.items || []) if (it.starred && it.what?.trim()) starred.push([day, it]);
  }
  if (!starred.length) return null;
  starred.sort((a, b) => hash(today + a[0] + a[1].what) - hash(today + b[0] + b[1].what));
  return { title: '⭐ 예전에 별표한 순간', item: starred[0][1] };
}

// 보낼 내용. 보낼 필요가 없으면(이미 썼거나 보여 줄 기억이 없으면) null
export function buildPayload(kind: Kind, docs: Docs, sub: Subscription, now: Date): Payload | null {
  const today = localNow(now, sub.tz).date;
  if (kind === 'daily') {
    if (hasContent(docs.entries[today])) return null;
    const streak = streakUntil(docs.entries, addDays(today, -1));
    const body = streak >= 2
      ? `🔥 ${streak}일째 이어 가는 중이에요. 오늘의 감사 하나만 남겨 볼까요?`
      : DAILY_LINES[Math.abs(hash(today)) % DAILY_LINES.length];
    return { title: '감사 일기', body, url: './?view=write', tag: 'daily', badge: 1 };
  }
  if (kind === 'review') {
    const week = weekStart(today);
    if (docs.reviews[week]) return null;
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d) => hasContent(docs.entries[d]));
    const count = days.reduce((n, d) => n + (docs.entries[d].items || []).filter((it) => it.what?.trim()).length, 0);
    const body = days.length
      ? `이번 주 ${days.length}일 동안 ${count}가지에 감사했어요. 마음에 남은 하나를 골라 보고, 고마운 사람에게 전해 볼까요?`
      : '한 주를 돌아보며 고마웠던 사람에게 마음을 전해 볼까요?';
    return { title: '일요일 회고 시간이에요', body, url: './?view=review', tag: 'review' };
  }
  const memory = memoryFor(docs.entries, today);
  if (!memory) return null;
  const { what, why } = memory.item;
  return { title: memory.title, body: why ? `${what} — ${why}` : what!, url: './?view=write', tag: 'memory' };
}

// ---------- 실행 ----------
export interface Deps {
  listSubscriptions(): Promise<Subscription[]>;
  loadDocs(userId: string): Promise<Docs>;
  markSent(endpoint: string, lastSent: Subscription['last_sent']): Promise<void>;
  removeSubscription(endpoint: string): Promise<void>;
  send(sub: Subscription, payload: Payload): Promise<void>;
}

export async function run(deps: Deps, now = new Date()) {
  const result = { sent: 0, skipped: 0, removed: 0, failed: 0 };
  const docsCache = new Map<string, Promise<Docs>>();
  for (const sub of await deps.listSubscriptions()) {
    const kinds = dueKinds(sub, now);
    if (!kinds.length) continue;
    if (!docsCache.has(sub.user_id)) docsCache.set(sub.user_id, deps.loadDocs(sub.user_id));
    const docs = await docsCache.get(sub.user_id)!;
    const lastSent = { ...sub.last_sent };
    const today = localNow(now, sub.tz).date;
    let gone = false;
    for (const kind of kinds) {
      const payload = buildPayload(kind, docs, sub, now);
      if (payload) {
        try {
          await deps.send(sub, payload);
          result.sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 구독이 끊긴 기기(앱 삭제, 권한 해제 등)는 정리한다
          if (status === 404 || status === 410) { gone = true; break; }
          console.error('push failed', status, (err as Error).message);
          result.failed++;
          continue;
        }
      } else {
        result.skipped++;
      }
      lastSent[kind] = today;
    }
    if (gone) {
      await deps.removeSubscription(sub.endpoint);
      result.removed++;
    } else {
      await deps.markSent(sub.endpoint, lastSent);
    }
  }
  return result;
}

// 설정 확인용: 등록된 모든 기기에 예시 알림을 지금 바로 한 번 보낸다
export const EXAMPLE: Payload = {
  title: '감사 일기 · 알림 예시',
  body: '매일 오후 7시에 이렇게 찾아올게요. 오늘 고마웠던 일 하나만 떠올려 볼까요?',
  url: './?view=write',
  tag: 'example',
};

export async function sendExample(deps: Deps) {
  const result = { sent: 0, removed: 0, failed: 0 };
  for (const sub of await deps.listSubscriptions()) {
    try {
      await deps.send(sub, EXAMPLE);
      result.sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await deps.removeSubscription(sub.endpoint);
        result.removed++;
      } else {
        console.error('push failed', status, (err as Error).message);
        result.failed++;
      }
    }
  }
  return result;
}

function realDeps(): Deps {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  return {
    async listSubscriptions() {
      const { data, error } = await db.from('push_subscriptions').select('endpoint,user_id,p256dh,auth,tz,prefs,last_sent');
      if (error) throw error;
      return data as Subscription[];
    },
    async loadDocs(userId) {
      const docs: Docs = { entries: {}, reviews: {} };
      for (let from = 0; ; from += 1000) {
        const { data, error } = await db.from('journal_docs').select('kind,key,data')
          .eq('user_id', userId).eq('deleted', false).in('kind', ['entry', 'review'])
          .order('key').range(from, from + 999);
        if (error) throw error;
        for (const row of data) (row.kind === 'entry' ? docs.entries : docs.reviews)[row.key] = row.data;
        if (data.length < 1000) break;
      }
      return docs;
    },
    async markSent(endpoint, lastSent) {
      const { error } = await db.from('push_subscriptions').update({ last_sent: lastSent }).eq('endpoint', endpoint);
      if (error) throw error;
    },
    async removeSubscription(endpoint) {
      await db.from('push_subscriptions').delete().eq('endpoint', endpoint);
    },
    async send(sub, payload) {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3 * 3600, urgency: 'normal' },
      );
    },
  };
}

// 테스트에서 불러올 때는 서버를 띄우지 않는다
if (!Deno.env.get('SEND_REMINDERS_TEST')) {
  Deno.serve(async (req) => {
    if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
      return new Response('forbidden', { status: 403 });
    }
    // 크론은 빈 본문으로 부르고, {"test": true}로 부르면 예시 알림을 보낸다
    const body = await req.json().catch(() => ({}));
    try {
      return Response.json(body?.test ? await sendExample(realDeps()) : await run(realDeps()));
    } catch (err) {
      console.error(err);
      return Response.json({ error: (err as Error).message }, { status: 500 });
    }
  });
}
