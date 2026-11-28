-- Homey touches: chappals (last_seen_on), nameplate, wall photos, festivals off.
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
update public.members set last_seen_on = '2026-11-28' where id = public.my_member_id();
-- only your own row: Prerna's is untouched
update public.members set last_seen_on = '2026-11-28' where id <> public.my_member_id();
update public.household_settings set nameplate = 'Harsh & Prerna', wall_photos = '[{"path": "x/photos/a.jpg"}, null]', decor_off = '{halloween}';
do $$ begin
  update public.household_settings set decor_off = '{easter}';
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
do $$ begin
  update public.household_settings set wall_photos = '[1,2,3,4]';
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
do $$ begin
  update public.household_settings set nameplate = repeat('x', 40);
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
do $$ begin
  update public.members set role = 'owner';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.members where last_seen_on is not null) = 1, 'only Harsh''s own day was set';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select nameplate from public.household_settings) = 'Harsh & Prerna', 'Prerna sees the nameplate';
  assert (select count(*) from public.members where last_seen_on is not null) = 1, 'and Harsh''s chappals';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.household_settings) = 0, 'a stranger sees nothing';
end $$;
reset role;
\i supabase/migrations/20261209000000_homey.sql
select 'homey tests passed' as result;
