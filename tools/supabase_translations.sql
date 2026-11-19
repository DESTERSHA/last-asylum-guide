-- Общие переводы: сообщение или пост переводится ОДИН раз — первым, кто его открыл, — и дальше все берут готовый перевод отсюда.
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
create table if not exists public.tr_shared (
  id text primary key,                                   -- язык + отпечаток исходного текста (sha-256)
  kind text not null default 'chat' check (kind in ('news', 'chat')),
  dst text not null check (dst in ('ru', 'en')),
  tr text not null check (length(tr) <= 30000),
  created_at timestamptz not null default now()
);
alter table public.tr_shared enable row level security;

-- переводы постов читают все (новости открыты всем); переводы чата — только вошедшие (чат только для зарегистрированных)
drop policy if exists "tr read" on public.tr_shared;
create policy "tr read" on public.tr_shared for select using (kind = 'news' or auth.uid() is not null);
-- записывают вошедшие; исправлять и удалять — только админ (через Supabase)
drop policy if exists "tr insert" on public.tr_shared;
create policy "tr insert" on public.tr_shared for insert to authenticated with check (true);
