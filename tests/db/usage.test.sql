-- Phase 8b: usage monitor
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'harsh@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'nobody@example.com');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
reset role;

do $$ begin
  assert (select count(*) from public.usage_snapshots) = 1, 'the migration takes a first snapshot';
  assert (select db_bytes > 0 from public.usage_snapshots limit 1), 'with the database size';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.usage_snapshots) = 1, 'members can read it';
  perform public.check_usage();
  assert (select count(*) from public.usage_snapshots) = 1, 'a recent snapshot is reused';
end $$;
do $$ begin
  perform public.take_usage_snapshot();
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;

-- someone without a household sees nothing and can't trigger a check
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.usage_snapshots) = 0, 'not readable outside a household';
  perform public.check_usage();
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;
select 'usage tests passed' as result;
