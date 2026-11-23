-- Phase 3 list tests. Each block raises on failure.
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

-- set up a two-person household
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
insert into t_tok select public.create_invite();
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.accept_invite((select token from t_tok), 'Prerna', 'lotus');
reset role;

-- ---------- shopping ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.shopping_items (household_id, name, store) values (public.my_household_id(), '  Coconut   Milk ', 'Indian grocery');
insert into public.shopping_items (household_id, name) values (public.my_household_id(), 'coconut milk');
do $$ begin
  assert (select normalized_name from public.shopping_items limit 1) = 'coconut milk', 'name normalised';
  assert (select store from public.shopping_items where store <> 'Indian grocery') = 'Any store', 'default store';
  assert (select times_added from public.item_frequency where normalized_name = 'coconut milk') = 2, 'frequency learned';
  assert (select count(*) from public.activity_log where verb = 'shopping.added') = 2, 'activity logged';
end $$;
update public.shopping_items set checked_at = now() where store = 'Indian grocery';
do $$ begin
  assert (select checked_by from public.shopping_items where store = 'Indian grocery') = public.my_member_id(), 'checked_by set by trigger';
  assert (select updated_by from public.shopping_items where store = 'Indian grocery') = '00000000-0000-0000-0000-0000000000a1', 'updated_by set';
end $$;
-- no hard deletes from the app
do $$ begin
  delete from public.shopping_items;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
-- cannot write into another household
do $$ begin
  insert into public.shopping_items (household_id, name) values (gen_random_uuid(), 'x');
  raise exception 'should have failed';
exception when insufficient_privilege or foreign_key_violation then null;
end $$;
update public.shopping_items set deleted_at = now() where store = 'Any store';
reset role;

-- ---------- tasks ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.tasks (household_id, title, visibility) values (public.my_household_id(), 'Surprise gift', 'personal');
insert into public.tasks (household_id, title, assignee_id) values (public.my_household_id(), 'Pay hydro', public.my_member_id());
insert into public.subtasks (household_id, task_id, title) select household_id, id, 'Wrap it' from public.tasks where title = 'Surprise gift';
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from public.tasks) = 1, 'Prerna cannot see Harsh''s personal task';
  assert (select count(*) from public.subtasks) = 0, 'nor its subtasks';
  assert (select count(*) from public.activity_log where summary like '%Surprise%') = 0, 'personal tasks are not logged';
  assert (select count(*) from public.shopping_items) = 2, 'Prerna sees the shared list, including trash';
end $$;
update public.tasks set completed_at = now() where title = 'Pay hydro';
do $$ begin
  assert (select completed_by from public.tasks where title = 'Pay hydro') = public.my_member_id(), 'completed_by set';
end $$;
-- assignee must be in the household
do $$ begin
  insert into public.tasks (household_id, title, assignee_id) values (public.my_household_id(), 'x', gen_random_uuid());
  raise exception 'should have failed';
exception when check_violation or foreign_key_violation then null;
end $$;
reset role;

-- ---------- chores ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.chores (household_id, title, rrule, dtstart, next_due_at, assignment_mode, assignee_id)
  values (public.my_household_id(), 'Take out recycling', 'FREQ=WEEKLY;BYDAY=TU', '2026-11-24 23:00+00', '2026-11-24 23:00+00', 'rotating', public.my_member_id());
do $$ begin
  insert into public.chores (household_id, title, rrule, dtstart, next_due_at) values (public.my_household_id(), 'bad', 'DROP TABLE', now(), now());
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
-- next due must move forward
do $$ begin
  perform public.complete_chore((select id from public.chores), '2026-11-20 23:00+00');
  raise exception 'should have failed';
exception when invalid_parameter_value then null;
end $$;
create temp table t_c (id uuid);
grant all on t_c to authenticated;
insert into t_c select public.complete_chore((select id from public.chores), '2026-12-01 23:00+00');
do $$ begin
  assert (select next_due_at from public.chores) = '2026-12-01 23:00+00', 'moved to next occurrence';
  assert (select assignee_id from public.chores) = (select id from public.members where display_name = 'Prerna'), 'rotated to Prerna';
  assert (select count(*) from public.chore_completions) = 1, 'completion logged';
  assert (select due_at from public.chore_completions) = '2026-11-24 23:00+00', 'completion keeps the due date';
end $$;
reset role;
-- Either person can remove a completion record; the latest one restores the chore
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert public.remove_chore_completion((select id from t_c)) = 'undone', 'latest completion undone';
  assert (select next_due_at from public.chores) = '2026-11-24 23:00+00', 'remove restores due date';
  assert (select assignee_id from public.chores) = (select id from public.members where display_name = 'Harsh'), 'remove restores assignee';
  assert (select count(*) from public.chore_completions where deleted_at is null) = 0, 'completion removed from the log';
end $$;
-- removing it twice explains itself
do $$ begin
  perform public.remove_chore_completion((select id from t_c));
  raise exception 'should have failed';
exception when no_data_found then null;
end $$;
reset role;
-- an older record is removed from the log without touching the schedule
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
delete from t_c;
insert into t_c select public.complete_chore((select id from public.chores), '2026-12-01 23:00+00');
select pg_sleep(0.01);
select public.complete_chore((select id from public.chores), '2026-12-08 23:00+00');
do $$ begin
  assert public.remove_chore_completion((select id from t_c)) = 'removed', 'older record just removed';
  assert (select next_due_at from public.chores) = '2026-12-08 23:00+00', 'schedule unchanged';
  assert (select count(*) from public.chore_completions where deleted_at is null) = 1, 'one record left';
end $$;
-- the Undo button path still works for the latest
select public.undo_chore_completion((select id from public.chore_completions where deleted_at is null));
do $$ begin
  assert (select next_due_at from public.chores) = '2026-12-01 23:00+00', 'undo restores the previous due date';
end $$;
reset role;

-- ---------- notes ----------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
insert into public.notes (household_id, body, color, expires_at) values (public.my_household_id(), 'Have a good shift', 'lotus', now() - interval '1 minute');
do $$ begin
  insert into public.notes (household_id, body, color) values (public.my_household_id(), 'x', 'neon');
  raise exception 'should have failed';
exception when check_violation then null;
end $$;
reset role;

-- a stranger sees none of it
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.shopping_items) + (select count(*) from public.tasks) + (select count(*) from public.chores)
    + (select count(*) from public.notes) + (select count(*) from public.item_frequency) + (select count(*) from public.chore_completions) = 0,
    'stranger sees nothing';
end $$;
reset role;

-- ---------- housekeeping ----------
update public.shopping_items set deleted_at = now() - interval '8 days' where deleted_at is not null;
select public.purge_trash();
do $$ begin
  assert (select count(*) from public.shopping_items) = 1, 'trash older than 7 days purged';
  assert (select count(*) from public.item_frequency) = 1, 'frequency history kept';
  assert (select archived_at from public.notes) is not null, 'expired note archived';
end $$;

select 'list tests passed' as result;
