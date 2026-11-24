-- Phase 7b: the vault. App users can read item labels for their household and nothing else.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'harsh@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'stranger@example.com');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
select public.create_household('Stranger', 'leaf');
reset role;

-- what the Edge Function (service role) writes
insert into public.vault_items (household_id, section, label, renewal_date)
  select household_id, 'insurance', 'Tenant insurance', current_date + 20 from public.members where display_name = 'Harsh';
insert into public.vault_secrets (item_id, household_id, wrapped_dek, ciphertext)
  select id, household_id, 'wrapped', 'cipher' from public.vault_items;
insert into public.vault_pins (member_id, pin_hash, salt) select id, 'h', 's' from public.members where display_name = 'Harsh';
insert into public.webauthn_credentials (member_id, credential_id, public_key) select id, 'cred', 'pk' from public.members where display_name = 'Harsh';
insert into public.vault_sessions (token_hash, member_id, household_id, expires_at, hard_expires_at)
  select 'tok', id, household_id, now() + interval '5 minutes', now() + interval '30 minutes' from public.members where display_name = 'Harsh';

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.vault_items where renewal_date is not null) = 1, 'the household sees the label and renewal date';
end $$;
do $$ begin
  perform * from public.vault_secrets;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform * from public.vault_pins;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform * from public.webauthn_credentials;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform * from public.vault_sessions;
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.vault_items set label = 'changed';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.vault_items (household_id, section, label) values (public.my_household_id(), 'wifi', 'x');
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.vault_items) = 0, 'a stranger sees nothing';
end $$;
reset role;

-- expired sessions are purged
update public.vault_sessions set expires_at = now() - interval '1 minute';
select public.purge_trash();
do $$ begin
  assert (select count(*) from public.vault_sessions) = 0, 'expired sessions are cleaned up';
end $$;
-- PIN tries: counted atomically, paused on the 5th
do $$
declare m uuid := (select member_id from public.vault_pins limit 1); n int;
begin
  for i in 1..4 loop n := public.vault_pin_try(m); end loop;
  assert n = 4, 'four tries counted';
  n := public.vault_pin_try(m);
  assert n = 5, 'the fifth try is allowed';
  assert public.vault_pin_try(m) is null, 'then the PIN is paused';
  assert (select locked_until > now() + interval '14 minutes' from public.vault_pins where member_id = m), 'for 15 minutes';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  perform public.vault_pin_try(public.my_member_id());
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
reset role;
select 'vault tests passed' as result;
