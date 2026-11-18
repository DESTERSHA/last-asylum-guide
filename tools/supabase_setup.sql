-- Кабинет сайта Last Asylum 397: аккаунты, избранное, подписка.
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.

-- профиль: почта и до какого числа действует подписка
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  sub_until timestamptz,
  created_at timestamptz default now()
);
-- избранное пользователя
create table if not exists public.favorites (
  user_id uuid references auth.users(id) on delete cascade,
  url text not null,
  title text, page text, kind text, icon text,
  t bigint,
  primary key (user_id, url)
);
-- кто может выдавать подписку
create table if not exists public.admins (email text primary key);

alter table public.profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.admins enable row level security;

-- профиль создаётся сам при регистрации
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- каждый видит только свой профиль и своё избранное; подписку сам себе поменять нельзя
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own favorites" on public.favorites;
create policy "own favorites" on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.admins a where lower(a.email) = lower(auth.jwt() ->> 'email'));
$$;

-- выдать подписку по почте на N дней (продлевает от текущей даты окончания, если она ещё не прошла)
create or replace function public.grant_sub(p_email text, p_days int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare r timestamptz;
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  update public.profiles
     set sub_until = greatest(coalesce(sub_until, now()), now()) + make_interval(days => p_days)
   where lower(email) = lower(p_email)
   returning sub_until into r;
  if r is null then raise exception 'нет такого пользователя: %', p_email; end if;
  return r;
end $$;

-- снять подписку
create or replace function public.revoke_sub(p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  update public.profiles set sub_until = null where lower(email) = lower(p_email);
end $$;

-- список пользователей для админа
create or replace function public.list_users() returns table(email text, sub_until timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'нет прав'; end if;
  return query select p.email, p.sub_until, p.created_at from public.profiles p order by p.created_at desc;
end $$;

grant execute on function public.is_admin, public.grant_sub, public.revoke_sub, public.list_users to authenticated;

-- ВАЖНО: впишите сюда свою почту — с ней в кабинете появится раздел «Выдать подписку»
-- insert into public.admins (email) values ('ваша@почта');
