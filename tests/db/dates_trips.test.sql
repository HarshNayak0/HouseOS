-- Phase 7a: date ideas, memories, trips.
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
create temp table t_theirs (id uuid);
grant all on t_tok, t_theirs to authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
insert into t_tok select public.create_invite();
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.accept_invite((select token from t_tok), 'Prerna', 'lotus');
reset role;

-- a stranger with their own household
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.create_household('Stranger', 'leaf');
insert into public.trips (household_id, title, starts_on, ends_on) values (public.my_household_id(), 'Theirs', '2027-01-01', '2027-01-02');
reset role;
insert into t_theirs select id from public.trips where title = 'Theirs';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.date_ideas (household_id, title, cost, duration, tags) values (public.my_household_id(), 'Sunset walk at the Bluffs', 0, 'evening', '{Outdoors}');
update public.date_ideas set status = 'planned', planned_for = now() + interval '2 days';
update public.date_ideas set status = 'done';
insert into public.date_memories (household_id, date_idea_id, title, happened_on, memory_note)
  select household_id, id, title, current_date, 'Golden light' from public.date_ideas;
insert into public.date_ratings (household_id, memory_id, member_id, rating) select household_id, id, public.my_member_id(), 5 from public.date_memories;
do $$ begin
  assert (select count(*) from public.activity_log where summary like '%Bluffs%') = 3, 'idea added, planned, done logged';
  insert into public.date_ideas (household_id, title, cost) values (public.my_household_id(), 'x', 9);
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
-- can't rate for your partner
do $$ begin
  insert into public.date_ratings (household_id, memory_id, member_id, rating)
    select m.household_id, m.id, p.id, 1 from public.date_memories m, public.members p where p.display_name = 'Prerna';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;

insert into public.trips (household_id, title, destination, starts_on, ends_on, budget_planned) values (public.my_household_id(), 'Montréal weekend', 'Montréal', '2026-12-18', '2026-12-20', 900);
insert into public.trip_days (household_id, trip_id, day_date, at_time, title) select household_id, id, starts_on, '08:40', 'Train to Montréal' from public.trips where title = 'Montréal weekend';
insert into public.trip_bookings (household_id, trip_id, kind, title, confirmation_no, cost) select household_id, id, 'train', 'VIA Rail', 'DEMO123', 240 from public.trips where title = 'Montréal weekend';
insert into public.packing_items (household_id, trip_id, title, owner_id) select household_id, id, 'Passport', public.my_member_id() from public.trips where title = 'Montréal weekend';
insert into public.trip_expenses (household_id, trip_id, title, amount, paid_by) select household_id, id, 'Dinner', 85, public.my_member_id() from public.trips where title = 'Montréal weekend';
insert into public.packing_templates (household_id, title, items) values (public.my_household_id(), 'Weekend away', '{Toothbrush,Chargers,Passport}');
-- can't attach rows to the stranger's trip, even knowing its id
do $$ begin
  insert into public.packing_items (household_id, trip_id, title)
    values (public.my_household_id(), (select id from t_theirs), 'sneaky');
  raise exception 'should have failed';
exception when foreign_key_violation then null;
end $$;
do $$ begin
  insert into public.trips (household_id, title, starts_on, ends_on) values (public.my_household_id(), 'Backwards', '2027-01-05', '2027-01-01');
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
-- no hard deletes
do $$ begin
  delete from public.trips;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from public.trips) = 1, 'Prerna sees the shared trip only';
  assert (select count(*) from public.packing_items) = 1, 'and its packing list';
  assert (select count(*) from public.date_ratings) = 1, 'and Harsh''s rating';
end $$;
update public.packing_items set packed = true;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.trips) = 1, 'stranger sees only their own trip';
  assert (select count(*) from public.date_ideas) + (select count(*) from public.packing_items) + (select count(*) from public.trip_bookings) = 0, 'and nothing of ours';
end $$;
reset role;
select 'dates and trips tests passed' as result;
