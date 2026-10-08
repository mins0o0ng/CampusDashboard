-- 캠퍼스 보드 — Supabase 스키마 (투표 공유)
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전(idempotent).
--
-- 설계
-- - 읽기: 누구나 투표 목록·집계를 볼 수 있다(get_polls).
-- - 쓰기: 테이블에 직접 쓰는 권한은 주지 않고, 규칙을 검사하는 함수(RPC)로만 바꾼다.
--     cast_vote   : 마감·선택지 유효성·단일/복수 선택·1인 1회 참여 검사
--     cancel_vote : 마감 전 내 투표 취소(다시 투표 가능)
--     create_poll : 만든 사람이 복수 선택 허용 여부를 정한다
--     delete_poll : 만든 사람만 삭제
-- - 사용자 식별은 Supabase Auth(auth.uid()). 지금은 익명 로그인 → 브라우저당 1명.
--   학교 이메일 인증으로 바꾸면 같은 규칙이 '사람당 1명'이 된다.

create extension if not exists pgcrypto;

/* ============================ 테이블 ============================ */

create table if not exists public.polls (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 80),
  owner_name  text not null check (char_length(owner_name) between 1 and 40), -- 화면에 보이는 주최(학생회, 이름 등)
  total       int  not null default 0 check (total >= 0),                     -- 대상 인원(0 = 미지정)
  deadline    date not null,
  multiple    boolean not null default false,                                 -- 복수 선택 허용
  created_by  uuid not null,                                                  -- auth.uid()
  created_at  timestamptz not null default now()
);

create table if not exists public.poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.polls(id) on delete cascade,
  label    text not null check (char_length(label) between 1 and 60),
  seq      int  not null,
  unique (poll_id, seq)
);

-- 한 사람이 같은 선택지에 두 번 투표할 수 없다. 단일/복수 선택 제한은 cast_vote 가 검사한다.
create table if not exists public.votes (
  poll_id    uuid not null references public.polls(id) on delete cascade,
  option_id  uuid not null references public.poll_options(id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option_id)
);
create index if not exists votes_poll_idx on public.votes (poll_id);

/* ============================ 권한(RLS) ============================ */
-- 직접 쓰기는 막고(정책 없음 = 거부), 읽기만 연다. 표(votes)는 개인 기록이라 본인 것만.

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.votes        enable row level security;

drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select using (true);

drop policy if exists options_read on public.poll_options;
create policy options_read on public.poll_options for select using (true);

drop policy if exists votes_read_own on public.votes;
create policy votes_read_own on public.votes for select using (user_id = auth.uid());

revoke insert, update, delete on public.polls, public.poll_options, public.votes from anon, authenticated;

/* ============================ 함수(RPC) ============================ */

-- 투표 목록 + 선택지별 득표 + 참여 인원 + 내가 고른 선택지. 앱의 Poll 타입과 같은 모양(JSON).
create or replace function public.get_polls()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(p.obj order by p.created_at desc), '[]'::jsonb)
  from (
    select
      pl.created_at,
      jsonb_build_object(
        'id', pl.id,
        'title', pl.title,
        'owner', pl.owner_name,
        'total', pl.total,
        'deadline', pl.deadline,
        'multiple', pl.multiple,
        'mine', coalesce(pl.created_by = auth.uid(), false),
        'voters', (select count(distinct v.user_id) from votes v where v.poll_id = pl.id),
        'votedOptionIds', coalesce(
          (select jsonb_agg(v.option_id) from votes v where v.poll_id = pl.id and v.user_id = auth.uid()),
          '[]'::jsonb),
        'options', coalesce(
          (select jsonb_agg(jsonb_build_object(
                    'id', o.id,
                    'label', o.label,
                    'votes', (select count(*) from votes v where v.option_id = o.id))
                  order by o.seq)
             from poll_options o where o.poll_id = pl.id),
          '[]'::jsonb)
      ) as obj
    from polls pl
  ) p;
$$;

create or replace function public.create_poll(
  p_title text, p_owner text, p_options text[], p_deadline date, p_multiple boolean, p_total int default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_opts text[];
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode = '28000'; end if;
  select array_agg(btrim(x)) into v_opts from unnest(p_options) as x where btrim(x) <> '';
  if coalesce(array_length(v_opts, 1), 0) not between 2 and 8 then
    raise exception '선택지는 2~8개여야 합니다.' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(v_opts) x) <> array_length(v_opts, 1) then
    raise exception '같은 선택지가 있습니다.' using errcode = '22023';
  end if;
  if p_deadline < current_date then
    raise exception '마감일이 이미 지났습니다.' using errcode = '22023';
  end if;

  insert into polls (title, owner_name, total, deadline, multiple, created_by)
  values (btrim(p_title), btrim(p_owner), greatest(coalesce(p_total, 0), 0), p_deadline, coalesce(p_multiple, false), v_uid)
  returning id into v_id;

  insert into poll_options (poll_id, label, seq)
  select v_id, label, ord::int from unnest(v_opts) with ordinality as t(label, ord);
  return v_id;
end;
$$;

create or replace function public.cast_vote(p_poll uuid, p_options uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_poll polls%rowtype;
  v_ids  uuid[];
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode = '28000'; end if;
  -- 같은 사람이 동시에 두 번 누르는 경우를 막기 위해 투표 행을 잠근다.
  select * into v_poll from polls where id = p_poll for update;
  if not found then raise exception '투표를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if v_poll.deadline < current_date then raise exception '마감된 투표입니다.' using errcode = '22023'; end if;

  select array_agg(distinct x) into v_ids from unnest(p_options) x;
  if coalesce(array_length(v_ids, 1), 0) = 0 then raise exception '선택지를 골라 주세요.' using errcode = '22023'; end if;
  if array_length(v_ids, 1) > 1 and not v_poll.multiple then
    raise exception '복수 선택이 허용되지 않은 투표입니다.' using errcode = '22023';
  end if;
  if (select count(*) from poll_options where poll_id = p_poll and id = any(v_ids)) <> array_length(v_ids, 1) then
    raise exception '존재하지 않는 선택지입니다.' using errcode = '22023';
  end if;
  if exists (select 1 from votes where poll_id = p_poll and user_id = v_uid) then
    raise exception '이미 투표했습니다. 취소 후 다시 투표하세요.' using errcode = '23505';
  end if;

  insert into votes (poll_id, option_id, user_id) select p_poll, x, v_uid from unnest(v_ids) x;
end;
$$;

create or replace function public.cancel_vote(p_poll uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deadline date;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode = '28000'; end if;
  select deadline into v_deadline from polls where id = p_poll;
  if not found then raise exception '투표를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if v_deadline < current_date then raise exception '마감된 투표는 취소할 수 없습니다.' using errcode = '22023'; end if;
  delete from votes where poll_id = p_poll and user_id = v_uid;
  if not found then raise exception '취소할 투표가 없습니다.' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.delete_poll(p_poll uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from polls where id = p_poll and created_by = auth.uid();
  if not found then raise exception '내가 만든 투표만 삭제할 수 있습니다.' using errcode = '42501'; end if;
end;
$$;

-- 함수 실행 권한: 로그인(익명 포함)한 사용자만 쓰기 함수 실행. 목록은 누구나.
revoke all on function public.create_poll(text, text, text[], date, boolean, int) from public;
revoke all on function public.cast_vote(uuid, uuid[]) from public;
revoke all on function public.cancel_vote(uuid) from public;
revoke all on function public.delete_poll(uuid) from public;
grant execute on function public.get_polls() to anon, authenticated;
grant execute on function public.create_poll(text, text, text[], date, boolean, int) to authenticated;
grant execute on function public.cast_vote(uuid, uuid[]) to authenticated;
grant execute on function public.cancel_vote(uuid) to authenticated;
grant execute on function public.delete_poll(uuid) to authenticated;
