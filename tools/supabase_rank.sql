-- Ранг в игре (R1–R5): человек указывает сам в кабинете. Виден в чате (список участников) и админу в «Пользователях».
alter table public.profiles add column if not exists game_rank text check (game_rank in ('R1', 'R2', 'R3', 'R4', 'R5'));

create or replace function public.set_my_rank(p_rank text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  if p_rank is not null and p_rank not in ('R1', 'R2', 'R3', 'R4', 'R5') then raise exception 'ранг — от R1 до R5'; end if;
  update public.profiles set game_rank = p_rank where id = auth.uid();
end $$;

create or replace function public.list_users4()
returns table(id uuid, email text, nick text, game_rank text, verified boolean, editor boolean, leader boolean, vote_banned boolean,
              moderator boolean, chat_banned boolean, sub_until timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return query select p.id, p.email, p.nick, p.game_rank, p.verified, p.editor, p.leader, p.vote_banned, p.moderator, p.chat_banned, p.sub_until, p.created_at
                 from public.profiles p order by p.created_at desc;
end $$;

create or replace function public.chat_members2()
returns table(user_id uuid, nick text, game_rank text, leader boolean, moderator boolean, muted_until timestamptz, banned boolean, kicked boolean)
language plpgsql security definer set search_path = public as $$
declare m boolean := public.is_moderator();
begin
  if auth.uid() is null or coalesce((select chat_kicked from public.profiles where id = auth.uid()), false) then raise exception 'нет доступа'; end if;
  return query
    select p.id, p.nick, p.game_rank, p.leader, (p.moderator or lower(p.email) in (select lower(a.email) from public.admins a)),
           case when m then p.chat_muted_until end, case when m then p.chat_banned end, case when m then p.chat_kicked end
      from public.profiles p
     where p.nick is not null and (m or not p.chat_kicked)
     order by lower(p.nick);
end $$;

grant execute on function public.set_my_rank(text), public.list_users4(), public.chat_members2() to authenticated;
