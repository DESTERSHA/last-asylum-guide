-- Альянс и ранг из трекера + подтверждение лидером альянса (решение 20.11.2026).
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
--
-- Как работает:
--  * робот каждые ~30 мин присылает составы топ-30 альянсов из трекера (ник, ранг в игре) — таблица roster;
--  * альянс и ранг человека сайт находит сам по его игровому нику (без учёта регистра, пробелов и похожих
--    русских/латинских букв: в игре «DESTЕRSHA» с русской Е, на сайте «DESTERSHA» латиницей — это один ник);
--  * пока лидер альянса не подтвердил «это наш» — ранг в чате серый («не подтверждён»);
--  * где трекер знает ранги (альянсы с окном альянса) — ранг из игры, его не меняет никто;
--    где не знает — ранг ставит лидер при подтверждении (R1–R4), R5 — только администратор;
--  * лидер привязан к своему альянсу (подставляется при отметке «Лидер», поменять может только администратор);
--  * сменил ник или пропал из состава альянса по трекеру — подтверждение слетает (и пишется в журнал).

-- 1) ключ ника: без регистра, пробелов и с заменой похожих русских букв на латинские
create or replace function public.nick_key(n text) returns text
language sql immutable as $$
  select nullif(lower(regexp_replace(translate(coalesce(n, ''), 'АВЕЁКМНОРСТУХаеёкорсухіІ', 'ABEEKMHOPCTYXaeekopcyxiI'), '\s', '', 'g')), '')
$$;

-- 2) составы альянсов по трекеру (присылает робот)
create table if not exists public.roster (
  al_id bigint not null,
  al_abbr text,
  uid bigint not null,
  nick text,
  nkey text,
  rank text,
  ranks_known boolean not null default false,  -- у альянса есть окно альянса: трекер знает ранги
  updated_at timestamptz not null default now(),
  primary key (al_id, uid)
);
create index if not exists roster_nkey on public.roster (nkey);
alter table public.roster enable row level security;  -- напрямую не читается, только через функции ниже

-- 3) поля профиля
alter table public.profiles add column if not exists al_id bigint;            -- альянс по трекеру (по нику)
alter table public.profiles add column if not exists al_abbr text;
alter table public.profiles add column if not exists rank_src text;           -- откуда ранг: tracker | leader
alter table public.profiles add column if not exists al_ok boolean not null default false;  -- лидер (или админ) подтвердил «это наш»
alter table public.profiles add column if not exists al_ok_al bigint;         -- в каком альянсе подтверждён
alter table public.profiles add column if not exists al_ok_by uuid;
alter table public.profiles add column if not exists al_ok_at timestamptz;
alter table public.profiles add column if not exists leader_al bigint;        -- альянс лидера (закреплён)
alter table public.profiles add column if not exists leader_al_abbr text;

-- 4) журнал подтверждений: кто, кому, что, когда
create table if not exists public.alliance_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  nick text,
  al_id bigint,
  al_abbr text,
  action text not null,   -- confirm | unconfirm | auto_off (ник сменён / ушёл из альянса)
  rank text,
  by_id uuid,
  by_nick text,
  at timestamptz not null default now()
);
create index if not exists alliance_log_at on public.alliance_log (at desc);
alter table public.alliance_log enable row level security;
drop policy if exists "alliance log read" on public.alliance_log;
create policy "alliance log read" on public.alliance_log for select to authenticated
  using (public.is_admin() or al_id = (select p.leader_al from public.profiles p where p.id = auth.uid() and p.leader));

-- 5) при любом изменении профиля — альянс и ранг пересчитываются по составам трекера
create or replace function public.profile_alliance() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.roster;
begin
  select * into r from public.roster x where x.nkey = public.nick_key(new.nick)
   order by (x.rank is not null) desc, x.updated_at desc limit 1;
  new.al_id := r.al_id; new.al_abbr := r.al_abbr;  -- не найден — пусто
  if tg_op = 'UPDATE' and new.nick is distinct from old.nick then new.al_ok := false; end if;
  if new.al_ok and (new.al_id is null or new.al_ok_al is distinct from new.al_id) then new.al_ok := false; end if;
  if not new.al_ok then new.al_ok_al := null; new.al_ok_by := null; new.al_ok_at := null; end if;
  if tg_op = 'UPDATE' and old.al_ok and not new.al_ok and coalesce(current_setting('la.manual', true), '') <> '1' then
    insert into public.alliance_log (user_id, nick, al_id, al_abbr, action, rank)
    values (new.id, new.nick, old.al_ok_al, old.al_abbr, 'auto_off', old.game_rank);
  end if;
  if r.rank is not null then new.game_rank := r.rank; new.rank_src := 'tracker';
  elsif new.rank_src = 'leader' and new.al_ok then null;  -- ранг от лидера (альянс без окна) остаётся, пока подтверждён
  else new.game_rank := null; new.rank_src := null; end if;
  if new.leader and new.leader_al is null and new.al_id is not null then new.leader_al := new.al_id; new.leader_al_abbr := new.al_abbr; end if;
  if not new.leader then new.leader_al := null; new.leader_al_abbr := null; end if;
  return new;
end $$;
drop trigger if exists profile_alliance on public.profiles;
create trigger profile_alliance before insert or update on public.profiles for each row execute function public.profile_alliance();

-- 6) робот присылает составы (пароль робота — тот же, что для вступлений/выходов)
create or replace function public.push_roster(p_token text, p_done bigint[], p_top bigint[], p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_token is null or p_token <> (select token from public.robot_secret where id = 1) then raise exception 'нет прав'; end if;
  if coalesce(jsonb_array_length(p_rows), 0) = 0 then return 0; end if;  -- пустой ответ не стирает составы
  delete from public.roster where al_id = any(p_done) or not (al_id = any(p_top));
  insert into public.roster (al_id, al_abbr, uid, nick, nkey, rank, ranks_known, updated_at)
  select x.al_id, x.al_abbr, x.uid, x.nick, public.nick_key(x.nick),
         case when x.rank in ('R1', 'R2', 'R3', 'R4', 'R5') then x.rank end, coalesce(x.ranks_known, false), now()
    from jsonb_to_recordset(p_rows) as x(al_id bigint, al_abbr text, uid bigint, nick text, rank text, ranks_known boolean)
  on conflict (al_id, uid) do update set al_abbr = excluded.al_abbr, nick = excluded.nick, nkey = excluded.nkey,
     rank = excluded.rank, ranks_known = excluded.ranks_known, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  update public.profiles set nick = nick where nick is not null;  -- пересчитать альянс, ранг и подтверждения у всех
  return n;
end $$;

-- 7) подсказка при регистрации и в кабинете: «найден: [SLAV] · R3»
create or replace function public.roster_lookup(p_nick text)
returns table(al_abbr text, rank text, ranks_known boolean, nick text)
language sql stable security definer set search_path = public as $$
  select r.al_abbr, r.rank, r.ranks_known, r.nick from public.roster r where r.nkey = public.nick_key(p_nick)
   order by (r.rank is not null) desc, r.updated_at desc limit 1
$$;

-- 8) «Мой альянс»: весь состав по трекеру и кто из них есть на сайте (лидер — свой альянс, админ — любой)
create or replace function public.alliance_members(p_al bigint default null)
returns table(al_id bigint, al_abbr text, ranks_known boolean, uid bigint, game_nick text, tracker_rank text,
              user_id uuid, site_nick text, game_rank text, rank_src text, al_ok boolean, al_ok_at timestamptz, dup int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me public.profiles; a bigint;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'нужно войти'; end if;
  if public.is_admin() then a := coalesce(p_al, me.leader_al, me.al_id);
  elsif me.leader and me.leader_al is not null then a := me.leader_al;
  else raise exception 'раздел только для лидеров альянсов'; end if;
  return query
    select r.al_id, r.al_abbr, r.ranks_known, r.uid, r.nick, r.rank, p.id, p.nick, p.game_rank, p.rank_src, coalesce(p.al_ok, false), p.al_ok_at,
           (select count(*)::int from public.profiles q where public.nick_key(q.nick) = r.nkey)
      from public.roster r left join public.profiles p on public.nick_key(p.nick) = r.nkey and p.al_id = r.al_id
     where r.al_id = a
     order by (p.id is null), coalesce(r.rank, p.game_rank) desc nulls last, lower(r.nick);
end $$;

-- 9) подтвердить / снять подтверждение (и ранг — только у альянсов, где трекер рангов не знает)
create or replace function public.alliance_confirm(p_user uuid, p_on boolean, p_rank text default null) returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare me public.profiles; t public.profiles; adm boolean := public.is_admin(); trank text; d int; nr text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'нужно войти'; end if;
  select * into t from public.profiles where id = p_user;
  if t.id is null then raise exception 'пользователь не найден'; end if;
  if t.al_id is null then raise exception 'ник этого человека не найден в составах альянсов трекера'; end if;
  if not adm then
    if not me.leader or me.leader_al is null then raise exception 'подтверждать могут только лидеры альянсов'; end if;
    if t.al_id <> me.leader_al then raise exception 'этот человек не из вашего альянса'; end if;
    if t.id = me.id then raise exception 'себя подтвердить нельзя — это делает администратор'; end if;
    select count(*) into d from public.profiles q where public.nick_key(q.nick) = public.nick_key(t.nick);
    if d > 1 then raise exception 'этот ник указан у нескольких аккаунтов — подтвердить может только администратор'; end if;
  end if;
  select r.rank into trank from public.roster r where r.al_id = t.al_id and r.nkey = public.nick_key(t.nick)
   order by (r.rank is not null) desc limit 1;
  if p_rank is not null then
    if p_rank not in ('R1', 'R2', 'R3', 'R4', 'R5') then raise exception 'ранг — от R1 до R5'; end if;
    if trank is not null then raise exception 'ранг этого человека берётся из игры (трекер) — менять его нельзя'; end if;
    if p_rank = 'R5' and not adm then raise exception 'R5 ставит только администратор'; end if;
  end if;
  perform set_config('la.manual', '1', true);
  if p_on then
    nr := case when trank is null then coalesce(p_rank, case when t.rank_src = 'leader' then t.game_rank end) end;
    update public.profiles set al_ok = true, al_ok_al = t.al_id, al_ok_by = me.id, al_ok_at = now(),
           game_rank = case when nr is not null then nr else game_rank end,
           rank_src = case when nr is not null then 'leader' else rank_src end
     where id = t.id;
  else
    update public.profiles set al_ok = false where id = t.id;
  end if;
  insert into public.alliance_log (user_id, nick, al_id, al_abbr, action, rank, by_id, by_nick)
  values (t.id, t.nick, t.al_id, t.al_abbr, case when p_on then 'confirm' else 'unconfirm' end, coalesce(trank, nr), me.id, me.nick);
end $$;

-- 10) администратор: поменять альянс лидера; список альянсов для выбора
create or replace function public.set_leader_al(p_user uuid, p_al bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  if not exists (select 1 from public.profiles where id = p_user and leader) then raise exception 'сначала отметьте «Лидер»'; end if;
  update public.profiles set leader_al = p_al, leader_al_abbr = (select r.al_abbr from public.roster r where r.al_id = p_al limit 1) where id = p_user;
end $$;

create or replace function public.roster_alliances()
returns table(al_id bigint, al_abbr text, ranks_known boolean, members int)
language sql stable security definer set search_path = public as $$
  select r.al_id, max(r.al_abbr), bool_or(r.ranks_known), count(*)::int from public.roster r group by r.al_id order by max(r.al_abbr)
$$;

-- 11) ранг руками больше не указывается (берётся из трекера или от лидера)
create or replace function public.set_my_rank(p_rank text) returns void
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'ранг теперь берётся из трекера автоматически по игровому нику';
end $$;

-- 12) списки с альянсом и подтверждением: админ «Пользователи» и участники чата
create or replace function public.list_users5()
returns table(id uuid, email text, nick text, game_rank text, al_abbr text, al_ok boolean, rank_src text, leader_al bigint, leader_al_abbr text,
              verified boolean, editor boolean, leader boolean, vote_banned boolean, moderator boolean, chat_banned boolean, sub_until timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return query select p.id, p.email, p.nick, p.game_rank, p.al_abbr, p.al_ok, p.rank_src, p.leader_al, p.leader_al_abbr,
                      p.verified, p.editor, p.leader, p.vote_banned, p.moderator, p.chat_banned, p.sub_until, p.created_at
                 from public.profiles p order by p.created_at desc;
end $$;

create or replace function public.chat_members3()
returns table(user_id uuid, nick text, game_rank text, al_abbr text, al_ok boolean, leader boolean, moderator boolean, muted_until timestamptz, banned boolean, kicked boolean)
language plpgsql security definer set search_path = public as $$
declare m boolean := public.is_moderator();
begin
  if auth.uid() is null or coalesce((select chat_kicked from public.profiles where id = auth.uid()), false) then raise exception 'нет доступа'; end if;
  return query
    select p.id, p.nick, p.game_rank, p.al_abbr, p.al_ok, p.leader, (p.moderator or lower(p.email) in (select lower(a.email) from public.admins a)),
           case when m then p.chat_muted_until end, case when m then p.chat_banned end, case when m then p.chat_kicked end
      from public.profiles p
     where p.nick is not null and (m or not p.chat_kicked)
     order by lower(p.nick);
end $$;

grant execute on function public.push_roster(text, bigint[], bigint[], jsonb), public.roster_lookup(text) to anon, authenticated;
grant execute on function public.alliance_members(bigint), public.alliance_confirm(uuid, boolean, text), public.set_leader_al(uuid, bigint),
  public.roster_alliances(), public.list_users5(), public.chat_members3() to authenticated;

-- 13) пересчитать всех сейчас (до первой отправки робота ранги пусты; робот пришлёт составы в течение ~10 мин)
update public.profiles set nick = nick where nick is not null;
