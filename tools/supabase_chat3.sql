-- Чат, часть 3: реакции на сообщения (как в Telegram: одна реакция от человека на сообщение, повторное нажатие снимает).
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
create table if not exists public.chat_reactions (
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  nick text,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.chat_reactions enable row level security;

-- ник подставляется сам; исключённый и человек без ника реагировать не могут
create or replace function public.chat_reaction_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare pr public.profiles;
begin
  select * into pr from public.profiles where id = auth.uid();
  if pr.id is null or pr.nick is null then raise exception 'сначала укажите игровой ник'; end if;
  if pr.chat_kicked then raise exception 'вы исключены из чата'; end if;
  new.user_id := auth.uid(); new.nick := pr.nick; new.created_at := now();
  return new;
end $$;
drop trigger if exists chat_reaction_guard on public.chat_reactions;
create trigger chat_reaction_guard before insert or update on public.chat_reactions for each row execute function public.chat_reaction_guard();

drop policy if exists "reactions read" on public.chat_reactions;
create policy "reactions read" on public.chat_reactions for select to authenticated
  using (not coalesce((select chat_kicked from public.profiles where id = auth.uid()), false));
drop policy if exists "reactions own" on public.chat_reactions;
create policy "reactions own" on public.chat_reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "reactions own update" on public.chat_reactions;
create policy "reactions own update" on public.chat_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "reactions own delete" on public.chat_reactions;
create policy "reactions own delete" on public.chat_reactions for delete to authenticated using (user_id = auth.uid());

alter table public.chat_reactions replica identity full;  -- чтобы снятие реакции тоже приходило всем сразу
do $$ begin
  alter publication supabase_realtime add table public.chat_reactions;
exception when duplicate_object then null; end $$;
