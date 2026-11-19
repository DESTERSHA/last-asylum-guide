-- История смены игровых ников: каждая смена записывается сама (кто, с какого на какой, когда, кем — сам или админ).
-- Видит человек свою историю, админ — всех.
create table if not exists public.nick_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  old_nick text,
  new_nick text,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists nick_history_user on public.nick_history (user_id, changed_at desc);
alter table public.nick_history enable row level security;
drop policy if exists "nick history read" on public.nick_history;
create policy "nick history read" on public.nick_history for select to authenticated using (user_id = auth.uid() or public.is_admin());

create or replace function public.nick_history_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nick is distinct from old.nick then
    insert into public.nick_history (user_id, old_nick, new_nick, changed_by) values (new.id, old.nick, new.nick, auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists nick_history_log on public.profiles;
create trigger nick_history_log after update of nick on public.profiles for each row execute function public.nick_history_log();

-- ник при регистрации — тоже в историю (первая запись)
create or replace function public.nick_history_first() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.nick is not null then
    insert into public.nick_history (user_id, old_nick, new_nick, changed_by) values (new.id, null, new.nick, new.id);
  end if;
  return new;
end $$;
drop trigger if exists nick_history_first on public.profiles;
create trigger nick_history_first after insert on public.profiles for each row execute function public.nick_history_first();

-- нынешние ники — первой записью, чтобы у всех история начиналась с текущего ника (один раз; повторный запуск не дублирует)
insert into public.nick_history (user_id, old_nick, new_nick, changed_by, changed_at)
select p.id, null, p.nick, p.id, p.created_at from public.profiles p
where p.nick is not null and not exists (select 1 from public.nick_history h where h.user_id = p.id);
