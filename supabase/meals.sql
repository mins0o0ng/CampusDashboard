-- 캠퍼스 보드 — Supabase 스키마 (식단 공유)
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체 붙여넣기 → Run. 여러 번 실행해도 안전(idempotent).
-- (투표용 schema.sql 과 별개 파일. 둘 다 실행해 두면 된다.)
--
-- 설계
-- - 누구나 식단을 올리고 고칠 수 있다(익명 로그인 포함). 대신
--     · 모든 변경을 meal_history 에 남긴다 → 장난·실수는 이전 값으로 되돌릴 수 있다.
--     · 입력 범위를 제한한다(날짜 최근 30일~60일 뒤, 끼니·메뉴 개수·글자 수 상한).
-- - 읽기: get_meals(시작일) — 그 날짜 이후 식단 + 식당 이름.
-- - 쓰기: publish_meals(항목들, 식당이름들) — 빈 끼니 목록([])은 그 날·식당 식단 삭제.

/* ============================ 테이블 ============================ */

create table if not exists public.meals (
  day         date not null,
  shop        int  not null check (shop between 1 and 9999),   -- 생협 shop_sqno
  sections    jsonb not null,                                  -- [{meal, items:[{name, price, time}]}]
  updated_by  uuid not null,
  updated_at  timestamptz not null default now(),
  primary key (day, shop)
);

create table if not exists public.meal_shops (
  code        int primary key check (code between 1 and 9999),
  name        text not null check (char_length(name) between 1 and 40),
  updated_at  timestamptz not null default now()
);

-- 변경 기록(되돌리기용). sections 가 null 이면 그때 삭제된 것.
create table if not exists public.meal_history (
  id          bigserial primary key,
  day         date not null,
  shop        int  not null,
  sections    jsonb,
  user_id     uuid not null,
  changed_at  timestamptz not null default now()
);
create index if not exists meal_history_day_shop_idx on public.meal_history (day, shop, changed_at desc);

/* ============================ 권한(RLS) ============================ */

alter table public.meals        enable row level security;
alter table public.meal_shops   enable row level security;
alter table public.meal_history enable row level security;

drop policy if exists meals_read on public.meals;
create policy meals_read on public.meals for select using (true);

drop policy if exists meal_shops_read on public.meal_shops;
create policy meal_shops_read on public.meal_shops for select using (true);
-- meal_history: 정책 없음 = 클라이언트에서 읽기·쓰기 불가(대시보드에서만 확인)

revoke insert, update, delete on public.meals, public.meal_shops, public.meal_history from anon, authenticated;

/* ============================ 검증 ============================ */

-- 끼니 목록 형식 검사: 최대 3끼(조식/중식/석식 중복 없음), 끼니당 메뉴 1~40개, 메뉴명 1~80자, 가격 0~100000
create or replace function public._valid_meal_sections(s jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(s) = 'array'
     and jsonb_array_length(s) <= 3
     and (select count(distinct sec->>'meal') = count(*) from jsonb_array_elements(s) sec)
     and not exists (
       select 1 from jsonb_array_elements(s) sec
       where sec->>'meal' not in ('조식', '중식', '석식')
          or jsonb_typeof(sec->'items') <> 'array'
          or jsonb_array_length(sec->'items') not between 1 and 40
          or exists (
            select 1 from jsonb_array_elements(sec->'items') it
            where char_length(coalesce(it->>'name', '')) not between 1 and 80
               or (it ? 'price' and jsonb_typeof(it->'price') not in ('null', 'number'))
               or (jsonb_typeof(it->'price') = 'number' and (it->>'price')::numeric not between 0 and 100000)
               or char_length(coalesce(it->>'time', '')) > 20
          )
     );
$$;

/* ============================ 함수(RPC) ============================ */

-- p_from 이후 식단과 식당 이름. 앱의 { days: {날짜: {식당: 끼니[]}}, shops: {코드: 이름} } 모양.
create or replace function public.get_meals(p_from date default current_date - 35)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_object_agg(d.day, d.shops)
      from (
        select day::text as day, jsonb_object_agg(shop::text, sections) as shops
        from meals where day >= p_from
        group by day
      ) d), '{}'::jsonb),
    'shops', coalesce((select jsonb_object_agg(code::text, name) from meal_shops), '{}'::jsonb)
  );
$$;

-- p_entries: [{"day":"2026-10-12","shop":35,"sections":[...]}, ...]  (sections = [] 이면 삭제)
-- p_shops  : {"35":"정보센터식당", ...}  (새로 발견한 식당 이름)
create or replace function public.publish_meals(p_entries jsonb, p_shops jsonb default '{}'::jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  e     jsonb;
  v_day date;
  v_shop int;
  v_sec jsonb;
  n     int := 0;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.' using errcode = '28000'; end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 300 then
    raise exception '한 번에 300건까지 올릴 수 있습니다.' using errcode = '22023';
  end if;

  for e in select * from jsonb_array_elements(p_entries) loop
    v_day  := (e->>'day')::date;
    v_shop := (e->>'shop')::int;
    v_sec  := e->'sections';
    if v_day not between current_date - 30 and current_date + 60 then
      raise exception '날짜 %: 최근 30일부터 60일 뒤까지만 올릴 수 있습니다.', v_day using errcode = '22023';
    end if;
    if v_shop is null or v_shop not between 1 and 9999 then
      raise exception '잘못된 식당 코드: %', e->>'shop' using errcode = '22023';
    end if;
    if v_sec is null or not _valid_meal_sections(v_sec) then
      raise exception '% 식단 형식이 올바르지 않습니다(끼니 최대 3개, 끼니당 메뉴 1~40개, 메뉴명 80자 이내).', v_day using errcode = '22023';
    end if;

    if jsonb_array_length(v_sec) = 0 then
      delete from meals where day = v_day and shop = v_shop;
      if found then insert into meal_history (day, shop, sections, user_id) values (v_day, v_shop, null, v_uid); end if;
    else
      insert into meals (day, shop, sections, updated_by, updated_at)
      values (v_day, v_shop, v_sec, v_uid, now())
      on conflict (day, shop) do update
        set sections = excluded.sections, updated_by = excluded.updated_by, updated_at = now()
        where meals.sections is distinct from excluded.sections;
      if found then insert into meal_history (day, shop, sections, user_id) values (v_day, v_shop, v_sec, v_uid); end if;
    end if;
    n := n + 1;
  end loop;

  -- 식당 이름: 형식이 맞는 것만 저장
  insert into meal_shops (code, name, updated_at)
  select k::int, btrim(v), now()
  from jsonb_each_text(coalesce(p_shops, '{}'::jsonb)) as t(k, v)
  where k ~ '^\d{1,4}$' and k::int between 1 and 9999 and char_length(btrim(v)) between 1 and 40
  on conflict (code) do update set name = excluded.name, updated_at = now()
    where meal_shops.name is distinct from excluded.name;

  return n;
end;
$$;

revoke all on function public.publish_meals(jsonb, jsonb) from public;
grant execute on function public.get_meals(date) to anon, authenticated;
grant execute on function public.publish_meals(jsonb, jsonb) to authenticated;

/* ============================ 되돌리기(대시보드에서 관리자용) ============================
-- 특정 날짜·식당의 변경 기록 보기:
--   select changed_at, user_id, sections from meal_history where day = '2026-10-12' and shop = 35 order by changed_at desc;
-- 어떤 사용자가 바꾼 것만 보기:
--   select * from meal_history where user_id = '...' order by changed_at desc;
-- 특정 기록(id)으로 되돌리기:
--   update meals m set sections = h.sections, updated_at = now()
--   from meal_history h where h.id = 123 and m.day = h.day and m.shop = h.shop;
*/
