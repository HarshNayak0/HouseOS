-- Phase 8b: usage monitor. Database and file-storage size against the Supabase free limits.
-- A monthly job records a snapshot; either of you can also check now from Settings (at most every 10 min).
-- The app warns at 70% (limits live in src/lib/usage.ts).

create table public.usage_snapshots (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  db_bytes bigint not null,
  storage_bytes bigint not null,
  storage_files int not null,
  largest_tables jsonb not null default '[]'
);

alter table public.usage_snapshots enable row level security;
-- project-wide numbers (no household data in them): readable by anyone who belongs to a household
create policy usage_snapshots_select on public.usage_snapshots for select to authenticated using (public.my_household_id() is not null);
revoke all on public.usage_snapshots from anon, authenticated;
grant select on public.usage_snapshots to authenticated;
grant all on public.usage_snapshots to service_role;

create or replace function public.take_usage_snapshot()
returns public.usage_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage bigint := 0;
  v_files int := 0;
  v_tables jsonb;
  r public.usage_snapshots;
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute 'select coalesce(sum((metadata->>''size'')::bigint), 0), count(*) from storage.objects' into v_storage, v_files;
  end if;
  select coalesce(jsonb_agg(t order by t->>'bytes' desc), '[]') into v_tables from (
    select jsonb_build_object('table', c.relname, 'bytes', pg_total_relation_size(c.oid)) as t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by pg_total_relation_size(c.oid) desc limit 5
  ) x;
  insert into public.usage_snapshots (db_bytes, storage_bytes, storage_files, largest_tables)
    values (pg_database_size(current_database()), v_storage, v_files, v_tables)
    returning * into r;
  delete from public.usage_snapshots where taken_at < now() - interval '2 years';
  return r;
end;
$$;
revoke all on function public.take_usage_snapshot() from public, anon, authenticated;

-- "Check now" from Settings: members only, and reuses a snapshot from the last 10 minutes
create or replace function public.check_usage()
returns public.usage_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare r public.usage_snapshots;
begin
  if public.my_household_id() is null then
    raise exception 'Not in a household' using errcode = '42501';
  end if;
  select * into r from public.usage_snapshots where taken_at > now() - interval '10 minutes' order by taken_at desc limit 1;
  if found then return r; end if;
  return public.take_usage_snapshot();
end;
$$;
revoke all on function public.check_usage() from public, anon;
grant execute on function public.check_usage() to authenticated;

select public.take_usage_snapshot();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('veedu-usage', '23 14 1 * *', 'select public.take_usage_snapshot()'); -- monthly, 1st, 9:23 Toronto
  end if;
end $$;
