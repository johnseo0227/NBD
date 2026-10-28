// 동기화 서버(Supabase) 설정. README의 "동기화 설정"을 따라 값을 채운다.
// anon(publishable) 키는 공개되어도 되는 키다. 각 사용자는 자기 기록만 읽고 쓸 수 있도록 서버 규칙(RLS)이 막는다.
window.JOURNAL_CONFIG = {
  supabaseUrl: 'https://wptioiwipurpuouddgcr.supabase.co',
  supabaseKey: 'sb_publishable_FvN5Z3fKmslH7U0aLup7aA_jkYP6y5Y',
  // 푸시 알림용 VAPID 공개키 (README의 "푸시 알림 설정" 참고)
  vapidPublicKey: '',
};
