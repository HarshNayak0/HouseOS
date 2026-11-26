-- "I'm at the store" and the digest log
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'harsh@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'prerna@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'stranger@example.com');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create temp table t_tok (token text);
grant all on t_tok to authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
insert into t_tok select public.create_invite();
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.accept_invite((select token from t_tok), 'Prerna', 'lotus');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.store_visits (household_id, member_id, store) values (public.my_household_id(), public.my_member_id(), 'No Frills');
-- can't start a visit as someone else
do $$ begin
  insert into public.store_visits (household_id, member_id, store)
    select household_id, id, 'Costco' from public.members where display_name = 'Prerna';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
-- can't set the notify bookkeeping
do $$ begin
  update public.store_visits set notified_at = now();
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
update public.store_visits set ended_at = now();
reset role;

-- Prerna sees the visit but can't end it
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from public.store_visits) = 1, 'Prerna sees Harsh''s visit';
end $$;
update public.store_visits set ended_at = null;
reset role;
do $$ begin
  assert (select ended_at is not null from public.store_visits), 'Prerna can''t reopen Harsh''s visit';
end $$;

-- an item added during someone else's visit runs the shopper ping (pg_net absent here, so it just returns)
update public.store_visits set ended_at = null;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into public.shopping_items (household_id, name, store) values (public.my_household_id(), 'Milk', 'No Frills');
do $$ begin
  perform * from public.digest_log;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.store_visits) = 0, 'a stranger sees nothing';
end $$;
reset role;

do $$ begin
  assert (select kinds ? 'digest' and kinds ? 'store' from public.notification_prefs limit 1), 'new kinds default on';
end $$;
select 'store tests passed' as result;
