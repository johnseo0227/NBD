-- 5분마다 send-reminders 함수를 불러 알림 보낼 시각이 된 기기에 알림을 보낸다.
-- README의 "푸시 알림 설정"에서 함수를 배포한 뒤, 아래 두 값을 바꿔서 SQL Editor에서 한 번 실행한다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 프로젝트 주소와, 함수 비밀값 CRON_SECRET에 넣은 것과 같은 값
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<CRON_SECRET 값>', 'cron_secret');

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
