-- Per-copy settings: no app access, and the pings are harmless before the address is known.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'harsh@example.com');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;

do $$ begin
  -- a fresh copy has no address yet (nothing was written into the old ping functions)
  assert not exists (select 1 from public.app_config), 'no address copied from anywhere';
  perform public.ping_notify();
  perform public.ping_function('calendar/sync');
end $$;
insert into public.app_config (key, value) values ('functions_url', 'https://example.supabase.co/functions/v1');
select public.ping_notify(); -- pg_net isn't installed in tests, so this returns quietly

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform * from public.app_config;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;

-- an existing copy: the address in its old ping function is carried over
delete from public.app_config;
create or replace function public.ping_notify() returns void language plpgsql as $f$
begin perform 'https://abcdefghij.supabase.co/functions/v1/notify'; end $f$;
\i supabase/migrations/20261206000000_instance_config.sql
do $$ begin
  assert (select value from public.app_config where key = 'functions_url') = 'https://abcdefghij.supabase.co/functions/v1', 'address carried over';
end $$;
select 'instance config tests passed' as result;
