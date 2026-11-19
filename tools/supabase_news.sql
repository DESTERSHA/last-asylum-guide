-- «Важные новости»: посты редакторов, скрины, голосования (лидеры и игроки отдельно), игровой ник при регистрации.
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run. Повторный запуск ничего не ломает.

-- ===== профиль: игровой ник и отметки, которые ставит только админ =====
alter table public.profiles add column if not exists nick text;
alter table public.profiles add column if not exists verified boolean not null default false;   -- «проверен» (для админа)
alter table public.profiles add column if not exists editor boolean not null default false;     -- может публиковать посты
alter table public.profiles add column if not exists leader boolean not null default false;     -- лидер альянса: голос — в столбец «Лидеры»
alter table public.profiles add column if not exists vote_banned boolean not null default false; -- запрещено голосовать (его голоса не считаются)

-- ник из формы регистрации попадает в профиль сам
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, nick)
  values (new.id, new.email, nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'nick', '')), 40), ''))
  on conflict do nothing;
  return new;
end $$;

-- свой ник можно указать или поменять; после смены отметка «проверен» снимается
create or replace function public.set_my_nick(p_nick text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := nullif(left(trim(coalesce(p_nick, '')), 40), '');
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  if n is null then raise exception 'ник пустой'; end if;
  update public.profiles set nick = n, verified = case when nick is distinct from n then false else verified end where id = auth.uid();
end $$;

create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select editor from public.profiles where id = auth.uid()), false) or public.is_admin();  -- админ может публиковать всегда
$$;

-- ===== посты =====
create table if not exists public.posts (
  id bigint generated always as identity primary key,
  author uuid references auth.users(id) on delete set null,
  author_nick text,
  title text not null check (length(title) between 1 and 200),
  body text not null default '' check (length(body) <= 20000),
  images jsonb not null default '[]'::jsonb,   -- пути файлов в хранилище news
  urgent boolean not null default false,       -- «Срочно»: плашка на всех страницах сайта
  poll jsonb,                                  -- {"q": вопрос, "options": [..], "anon": true/false, "ends": "ISO-время" или null}
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists posts_created on public.posts (created_at desc);
alter table public.posts enable row level security;

-- голоса: один на аккаунт в посте (переголосовать можно, пока голосование идёт)
create table if not exists public.votes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opt int not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.votes enable row level security;  -- прямого доступа нет: только через функции ниже (так анонимные голоса не прочитать)

-- кто пишет пост — подставляется сам; при правке автор и дата создания не меняются;
-- варианты и анонимность голосования, в котором уже есть голоса, менять нельзя
create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author := auth.uid();
    new.author_nick := (select nick from public.profiles where id = auth.uid());
    new.created_at := now();
    new.updated_at := null;
  else
    new.author := old.author; new.author_nick := old.author_nick; new.created_at := old.created_at; new.updated_at := now();
    if exists (select 1 from public.votes v where v.post_id = old.id) then
      if new.poll is null
         or (new.poll -> 'options') is distinct from (old.poll -> 'options')
         or coalesce((new.poll ->> 'q'), '') <> coalesce((old.poll ->> 'q'), '')
         or coalesce((new.poll ->> 'anon')::boolean, false) <> coalesce((old.poll ->> 'anon')::boolean, false) then
        raise exception 'в голосовании уже есть голоса — вопрос, варианты и анонимность менять нельзя';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before insert or update on public.posts for each row execute function public.posts_guard();

-- читать посты могут все, даже без входа; писать — редакторы; править и удалять — автор-редактор или админ
drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select using (true);
drop policy if exists "posts insert" on public.posts;
create policy "posts insert" on public.posts for insert to authenticated with check (public.is_editor());
drop policy if exists "posts update" on public.posts;
create policy "posts update" on public.posts for update to authenticated
  using (public.is_admin() or (author = auth.uid() and public.is_editor())) with check (true);
drop policy if exists "posts delete" on public.posts;
create policy "posts delete" on public.posts for delete to authenticated
  using (public.is_admin() or (author = auth.uid() and public.is_editor()));

-- ===== голосование =====
create or replace function public.cast_vote(p_post bigint, p_opt int) returns void
language plpgsql security definer set search_path = public as $$
declare pr public.profiles; pl jsonb;
begin
  if auth.uid() is null then raise exception 'нужно войти'; end if;
  select * into pr from public.profiles where id = auth.uid();
  if pr.nick is null then raise exception 'сначала укажите игровой ник'; end if;
  if pr.vote_banned then raise exception 'вам запрещено голосовать'; end if;
  select poll into pl from public.posts where id = p_post;
  if pl is null then raise exception 'в этом посте нет голосования'; end if;
  if (pl ->> 'ends') is not null and (pl ->> 'ends')::timestamptz <= now() then raise exception 'голосование закончилось'; end if;
  if p_opt < 0 or p_opt >= jsonb_array_length(pl -> 'options') then raise exception 'нет такого варианта'; end if;
  insert into public.votes (post_id, user_id, opt) values (p_post, auth.uid(), p_opt)
  on conflict (post_id, user_id) do update set opt = excluded.opt, created_at = now();
end $$;

-- итоги: по каждому варианту — сколько лидеров и сколько игроков; ники — только если голосование открытое.
-- голоса аккаунтов с запретом не считаются
create or replace function public.poll_results(p_posts bigint[])
returns table(post_id bigint, opt int, leaders int, players int, voters jsonb)
language sql stable security definer set search_path = public as $$
  select v.post_id, v.opt,
         count(*) filter (where p.leader)::int,
         count(*) filter (where not p.leader)::int,
         case when coalesce((ps.poll ->> 'anon')::boolean, false) then null
              else jsonb_agg(jsonb_build_object('nick', p.nick, 'leader', p.leader) order by p.leader desc, lower(p.nick)) end
    from public.votes v
    join public.profiles p on p.id = v.user_id and not p.vote_banned
    join public.posts ps on ps.id = v.post_id
   where v.post_id = any(p_posts)
   group by v.post_id, v.opt, ps.poll;
$$;

-- мои голоса (чтобы подсветить выбранный вариант)
create or replace function public.my_votes(p_posts bigint[]) returns table(post_id bigint, opt int)
language sql stable security definer set search_path = public as $$
  select v.post_id, v.opt from public.votes v where v.user_id = auth.uid() and v.post_id = any(p_posts);
$$;

-- ===== для админа =====
create or replace function public.list_users2()
returns table(id uuid, email text, nick text, verified boolean, editor boolean, leader boolean, vote_banned boolean, sub_until timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return query select p.id, p.email, p.nick, p.verified, p.editor, p.leader, p.vote_banned, p.sub_until, p.created_at
                 from public.profiles p order by p.created_at desc;
end $$;

-- поставить/снять отметку: verified | editor | leader | vote_banned
create or replace function public.set_user_flag(p_user uuid, p_flag text, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  if p_flag = 'verified' then update public.profiles set verified = p_on where id = p_user;
  elsif p_flag = 'editor' then update public.profiles set editor = p_on where id = p_user;
  elsif p_flag = 'leader' then update public.profiles set leader = p_on where id = p_user;
  elsif p_flag = 'vote_banned' then update public.profiles set vote_banned = p_on where id = p_user;
  else raise exception 'нет такой отметки: %', p_flag; end if;
end $$;

-- исправить ник пользователя
create or replace function public.admin_set_nick(p_user uuid, p_nick text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  update public.profiles set nick = nullif(left(trim(coalesce(p_nick, '')), 40), '') where id = p_user;
end $$;

-- все голоса в посте с ником и почтой (админ видит и анонимные — чтобы снимать нечестные)
create or replace function public.admin_poll_voters(p_post bigint)
returns table(user_id uuid, opt int, nick text, email text, leader boolean, vote_banned boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return query select v.user_id, v.opt, p.nick, p.email, p.leader, p.vote_banned, v.created_at
                 from public.votes v join public.profiles p on p.id = v.user_id
                where v.post_id = p_post order by v.opt, lower(p.nick);
end $$;

-- снять голос
create or replace function public.admin_remove_vote(p_post bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  delete from public.votes where post_id = p_post and user_id = p_user;
end $$;

-- ===== скрины постов: хранилище news (читают все, загружают редакторы) =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('news', 'news', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];

drop policy if exists "news images read" on storage.objects;
create policy "news images read" on storage.objects for select using (bucket_id = 'news');
drop policy if exists "news images upload" on storage.objects;
create policy "news images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'news' and public.is_editor() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "news images delete" on storage.objects;
create policy "news images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'news' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));

-- сколько места занято скринами (для кабинета админа), байт
create or replace function public.news_storage_used() returns bigint
language plpgsql security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects where bucket_id = 'news'), 0);
end $$;

grant execute on function public.set_my_nick(text), public.is_editor(), public.cast_vote(bigint, int), public.my_votes(bigint[]),
  public.list_users2(), public.set_user_flag(uuid, text, boolean), public.admin_set_nick(uuid, text),
  public.admin_poll_voters(bigint), public.admin_remove_vote(bigint, uuid), public.news_storage_used() to authenticated;
grant execute on function public.poll_results(bigint[]) to anon, authenticated;
