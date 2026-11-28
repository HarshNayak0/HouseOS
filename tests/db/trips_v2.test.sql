-- Trips v2: trip options, packing quantities and suggestions, per-person profiles, trip ideas.
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
insert into public.trips (household_id, title, starts_on, ends_on, vibe, transport, extras, dest_lat, dest_lng, dest_place)
  values (public.my_household_id(), 'Muskoka', '2026-12-18', '2026-12-21', 'cottage', 'drive', '{hiking,laundry}', 45.04, -79.31, 'Muskoka, Ontario');
do $$ begin
  insert into public.trips (household_id, title, starts_on, ends_on, vibe) values (public.my_household_id(), 'x', '2026-12-01', '2026-12-02', 'moon');
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
-- a suggested item with a quantity; the same suggestion twice is refused (both phones suggesting at once)
insert into public.packing_items (household_id, trip_id, owner_id, title, qty, rule_key, suggested_qty, reason, category)
  select household_id, id, public.my_member_id(), 'Cozy outfits', 3, 'outfit_casual', 3, '4 days, cottage', 'clothes' from public.trips;
do $$ begin
  insert into public.packing_items (household_id, trip_id, owner_id, title, qty, rule_key)
    select household_id, id, public.my_member_id(), 'Cozy outfits', 3, 'outfit_casual' from public.trips;
  raise exception 'should have failed';
exception when unique_violation then null;
end $$;
-- shared suggestions (no owner) are unique too
insert into public.packing_items (household_id, trip_id, owner_id, title, qty, rule_key) select household_id, id, null, 'Bug spray', 1, 'bug_spray' from public.trips;
do $$ begin
  insert into public.packing_items (household_id, trip_id, owner_id, title, qty, rule_key) select household_id, id, null, 'Bug spray', 1, 'bug_spray' from public.trips;
  raise exception 'should have failed';
exception when unique_violation then null;
end $$;
update public.packing_items set packed_count = 2, edited = true, qty = 4 where rule_key = 'outfit_casual';
-- my own packing profile
insert into public.packing_profiles (member_id, household_id, labels) values (public.my_member_id(), public.my_household_id(), '{"dressy": "Confident", "casual": "Cozy"}');
update public.packing_profiles set vibes = '{"cottage": {"share": 0.25}}';
-- can't write Prerna's profile
do $$ begin
  insert into public.packing_profiles (member_id, household_id) select id, household_id from public.members where display_name = 'Prerna';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
insert into public.trip_ideas (household_id, title, vibe) values (public.my_household_id(), 'Amalfi coast', 'beach');
update public.trips set feedback_by = array[public.my_member_id()];
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select labels->>'dressy' from public.packing_profiles) = 'Confident', 'Prerna sees Harsh''s wording';
  assert (select count(*) from public.trip_ideas) = 1, 'and the trip idea';
end $$;
update public.packing_profiles set labels = '{"dressy": "x"}'; -- not hers: changes nothing
reset role;
do $$ begin
  assert (select labels->>'dressy' from public.packing_profiles) = 'Confident', 'Prerna can''t change Harsh''s profile';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.packing_profiles) + (select count(*) from public.trip_ideas) = 0, 'a stranger sees nothing';
end $$;
reset role;
\i supabase/migrations/20261208000000_trips_v2.sql
select 'trips v2 tests passed' as result;
