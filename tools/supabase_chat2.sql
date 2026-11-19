-- Чат, часть 2: временный мут, исключение из чата, список участников, ответы на сообщения, избранное.
-- Выполнить один раз после supabase_chat.sql: Supabase → SQL Editor → вставить всё → Run.

alter table public.profiles add column if not exists chat_muted_until timestamptz;            -- мут до этого времени (не может писать)
alter table public.profiles add column if not exists chat_kicked boolean not null default false; -- исключён: не видит чат и не пишет
alter table public.chat_messages add column if not exists reply_to bigint references public.chat_messages(id) on delete set null; -- ответ на сообщение

-- проверка при отправке: + исключён / мут
create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr public.profiles; last_t timestamptz;
begin
  if tg_op = 'INSERT' then
    select * into pr from public.profiles where id = auth.uid();
    if pr.id is null then raise exception 'нужно войти'; end if;
    if pr.nick is null then raise exception 'сначала укажите игровой ник'; end if;
    if pr.chat_kicked then raise exception 'вы исключены из чата'; end if;
    if pr.chat_banned then raise exception 'вам запрещено писать в чат'; end if;
    if pr.chat_muted_until is not null and pr.chat_muted_until > now() then
      raise exception 'мут до % (МСК)', to_char(pr.chat_muted_until at time zone 'Europe/Moscow', 'DD.MM HH24:MI');
    end if;
    if new.poll is not null and not public.is_moderator() then raise exception 'голосования в чате создают админ и модераторы'; end if;
    if coalesce(trim(new.body), '') = '' and jsonb_array_length(coalesce(new.images, '[]'::jsonb)) = 0 and new.poll is null then
      raise exception 'пустое сообщение';
    end if;
    select max(created_at) into last_t from public.chat_messages where user_id = auth.uid();
    if last_t is not null and now() - last_t < interval '2 seconds' then raise exception 'не так быстро — подождите пару секунд'; end if;
    new.user_id := auth.uid(); new.nick := pr.nick; new.author_leader := pr.leader; new.author_mod := pr.moderator or public.is_admin();
    new.created_at := now(); new.pinned := false; new.pinned_at := null;
  else
    if not public.is_moderator() then raise exception 'закреплять сообщения могут админ и модераторы'; end if;
    new.id := old.id; new.user_id := old.user_id; new.nick := old.nick; new.author_leader := old.author_leader; new.author_mod := old.author_mod;
    new.body := old.body; new.images := old.images; new.poll := old.poll; new.created_at := old.created_at; new.reply_to := old.reply_to;
    new.pinned_at := case when new.pinned and not old.pinned then now() when not new.pinned then null else old.pinned_at end;
  end if;
  return new;
end $$;

-- исключённый не видит сообщения
drop policy if exists "chat read" on public.chat_messages;
create policy "chat read" on public.chat_messages for select to authenticated
  using (not coalesce((select chat_kicked from public.profiles where id = auth.uid()), false));

-- модерация участника: mute (на p_minutes; 0 — навсегда) | unmute | kick | unkick. Админ и модераторы; модератора и админа — нельзя
create or replace function public.chat_moderate(p_user uuid, p_action text, p_minutes int default 0) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'нет прав'; end if;
  if p_action in ('mute', 'kick') and exists (select 1 from public.profiles where id = p_user and (moderator or lower(email) in (select lower(email) from public.admins))) then
    raise exception 'модератора и админа нельзя замутить или исключить';
  end if;
  if p_action = 'mute' then
    if coalesce(p_minutes, 0) <= 0 then update public.profiles set chat_banned = true, chat_muted_until = null where id = p_user;
    else update public.profiles set chat_muted_until = now() + make_interval(mins => p_minutes) where id = p_user; end if;
  elsif p_action = 'unmute' then update public.profiles set chat_banned = false, chat_muted_until = null where id = p_user;
  elsif p_action = 'kick' then update public.profiles set chat_kicked = true where id = p_user;
  elsif p_action = 'unkick' then update public.profiles set chat_kicked = false where id = p_user;
  else raise exception 'нет такого действия: %', p_action; end if;
end $$;

-- список участников чата (все зарегистрированные с ником): видят участники; служебные отметки — только модераторам
create or replace function public.chat_members()
returns table(user_id uuid, nick text, leader boolean, moderator boolean, muted_until timestamptz, banned boolean, kicked boolean)
language plpgsql security definer set search_path = public as $$
declare m boolean := public.is_moderator();
begin
  if auth.uid() is null or coalesce((select chat_kicked from public.profiles where id = auth.uid()), false) then raise exception 'нет доступа'; end if;
  return query
    select p.id, p.nick, p.leader, (p.moderator or lower(p.email) in (select lower(a.email) from public.admins a)),
           case when m then p.chat_muted_until end, case when m then p.chat_banned end, case when m then p.chat_kicked end
      from public.profiles p
     where p.nick is not null and (m or not p.chat_kicked)
     order by lower(p.nick);
end $$;

grant execute on function public.chat_moderate(uuid, text, int), public.chat_members() to authenticated;

-- избранное: у каждого своё (видит и меняет только сам)
create table if not exists public.chat_saved (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.chat_saved enable row level security;
drop policy if exists "own saved" on public.chat_saved;
create policy "own saved" on public.chat_saved for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
