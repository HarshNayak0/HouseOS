-- "I'm at the store" and the morning digest.
--
-- store_visits: one row per shopping trip. Starting one pings the notify function, which tells the other
-- person; items they add while it's open are pushed to the shopper. Visits end by hand or after 2 hours.
-- digest_log: which morning digests went out (claimed before sending, so nobody gets two).
-- Safe to run more than once.

create table if not exists public.store_visits (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  store text not null check (char_length(trim(store)) between 1 and 40),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notified_at timestamptz,          -- the "X is at the store" push went out
  items_pushed_until timestamptz,   -- items added up to here were pushed to the shopper
  created_by uuid references auth.users (id) on delete set null default auth.uid()
);
create index if not exists store_visits_household_idx on public.store_visits (household_id, started_at desc);

alter table public.store_visits enable row level security;
drop policy if exists store_visits_select on public.store_visits;
drop policy if exists store_visits_insert on public.store_visits;
drop policy if exists store_visits_update on public.store_visits;
create policy store_visits_select on public.store_visits for select to authenticated using (household_id = public.my_household_id());
create policy store_visits_insert on public.store_visits for insert to authenticated
  with check (household_id = public.my_household_id() and member_id = public.my_member_id());
create policy store_visits_update on public.store_visits for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
revoke all on public.store_visits from anon, authenticated;
grant select on public.store_visits to authenticated;
grant insert (id, household_id, member_id, store) on public.store_visits to authenticated;
grant update (ended_at) on public.store_visits to authenticated;
grant all on public.store_visits to service_role;

create table if not exists public.digest_log (
  member_id uuid not null references public.members (id) on delete cascade,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (member_id, day)
);
alter table public.digest_log enable row level security;
revoke all on public.digest_log from anon, authenticated;
grant all on public.digest_log to service_role;

-- starting a visit: tell the other person now (not on the next 5-minute run)
create or replace function public.store_visit_ping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ping_notify();
  return new;
end;
$$;
drop trigger if exists store_visit_ping on public.store_visits;
create trigger store_visit_ping after insert on public.store_visits for each row execute function public.store_visit_ping();

-- an item added while someone else is at the store: push it to them now
create or replace function public.shopping_ping_shopper()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.store_visits v
    where v.household_id = new.household_id and v.ended_at is null
      and v.started_at > now() - interval '2 hours'
      and v.created_by is distinct from new.created_by
  ) then
    perform public.ping_notify();
  end if;
  return new;
end;
$$;
drop trigger if exists shopping_ping_shopper on public.shopping_items;
create trigger shopping_ping_shopper after insert on public.shopping_items for each row execute function public.shopping_ping_shopper();

-- the two new notification kinds are on by default
update public.notification_prefs set kinds = '{"store": true, "digest": true}'::jsonb || kinds;
alter table public.notification_prefs alter column kinds set default '{"notes": true, "chores": true, "tasks": true, "store": true, "digest": true}'::jsonb;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_visits') then
    alter publication supabase_realtime add table public.store_visits;
  end if;
end $$;
