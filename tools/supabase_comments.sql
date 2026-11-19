-- Комментарии к постам «Важных новостей».
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
create table if not exists public.post_comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  nick text,
  author_leader boolean not null default false,
  author_mod boolean not null default false,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post on public.post_comments (post_id, created_at);
alter table public.post_comments enable row level security;

-- автор, ник и отметки подставляются сами; мут/запрет/исключение из чата действуют и здесь; не чаще раза в 3 секунды
create or replace function public.post_comment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr public.profiles; last_t timestamptz;
begin
  select * into pr from public.profiles where id = auth.uid();
  if pr.id is null then raise exception 'нужно войти'; end if;
  if pr.nick is null then raise exception 'сначала укажите игровой ник'; end if;
  if pr.chat_kicked or pr.chat_banned then raise exception 'вам запрещено писать'; end if;
  if pr.chat_muted_until is not null and pr.chat_muted_until > now() then
    raise exception 'мут до % (МСК)', to_char(pr.chat_muted_until at time zone 'Europe/Moscow', 'DD.MM HH24:MI');
  end if;
  select max(created_at) into last_t from public.post_comments where user_id = auth.uid();
  if last_t is not null and now() - last_t < interval '3 seconds' then raise exception 'не так быстро — подождите пару секунд'; end if;
  new.user_id := auth.uid(); new.nick := pr.nick; new.author_leader := pr.leader; new.author_mod := pr.moderator or public.is_admin();
  new.created_at := now();
  return new;
end $$;
drop trigger if exists post_comment_guard on public.post_comments;
create trigger post_comment_guard before insert on public.post_comments for each row execute function public.post_comment_guard();

drop policy if exists "comments read" on public.post_comments;
create policy "comments read" on public.post_comments for select using (true);
drop policy if exists "comments insert" on public.post_comments;
create policy "comments insert" on public.post_comments for insert to authenticated with check (true);
drop policy if exists "comments delete" on public.post_comments;
create policy "comments delete" on public.post_comments for delete to authenticated using (user_id = auth.uid() or public.is_moderator());

-- новые комментарии приходят сразу
alter table public.post_comments replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.post_comments;
exception when duplicate_object then null; end $$;
