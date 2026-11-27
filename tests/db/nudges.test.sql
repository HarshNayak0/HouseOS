-- Task nudge log: no app access, one row per person, day and slot.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'harsh@example.com');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
do $$ begin
  perform * from public.task_nudge_log;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;
insert into public.task_nudge_log (member_id, day, slot) select id, current_date, 'pm' from public.members;
do $$ begin
  insert into public.task_nudge_log (member_id, day, slot) select id, current_date, 'pm' from public.members;
  raise exception 'should have failed';
exception when unique_violation then null; -- the claim: a second send of the same nudge is refused
end $$;
\i supabase/migrations/20261207000000_task_nudges.sql
select 'nudge tests passed' as result;
