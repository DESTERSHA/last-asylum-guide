-- Исправления к supabase_alliance.sql (20.11.2026). Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
--  1) Сравнение ников мягче: не учитываются тег в скобках, подчёркивания, точки, значки и смайлы
--     («mateeooooo(FOX)» = «mateeooooo», «AnnaValo_PHX» = «AnnaValoPHX», «Ella» = «Ella§»).
--  2) Лидер, которого отметил администратор, подтверждён этой отметкой (в своём альянсе) — ранг в чате обычный.
--  3) Ранг — как у трекера, с должностью у R4 («R4 · Diplomat»); код R1–R5 остаётся для правил (кто что ставит).
-- Можно выполнять повторно.

-- 1) ключ ника: похожие русские буквы → латинские; убрать [тег]/(тег); оставить только буквы и цифры
create or replace function public.nick_key(n text) returns text
language sql immutable as $$
  with a as (select translate(coalesce(n, ''), 'АВЕЁКМНОРСТУХаеёкорсухіІ', 'ABEEKMHOPCTYXaeekopcyxiI') as s),
       b as (select coalesce(nullif(btrim(regexp_replace(s, '[\[\(\{][^\]\)\}]*[\]\)\}]', '', 'g')), ''), s) as s from a)
  select nullif(regexp_replace(translate(lower(s), 'авеёкмнорстухі', 'abeekmhopctyxi'), '[^0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ؀-ۿ฀-๿぀-ヿ一-鿿가-힯]', '', 'g'), '') from b
$$;

-- составы — по новому ключу
update public.roster set nkey = public.nick_key(nick);

-- 3) ранг как у трекера (с должностью)
alter table public.roster add column if not exists rank_label text;
alter table public.profiles add column if not exists rank_label text;

create or replace function public.push_roster(p_token text, p_done bigint[], p_top bigint[], p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_token is null or p_token <> (select token from public.robot_secret where id = 1) then raise exception 'нет прав'; end if;
  if coalesce(jsonb_array_length(p_rows), 0) = 0 then return 0; end if;  -- пустой ответ не стирает составы
  delete from public.roster where al_id = any(p_done) or not (al_id = any(p_top));
  insert into public.roster (al_id, al_abbr, uid, nick, nkey, rank, rank_label, ranks_known, updated_at)
  select x.al_id, x.al_abbr, x.uid, x.nick, public.nick_key(x.nick),
         case when left(btrim(x.rank), 2) in ('R1', 'R2', 'R3', 'R4', 'R5') then left(btrim(x.rank), 2) end,
         case when left(btrim(x.rank), 2) in ('R1', 'R2', 'R3', 'R4', 'R5') then coalesce(nullif(btrim(x.rank_label), ''), btrim(x.rank)) end,
         coalesce(x.ranks_known, false), now()
    from jsonb_to_recordset(p_rows) as x(al_id bigint, al_abbr text, uid bigint, nick text, rank text, rank_label text, ranks_known boolean)
  on conflict (al_id, uid) do update set al_abbr = excluded.al_abbr, nick = excluded.nick, nkey = excluded.nkey,
     rank = excluded.rank, rank_label = excluded.rank_label, ranks_known = excluded.ranks_known, updated_at = excluded.updated_at;
  get diagnostics n = row_count;
  update public.profiles set nick = nick where nick is not null;  -- пересчитать альянс, ранг и подтверждения у всех
  return n;
end $$;

drop function if exists public.roster_lookup(text);
create function public.roster_lookup(p_nick text)
returns table(al_abbr text, rank text, rank_label text, ranks_known boolean, nick text)
language sql stable security definer set search_path = public as $$
  select r.al_abbr, r.rank, r.rank_label, r.ranks_known, r.nick from public.roster r where r.nkey = public.nick_key(p_nick)
   order by (r.rank is not null) desc, r.updated_at desc limit 1
$$;

drop function if exists public.alliance_members(bigint);
create function public.alliance_members(p_al bigint default null)
returns table(al_id bigint, al_abbr text, ranks_known boolean, uid bigint, game_nick text, tracker_rank text, tracker_label text,
              user_id uuid, site_nick text, game_rank text, rank_label text, rank_src text, al_ok boolean, al_ok_at timestamptz, dup int)
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
    select r.al_id, r.al_abbr, r.ranks_known, r.uid, r.nick, r.rank, r.rank_label, p.id, p.nick, p.game_rank, p.rank_label, p.rank_src,
           coalesce(p.al_ok, false), p.al_ok_at,
           (select count(*)::int from public.profiles q where public.nick_key(q.nick) = r.nkey)
      from public.roster r left join public.profiles p on public.nick_key(p.nick) = r.nkey and p.al_id = r.al_id
     where r.al_id = a
     order by (p.id is null), coalesce(r.rank, p.game_rank) desc nulls last, lower(r.nick);
end $$;

drop function if exists public.list_users5();
create function public.list_users5()
returns table(id uuid, email text, nick text, game_rank text, rank_label text, al_abbr text, al_ok boolean, rank_src text, leader_al bigint, leader_al_abbr text,
              verified boolean, editor boolean, leader boolean, vote_banned boolean, moderator boolean, chat_banned boolean, sub_until timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return query select p.id, p.email, p.nick, p.game_rank, p.rank_label, p.al_abbr, p.al_ok, p.rank_src, p.leader_al, p.leader_al_abbr,
                      p.verified, p.editor, p.leader, p.vote_banned, p.moderator, p.chat_banned, p.sub_until, p.created_at
                 from public.profiles p order by p.created_at desc;
end $$;

drop function if exists public.chat_members3();
create function public.chat_members3()
returns table(user_id uuid, nick text, game_rank text, rank_label text, al_abbr text, al_ok boolean, leader boolean, moderator boolean, muted_until timestamptz, banned boolean, kicked boolean)
language plpgsql security definer set search_path = public as $$
declare m boolean := public.is_moderator();
begin
  if auth.uid() is null or coalesce((select chat_kicked from public.profiles where id = auth.uid()), false) then raise exception 'нет доступа'; end if;
  return query
    select p.id, p.nick, p.game_rank, p.rank_label, p.al_abbr, p.al_ok, p.leader, (p.moderator or lower(p.email) in (select lower(a.email) from public.admins a)),
           case when m then p.chat_muted_until end, case when m then p.chat_banned end, case when m then p.chat_kicked end
      from public.profiles p
     where p.nick is not null and (m or not p.chat_kicked)
     order by lower(p.nick);
end $$;

grant execute on function public.roster_lookup(text) to anon, authenticated;
grant execute on function public.alliance_members(bigint), public.list_users5(), public.chat_members3() to authenticated;

-- 2) пересчёт профиля (как раньше) + лидер, отмеченный администратором, подтверждён в своём альянсе
create or replace function public.profile_alliance() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.roster;
begin
  select * into r from public.roster x where x.nkey = public.nick_key(new.nick)
   order by (x.rank is not null) desc, x.updated_at desc limit 1;
  new.al_id := r.al_id; new.al_abbr := r.al_abbr;  -- не найден — пусто
  if tg_op = 'UPDATE' and new.nick is distinct from old.nick then new.al_ok := false; end if;
  if not new.leader then new.leader_al := null; new.leader_al_abbr := null; end if;
  if new.leader and new.leader_al is null and new.al_id is not null then new.leader_al := new.al_id; new.leader_al_abbr := new.al_abbr; end if;
  -- отметка «Лидер» от администратора = подтверждение (если ник найден в альянсе этого лидера)
  if new.leader and new.leader_al is not null and new.al_id = new.leader_al and not new.al_ok then
    new.al_ok := true; new.al_ok_al := new.al_id; new.al_ok_at := now();
    new.al_ok_by := case when public.is_admin() then auth.uid() end;  -- кто отметил «Лидер» (сам лидер — не автор)
    insert into public.alliance_log (user_id, nick, al_id, al_abbr, action, rank, by_id, by_nick)
    values (new.id, new.nick, new.al_id, new.al_abbr, 'leader_ok', r.rank, new.al_ok_by, (select p.nick from public.profiles p where p.id = new.al_ok_by));
  end if;
  if new.al_ok and (new.al_id is null or new.al_ok_al is distinct from new.al_id) then new.al_ok := false; end if;
  if not new.al_ok then new.al_ok_al := null; new.al_ok_by := null; new.al_ok_at := null; end if;
  if tg_op = 'UPDATE' and old.al_ok and not new.al_ok and coalesce(current_setting('la.manual', true), '') <> '1' then
    insert into public.alliance_log (user_id, nick, al_id, al_abbr, action, rank)
    values (new.id, new.nick, old.al_ok_al, old.al_abbr, 'auto_off', old.game_rank);
  end if;
  if r.rank is not null then new.game_rank := r.rank; new.rank_label := coalesce(r.rank_label, r.rank); new.rank_src := 'tracker';
  elsif new.rank_src = 'leader' and new.al_ok then new.rank_label := new.game_rank;  -- ранг от лидера (альянс без окна) остаётся, пока подтверждён
  else new.game_rank := null; new.rank_label := null; new.rank_src := null; end if;
  return new;
end $$;

-- пересчитать всех сейчас
update public.profiles set nick = nick where nick is not null;
