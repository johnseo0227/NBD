-- 감사 일기 동기화용 표. Supabase 대시보드 → SQL Editor에서 한 번 실행한다.

create table if not exists public.journal_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('entry', 'review', 'person')),
  key        text        not null,          -- 일기: 날짜(YYYY-MM-DD), 회고: 그 주 월요일 날짜, 사람: 이름
  data       jsonb,                         -- 삭제된 문서는 null
  deleted    boolean     not null default false,
  updated_at bigint      not null,          -- 기기에서 마지막으로 고친 시각 (ms)
  synced_at  timestamptz not null default clock_timestamp(),  -- 서버에 들어온 시각: 기기가 새 변경을 받아 갈 기준
  primary key (user_id, kind, key)
);

-- 예전 버전으로 표를 만들었어도 다시 실행하면 허용 종류가 갱신되도록 한다
alter table public.journal_docs drop constraint if exists journal_docs_kind_check;
alter table public.journal_docs add constraint journal_docs_kind_check check (kind in ('entry', 'review', 'person'));

create index if not exists journal_docs_user_synced on public.journal_docs (user_id, synced_at);

-- 같은 문서가 두 기기에서 고쳐졌다면 더 나중에 고친 쪽을 남긴다.
-- 늦게 도착했지만 더 오래된 수정은 무시된다.
create or replace function public.journal_docs_keep_newest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists journal_docs_keep_newest on public.journal_docs;
create trigger journal_docs_keep_newest
  before insert or update on public.journal_docs
  for each row execute function public.journal_docs_keep_newest();

-- 각 사용자는 자기 기록만 읽고 쓸 수 있다.
alter table public.journal_docs enable row level security;

drop policy if exists "own docs: select" on public.journal_docs;
drop policy if exists "own docs: insert" on public.journal_docs;
drop policy if exists "own docs: update" on public.journal_docs;
drop policy if exists "own docs: delete" on public.journal_docs;

create policy "own docs: select" on public.journal_docs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own docs: insert" on public.journal_docs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own docs: update" on public.journal_docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own docs: delete" on public.journal_docs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.journal_docs to authenticated;
