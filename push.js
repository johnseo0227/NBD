'use strict';

// 푸시 알림. 이 기기를 Supabase에 등록해 두면 서버(supabase/functions/send-reminders)가
// 정한 시각에 알림을 보낸다. 알림 내용이 내 기록에 따라 달라지므로 동기화 로그인이 필요하다.
const Push = (() => {
  const DEFAULTS = {
    daily: { on: true, time: '19:00' },
    review: { on: true, time: '20:00' },
    memory: { on: true, time: '08:30' },
  };

  let hooks = null;
  let subscribed = false;
  let busy = false;
  let message = '';
  let saveTimer = null;

  const $ = (sel) => document.querySelector(sel);
  const supported = () => location.protocol !== 'file:' &&
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const vapidKey = () => (window.JOURNAL_CONFIG || {}).vapidPublicKey || '';
  const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';

  function prefs() {
    const saved = hooks.getPrefs() || {};
    return Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, { ...d, ...(saved[k] || {}) }]));
  }

  function urlB64ToBytes(b64) {
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return Uint8Array.from(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  }

  async function currentSub() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function saveToServer(sub) {
    const { endpoint, keys } = sub.toJSON();
    await Sync.request('/rest/v1/push_subscriptions?on_conflict=endpoint', {
      method: 'POST',
      body: [{ endpoint, user_id: Sync.userId(), p256dh: keys.p256dh, auth: keys.auth, tz: timeZone(), prefs: prefs() }],
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }

  async function enable() {
    if (!Sync.info().email) {
      message = '먼저 위에서 동기화에 로그인해 주세요. 알림 내용이 내 기록을 바탕으로 만들어져요.';
      render();
      return;
    }
    if (!vapidKey()) {
      message = '알림 서버 키(vapidPublicKey)가 config.js에 아직 없어요.';
      render();
      return;
    }
    busy = true;
    render();
    try {
      // 아이폰은 버튼을 누른 그 순간에만 권한을 물을 수 있어서, 다른 await보다 먼저 부른다
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error(permission === 'denied'
          ? '알림이 차단되어 있어요. 기기 설정에서 이 앱의 알림을 허용해 주세요'
          : '알림 권한을 허용해야 해요');
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ||
        await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(vapidKey()) });
      await saveToServer(sub);
      subscribed = true;
      message = '알림을 켰어요. 정한 시각에 찾아갈게요.';
    } catch (err) {
      message = `알림을 켜지 못했어요: ${err.message}`;
    }
    busy = false;
    render();
  }

  async function disable() {
    busy = true;
    render();
    try {
      const sub = await currentSub();
      if (sub) {
        if (Sync.info().email) {
          try {
            await Sync.request(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' });
          } catch { /* 서버에서 못 지워도 구독을 끊으면 다음 발송 때 서버가 정리한다 */ }
        }
        await sub.unsubscribe();
      }
      subscribed = false;
      message = '알림을 껐어요.';
    } catch (err) {
      message = `알림을 끄지 못했어요: ${err.message}`;
    }
    busy = false;
    render();
  }

  async function test() {
    try {
      if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') {
        message = '알림 권한이 없어요.';
      } else {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification('감사 일기', { body: '알림이 잘 도착해요 🙌', icon: 'icons/icon-192.png', tag: 'test' });
        message = '테스트 알림을 보냈어요.';
      }
    } catch (err) {
      message = `테스트 알림을 보내지 못했어요: ${err.message}`;
    }
    render();
  }

  function onPrefsChange() {
    const p = {};
    for (const kind of Object.keys(DEFAULTS)) {
      p[kind] = { on: $(`#notify-prefs [data-kind=${kind}]`).checked, time: $(`#notify-prefs [data-time=${kind}]`).value || DEFAULTS[kind].time };
    }
    hooks.setPrefs(p);
    if (!subscribed || !Sync.info().email) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const sub = await currentSub();
        if (sub) await saveToServer(sub);
        message = '알림 설정을 저장했어요.';
      } catch (err) {
        message = `알림 설정을 저장하지 못했어요: ${err.message}`;
      }
      render();
    }, 800);
  }

  function render() {
    if (!hooks) return;
    let status;
    if (!supported()) {
      status = isIOS() && !standalone()
        ? '아이폰에서는 Safari 공유 버튼 → "홈 화면에 추가"로 설치한 앱에서만 알림을 받을 수 있어요.'
        : '이 브라우저에서는 알림을 받을 수 없어요.';
    } else if (Notification.permission === 'denied') {
      status = '알림이 차단되어 있어요. 기기나 브라우저 설정에서 이 앱의 알림을 허용해 주세요.';
    } else {
      status = subscribed ? '이 기기에서 알림을 받고 있어요.' : '알림이 꺼져 있어요.';
    }
    $('#notify-status').textContent = status;
    $('#notify-msg').textContent = message;

    const p = prefs();
    for (const kind of Object.keys(DEFAULTS)) {
      $(`#notify-prefs [data-kind=${kind}]`).checked = p[kind].on;
      $(`#notify-prefs [data-time=${kind}]`).value = p[kind].time;
    }
    const usable = supported() && Notification.permission !== 'denied';
    $('#notify-on').hidden = !usable || subscribed;
    $('#notify-off').hidden = !supported() || !subscribed;
    $('#notify-test').hidden = !supported() || Notification.permission !== 'granted';
    for (const b of ['#notify-on', '#notify-off', '#notify-test']) $(b).disabled = busy;
  }

  async function init(h) {
    hooks = h;
    $('#notify-on').addEventListener('click', enable);
    $('#notify-off').addEventListener('click', disable);
    $('#notify-test').addEventListener('click', test);
    $('#notify-prefs').addEventListener('change', onPrefsChange);
    render();
    try {
      const sub = await currentSub();
      subscribed = !!sub;
      // 시간대나 설정이 바뀌었을 수 있으니 열 때마다 서버 정보를 새로 고친다
      if (sub && Sync.info().email) saveToServer(sub).catch(() => {});
    } catch { /* 서비스 워커가 아직 준비되지 않음 */ }
    render();
  }

  return { init, disable, render, isOn: () => subscribed };
})();
