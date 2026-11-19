-- Чат сайта: сообщения (без ограничения длины), фото, закреплённые, голосования (лидеры и игроки отдельно), модераторы.
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run. Повторный запуск ничего не ломает.
-- Нужен уже выполненный supabase_news.sql (ник, отметки, is_admin, is_editor).

-- ===== отметки: модератор чата (выдаёт только админ) и запрет писать в чат (ставят админ и модераторы) =====
alter table public.profiles add column if not exists moderator boolean not null default false;
alter table public.profiles add column if not exists chat_banned boolean not null default false;

create or replace function public.is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select moderator from public.profiles where id = auth.uid()), false) or public.is_admin();
$$;

-- ===== сообщения =====
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  nick text,
  author_leader boolean not null default false,  -- отметки автора на момент сообщения (для подписи «лидер» / «модератор»)
  author_mod boolean not null default false,
  body text not null default '',
  images jsonb not null default '[]'::jsonb,     -- пути файлов в хранилище chat
  poll jsonb,                                    -- {"q": вопрос, "options": [..], "anon": true/false, "ends": "ISO" или null}
  pinned boolean not null default false,
  pinned_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_created on public.chat_messages (created_at desc);
create index if not exists chat_messages_pinned on public.chat_messages (pinned) where pinned;
alter table public.chat_messages enable row level security;

create or replace function public.chat_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr public.profiles; last_t timestamptz;
begin
  if tg_op = 'INSERT' then
    select * into pr from public.profiles where id = auth.uid();
    if pr.id is null then raise exception 'нужно войти'; end if;
    if pr.nick is null then raise exception 'сначала укажите игровой ник'; end if;
    if pr.chat_banned then raise exception 'вам запрещено писать в чат'; end if;
    if new.poll is not null and not public.is_moderator() then raise exception 'голосования в чате создают админ и модераторы'; end if;
    if coalesce(trim(new.body), '') = '' and jsonb_array_length(coalesce(new.images, '[]'::jsonb)) = 0 and new.poll is null then
      raise exception 'пустое сообщение';
    end if;
    select max(created_at) into last_t from public.chat_messages where user_id = auth.uid();
    if last_t is not null and now() - last_t < interval '2 seconds' then raise exception 'не так быстро — подождите пару секунд'; end if;
    new.user_id := auth.uid(); new.nick := pr.nick; new.author_leader := pr.leader; new.author_mod := pr.moderator or public.is_admin();
    new.created_at := now(); new.pinned := false; new.pinned_at := null;
  else
    -- менять можно только закрепление, и только модераторам
    if not public.is_moderator() then raise exception 'закреплять сообщения могут админ и модераторы'; end if;
    new.id := old.id; new.user_id := old.user_id; new.nick := old.nick; new.author_leader := old.author_leader; new.author_mod := old.author_mod;
    new.body := old.body; new.images := old.images; new.poll := old.poll; new.created_at := old.created_at;
    new.pinned_at := case when new.pinned and not old.pinned then now() when not new.pinned then null else old.pinned_at end;
  end if;
  return new;
end $$;
drop trigger if exists chat_guard on public.chat_messages;
create trigger chat_guard before insert or update on public.chat_messages for each row execute function public.chat_guard();

-- читают все зарегистрированные; пишут зарегистрированные с ником и без запрета (проверки — в chat_guard);
-- закрепляют — модераторы; удаляет автор своё или модератор любое
drop policy if exists "chat read" on public.chat_messages;
create policy "chat read" on public.chat_messages for select to authenticated using (true);
drop policy if exists "chat insert" on public.chat_messages;
create policy "chat insert" on public.chat_messages for insert to authenticated with check (true);
drop policy if exists "chat pin" on public.chat_messages;
create policy "chat pin" on public.chat_messages for update to authenticated using (public.is_moderator()) with check (public.is_moderator());
drop policy if exists "chat delete" on public.chat_messages;
create policy "chat delete" on public.chat_messages for delete to authenticated using (user_id = auth.uid() or public.is_moderator());

-- новые сообщения приходят на страницу сразу (Supabase Realtime)
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null; end $$;

-- ===== голосования в чате =====
create table if not exists public.chat_votes (
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opt int not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.chat_votes enable row level security;  -- прямого доступа нет, только функции

create or replace function public.cast_chat_vote(p_msg bigint, p_opt int) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.profiles; pl jsonb;
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.nick is null then raise exception 'сначала укажите игровой ник'; end if;
  if pr.vote_banned then raise exception 'вам запрещено голосовать'; end if;
  select poll into pl from public.chat_messages where id = p_msg;
  if pl is null then raise exception 'в этом сообщении нет голосования'; end if;
  if (pl ->> 'ends') is not null and (pl ->> 'ends')::timestamptz <= now() then raise exception 'голосование закончилось'; end if;
  if p_opt < 0 or p_opt >= jsonb_array_length(pl -> 'options') then raise exception 'нет такого варианта'; end if;
  insert into public.chat_votes (message_id, user_id, opt) values (p_msg, auth.uid(), p_opt)
  on conflict (message_id, user_id) do update set opt = excluded.opt, created_at = now();
end $$;

create or replace function public.chat_poll_results(p_msgs bigint[])
returns table(message_id bigint, opt int, leaders int, players int, voters jsonb)
language sql stable security definer set search_path = public as $$
  select v.message_id, v.opt,
         count(*) filter (where p.leader)::int,
         count(*) filter (where not p.leader)::int,
         case when coalesce((m.poll ->> 'anon')::boolean, false) then null
              else jsonb_agg(jsonb_build_object('nick', p.nick, 'leader', p.leader) order by p.leader desc, lower(p.nick)) end
    from public.chat_votes v
    join public.profiles p on p.id = v.user_id and not p.vote_banned
    join public.chat_messages m on m.id = v.message_id
   where v.message_id = any(p_msgs) and auth.uid() is not null
   group by v.message_id, v.opt, m.poll;
$$;

create or replace function public.my_chat_votes(p_msgs bigint[]) returns table(message_id bigint, opt int)
language sql stable security definer set search_path = public as $$
  select v.message_id, v.opt from public.chat_votes v where v.user_id = auth.uid() and v.message_id = any(p_msgs);
$$;

-- ===== модерация =====
-- запретить/разрешить писать в чат (админ и модераторы)
create or replace function public.chat_set_ban(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() then raise exception 'нет прав'; end if;
  if p_on and exists (select 1 from public.profiles where id = p_user and (moderator or lower(email) in (select lower(email) from public.admins))) then
    raise exception 'модератора и админа заблокировать нельзя';
  end if;
  update public.profiles set chat_banned = p_on where id = p_user;
end $$;

-- отметки админа: + moderator и chat_banned
create or replace function public.set_user_flag(p_user uuid, p_flag text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  if p_flag = 'verified' then update public.profiles set verified = p_on where id = p_user;
  elsif p_flag = 'editor' then update public.profiles set editor = p_on where id = p_user;
  elsif p_flag = 'leader' then update public.profiles set leader = p_on where id = p_user;
  elsif p_flag = 'vote_banned' then update public.profiles set vote_banned = p_on where id = p_user;
  elsif p_flag = 'moderator' then update public.profiles set moderator = p_on where id = p_user;
  elsif p_flag = 'chat_banned' then update public.profiles set chat_banned = p_on where id = p_user;
  else raise exception 'нет такой отметки: %', p_flag; end if;
end $$;

create or replace function public.list_users3()
returns table(id uuid, email text, nick text, verified boolean, editor boolean, leader boolean, vote_banned boolean,
              moderator boolean, chat_banned boolean, sub_until timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return query select p.id, p.email, p.nick, p.verified, p.editor, p.leader, p.vote_banned, p.moderator, p.chat_banned, p.sub_until, p.created_at
                 from public.profiles p order by p.created_at desc;
end $$;

-- ===== фото чата: хранилище chat (ссылка открывается у всех, у кого она есть; загружают зарегистрированные без запрета) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "chat images read" on storage.objects;
create policy "chat images read" on storage.objects for select using (bucket_id = 'chat');
drop policy if exists "chat images upload" on storage.objects;
create policy "chat images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and (storage.foldername(name))[1] = auth.uid()::text
              and not coalesce((select chat_banned from public.profiles where id = auth.uid()), true));
drop policy if exists "chat images delete" on storage.objects;
create policy "chat images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_moderator()));

-- место под скрины: новости + чат (для кабинета админа), байт
create or replace function public.news_storage_used() returns bigint
language plpgsql security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects where bucket_id in ('news', 'chat')), 0);
end $$;

grant execute on function public.is_moderator(), public.cast_chat_vote(bigint, int), public.chat_poll_results(bigint[]), public.my_chat_votes(bigint[]),
  public.chat_set_ban(uuid, boolean), public.set_user_flag(uuid, text, boolean), public.list_users3(), public.news_storage_used() to authenticated;
