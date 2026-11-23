-- RLS and RPC tests for the household tables. Each block raises on failure.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'harsh@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'prerna@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'stranger@example.com'),
  ('00000000-0000-0000-0000-0000000000d4', 'late@example.com');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;

create temp table t_token (token text);
grant all on t_token to authenticated;

-- Harsh creates the household
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
do $$ begin
  assert (select count(*) from public.members) = 1, 'Harsh sees his member row';
  assert (select role from public.members) = 'owner', 'creator is owner';
  assert (select count(*) from public.household_settings) = 1, 'settings row created';
  assert (select count(*) from public.notification_prefs) = 1, 'prefs row created';
  assert (select quiet_start from public.notification_prefs) = '23:00', 'default quiet hours start';
end $$;

-- cannot create a second household
do $$ begin
  perform public.create_household('Harsh again', 'teak');
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%already belong%' then raise; end if;
end $$;

-- cannot change role directly (column grants)
do $$ begin
  update public.members set role = 'partner';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
update public.members set display_name = 'Harsh N';

insert into t_token select public.create_invite();
reset role;

-- A stranger sees nothing
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.members) = 0, 'stranger sees no members';
  assert (select count(*) from public.households) = 0, 'stranger sees no households';
  assert (select count(*) from public.invites) = 0, 'stranger sees no invites';
end $$;
-- invite info is visible with the token (shows inviter name only)
do $$ begin
  assert (select inviter_name from public.invite_info((select token from t_token))) = 'Harsh N', 'invite_info shows inviter';
  assert (select count(*) from public.invite_info('nope')) = 0, 'bad token reveals nothing';
end $$;
-- wrong token fails
do $$ begin
  perform public.accept_invite('wrong', 'X', 'lotus');
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%not valid%' then raise; end if;
end $$;
reset role;

-- Prerna accepts
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.accept_invite((select token from t_token), 'Prerna', 'lotus');
do $$ begin
  assert (select count(*) from public.members) = 2, 'Prerna sees both members';
  assert (select role from public.members where display_name = 'Prerna') = 'partner', 'Prerna is partner';
  assert (select count(*) from public.notification_prefs) = 2, 'both prefs visible';
end $$;
-- Prerna cannot edit Harsh's row (silently filtered by RLS)
update public.members set display_name = 'Hacked' where display_name = 'Harsh N';
do $$ begin
  assert (select count(*) from public.members where display_name = 'Hacked') = 0, 'cannot edit partner';
end $$;
-- push subscriptions are private
insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth)
  values (public.my_household_id(), public.my_member_id(), 'https://push.example.com/prerna', 'k', 'a');
-- re-registering the same device: the app updates only the keys (an upsert is not allowed)
update public.push_subscriptions set p256dh = 'k2', auth = 'a2', user_agent = 'phone' where endpoint = 'https://push.example.com/prerna';
do $$ begin
  assert (select p256dh from public.push_subscriptions where endpoint = 'https://push.example.com/prerna') = 'k2', 'keys refreshed';
  insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth)
    values (public.my_household_id(), public.my_member_id(), 'https://push.example.com/prerna', 'k', 'a')
    on conflict (endpoint) do update set household_id = excluded.household_id, member_id = excluded.member_id, p256dh = excluded.p256dh;
  raise exception 'upsert should have been refused';
exception when insufficient_privilege then null;
end $$;
reset role;

-- The invite is single-use, and the household is full
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
do $$ begin
  perform public.accept_invite((select token from t_token), 'Late', 'leaf');
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%already been used%' then raise; end if;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.push_subscriptions) = 0, 'Harsh cannot see Prerna''s push subscription';
  perform public.create_invite();
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%two members%' then raise; end if;
end $$;
-- Harsh cannot insert a push subscription for Prerna
do $$ begin
  insert into public.push_subscriptions (household_id, member_id, endpoint, p256dh, auth)
    values (public.my_household_id(), (select id from public.members where display_name = 'Prerna'), 'https://push.example.com/x', 'k', 'a');
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;

-- Expired invites are rejected
reset role;
insert into public.invites (household_id, token_hash, expires_at)
  select household_id, encode(extensions.digest('expired-token', 'sha256'), 'hex'), now() - interval '1 minute' from public.members limit 1;
delete from public.members where display_name = 'Prerna';
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d4');
do $$ begin
  perform public.accept_invite('expired-token', 'Late', 'leaf');
  raise exception 'should have failed';
exception when others then
  if sqlerrm not like '%expired%' then raise; end if;
end $$;
reset role;

-- Owner leaving with nobody left deletes the household
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.leave_household();
reset role;
do $$ begin
  assert (select count(*) from public.households) = 0, 'empty household deleted';
end $$;

select 'household tests passed' as result;
