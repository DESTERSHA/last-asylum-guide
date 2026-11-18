-- Платная часть: «Кто вступил, кто вышел и куда ушёл» — настоящие данные только для подписчиков.
-- Выполнить один раз: Supabase → SQL Editor → вставить всё → Run.
-- __TOKEN__ — пароль робота (в репозиторий не кладётся; настоящий файл с паролем — только на рабочем столе владелицы).

create table if not exists public.moves (
  al_id bigint not null,          -- альянс, в чьей ленте событие
  al_abbr text,
  t double precision not null,    -- когда (секунды, UTC)
  kind text not null,             -- join / leave
  uid bigint not null,
  nick text,
  power bigint,
  from_abbr text,                 -- откуда пришёл
  now_abbr text,                  -- куда ушёл
  primary key (al_id, t, uid, kind)
);
create index if not exists moves_uid on public.moves (uid);
create index if not exists moves_al_t on public.moves (al_id, t desc);
alter table public.moves enable row level security;

-- читать могут только те, у кого подписка ещё действует, и админ
drop policy if exists "subscribers read moves" on public.moves;
create policy "subscribers read moves" on public.moves for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.sub_until > now()));

-- пароль робота: таблица без правил доступа — с сайта её не прочитать никому
create table if not exists public.robot_secret (id int primary key default 1, token text not null);
alter table public.robot_secret enable row level security;
insert into public.robot_secret (id, token) values (1, '__TOKEN__') on conflict (id) do update set token = excluded.token;

-- робот присылает новые события сюда; без верного пароля — отказ
create or replace function public.push_moves(p_token text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_token is null or p_token <> (select token from public.robot_secret where id = 1) then raise exception 'нет прав'; end if;
  insert into public.moves (al_id, al_abbr, t, kind, uid, nick, power, from_abbr, now_abbr)
  select al_id, al_abbr, t, kind, uid, nick, power, from_abbr, now_abbr
    from jsonb_to_recordset(p_rows) as x(al_id bigint, al_abbr text, t double precision, kind text, uid bigint, nick text, power bigint, from_abbr text, now_abbr text)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.push_moves(text, jsonb) to anon, authenticated;
