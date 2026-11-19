-- Исправления к supabase_alliance.sql (20.11.2026). Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
--  1) Сравнение ников мягче: не учитываются тег в скобках, подчёркивания, точки, значки и смайлы
--     («mateeooooo(FOX)» = «mateeooooo», «AnnaValo_PHX» = «AnnaValoPHX», «Ella» = «Ella§»).
--  2) Лидер, которого отметил администратор, подтверждён этой отметкой (в своём альянсе) — ранг в чате обычный.

-- 1) ключ ника: похожие русские буквы → латинские; убрать [тег]/(тег); оставить только буквы и цифры
create or replace function public.nick_key(n text) returns text
language sql immutable as $$
  with a as (select translate(coalesce(n, ''), 'АВЕЁКМНОРСТУХаеёкорсухіІ', 'ABEEKMHOPCTYXaeekopcyxiI') as s),
       b as (select coalesce(nullif(btrim(regexp_replace(s, '[\[\(\{][^\]\)\}]*[\]\)\}]', '', 'g')), ''), s) as s from a)
  select nullif(regexp_replace(lower(s), '[^0-9A-Za-zÀ-ɏͰ-ϿЀ-ӿ؀-ۿ฀-๿぀-ヿ一-鿿가-힯]', '', 'g'), '') from b
$$;

-- составы — по новому ключу
update public.roster set nkey = public.nick_key(nick);

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
  if r.rank is not null then new.game_rank := r.rank; new.rank_src := 'tracker';
  elsif new.rank_src = 'leader' and new.al_ok then null;  -- ранг от лидера (альянс без окна) остаётся, пока подтверждён
  else new.game_rank := null; new.rank_src := null; end if;
  return new;
end $$;

-- пересчитать всех сейчас
update public.profiles set nick = nick where nick is not null;
