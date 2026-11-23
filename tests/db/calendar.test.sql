-- Phase 4: calendar + milestones + gift ideas.
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
do $$ begin
  assert (select count(*) from public.milestones) = 4, 'milestones seeded for a new household';
  assert (select person_id from public.milestones where title = 'Harsh''s birthday') = public.my_member_id(), 'owner birthday linked';
  assert (select person_id from public.milestones where title = 'Prerna''s birthday') is null, 'partner not here yet';
end $$;
insert into t_tok select public.create_invite();
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.accept_invite((select token from t_tok), 'Prerna', 'lotus');
do $$ begin
  assert (select person_id from public.milestones where title = 'Prerna''s birthday') = public.my_member_id(), 'partner birthday linked on join';
end $$;
reset role;

-- calendar rows are written by the function (service role)
set role service_role;
insert into public.calendar_accounts (household_id, member_id, google_email, refresh_token_enc)
  select household_id, id, 'harsh@gmail.com', 'v1:secret' from public.members where display_name = 'Harsh';
insert into public.calendar_sources (household_id, account_id, member_id, google_calendar_id, summary, is_primary, visible)
  select a.household_id, a.id, a.member_id, 'harsh@gmail.com', 'Harsh', true, true from public.calendar_accounts a;
insert into public.calendar_event_cache (household_id, source_id, google_event_id, summary, starts_at, ends_at)
  select household_id, id, 'evt1', 'Day shift', now(), now() + interval '8 hours' from public.calendar_sources;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from public.calendar_event_cache) = 1, 'partner sees merged events';
  assert (select google_email from public.calendar_accounts) = 'harsh@gmail.com', 'partner sees who is connected';
end $$;
-- the refresh token is never readable by the app
do $$ begin
  perform refresh_token_enc from public.calendar_accounts;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
-- Prerna can't hide Harsh's calendar
update public.calendar_sources set visible = false;
do $$ begin
  assert (select visible from public.calendar_sources) = true, 'cannot change another person''s calendar';
end $$;
-- nor write events directly
do $$ begin
  insert into public.calendar_event_cache (household_id, source_id, google_event_id, starts_at, ends_at)
    select household_id, id, 'x', now(), now() from public.calendar_sources;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
-- gift ideas: Prerna's idea for Harsh's birthday is hidden from Harsh
insert into public.gift_ideas (household_id, milestone_id, title)
  select household_id, id, 'Watch' from public.milestones where title = 'Harsh''s birthday';
do $$ begin
  assert (select count(*) from public.gift_ideas) = 1, 'author sees her gift idea';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.gift_ideas) = 0, 'gift idea hidden from the person it is for';
end $$;
update public.calendar_sources set visible = false;
do $$ begin
  assert (select visible from public.calendar_sources) = false, 'owner can hide own calendar';
end $$;
-- milestones are editable
insert into public.milestones (household_id, title, kind, base_date) values (public.my_household_id(), 'Moved in', 'anniversary', '2026-05-01');
do $$ begin
  assert (select count(*) from public.milestones) = 5, 'milestone added';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.calendar_event_cache) + (select count(*) from public.milestones) + (select count(*) from public.gift_ideas) = 0, 'stranger sees nothing';
end $$;
reset role;
select 'calendar tests passed' as result;
