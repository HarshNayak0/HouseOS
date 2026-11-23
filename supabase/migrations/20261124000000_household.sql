-- Phase 2: household, members, invites, settings, notifications, activity log.
-- Every table has RLS limited to members of the caller's household (SPEC §5).
-- Every household-owned row carries household_id, created_by, created_at, updated_at, deleted_at.

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our home' check (char_length(name) between 1 and 60),
  together_since date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade, -- one household per person
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text not null check (role in ('owner', 'partner')),
  color text not null check (color in ('teak', 'lotus', 'leaf', 'brass', 'terracotta', 'red-oxide')),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index members_household_idx on public.members (household_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash text not null unique, -- sha256 of the token; the token itself is never stored
  expires_at timestamptz not null default now() + interval '48 hours',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index invites_household_idx on public.invites (household_id);

create table public.household_settings (
  household_id uuid primary key references public.households (id) on delete cascade,
  -- { "kitchen": { "name": "Kitchen", "ml": "അടുക്കള" }, ... } overrides the built-in labels
  room_labels jsonb not null default '{}'::jsonb check (jsonb_typeof(room_labels) = 'object'),
  both_color text not null default 'leaf' check (both_color in ('teak', 'lotus', 'leaf', 'brass', 'terracotta', 'red-oxide')),
  timezone text not null default 'America/Toronto',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.notification_prefs (
  member_id uuid primary key references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  enabled boolean not null default true,
  quiet_start time not null default '23:00',
  quiet_end time not null default '07:00',
  -- per-kind switches: notes, shopping, tasks, chores, calendar, milestones, trips, vault
  kinds jsonb not null default '{}'::jsonb check (jsonb_typeof(kinds) = 'object'),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  last_used_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index push_subscriptions_member_idx on public.push_subscriptions (member_id);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid references public.members (id) on delete set null,
  verb text not null check (char_length(verb) between 1 and 40),
  entity_type text,
  entity_id uuid,
  summary text check (char_length(summary) <= 200),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index activity_log_household_created_idx on public.activity_log (household_id, created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['households','members','invites','household_settings','notification_prefs','push_subscriptions','activity_log'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- A household has at most two members.
create or replace function public.enforce_two_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.members where household_id = new.household_id and deleted_at is null) >= 2 then
    raise exception 'This household already has two members' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger enforce_two_members before insert on public.members
  for each row execute function public.enforce_two_members();

-- ---------------------------------------------------------------------------
-- who am I?  (security definer so policies on members don't recurse)
-- ---------------------------------------------------------------------------
create or replace function public.my_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.members where user_id = auth.uid() and deleted_at is null limit 1
$$;

create or replace function public.my_member_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.members where user_id = auth.uid() and deleted_at is null limit 1
$$;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.household_settings enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.activity_log enable row level security;

-- households: members can read and rename; creation goes through create_household()
create policy households_select on public.households for select to authenticated
  using (id = public.my_household_id());
create policy households_update on public.households for update to authenticated
  using (id = public.my_household_id()) with check (id = public.my_household_id());

-- members: see your household; edit only your own name/colour (column grants below)
create policy members_select on public.members for select to authenticated
  using (household_id = public.my_household_id());
create policy members_update_self on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- invites: members can see their household's invites; created via create_invite()
create policy invites_select on public.invites for select to authenticated
  using (household_id = public.my_household_id());

-- household settings: shared by both members
create policy settings_select on public.household_settings for select to authenticated
  using (household_id = public.my_household_id());
create policy settings_update on public.household_settings for update to authenticated
  using (household_id = public.my_household_id()) with check (household_id = public.my_household_id());

-- notification prefs: both can read (to know quiet hours); each edits their own
create policy prefs_select on public.notification_prefs for select to authenticated
  using (household_id = public.my_household_id());
create policy prefs_update_self on public.notification_prefs for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());

-- push subscriptions: private to their owner
create policy push_select_self on public.push_subscriptions for select to authenticated
  using (member_id = public.my_member_id());
create policy push_insert_self on public.push_subscriptions for insert to authenticated
  with check (member_id = public.my_member_id() and household_id = public.my_household_id());
create policy push_update_self on public.push_subscriptions for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
create policy push_delete_self on public.push_subscriptions for delete to authenticated
  using (member_id = public.my_member_id());

-- activity log: shared feed; you can only write entries as yourself
create policy activity_select on public.activity_log for select to authenticated
  using (household_id = public.my_household_id());
create policy activity_insert on public.activity_log for insert to authenticated
  with check (household_id = public.my_household_id() and actor_id = public.my_member_id());

-- column-level limits on what clients may change
revoke insert, update, delete on public.households, public.members, public.invites, public.household_settings,
  public.notification_prefs, public.push_subscriptions, public.activity_log from anon, authenticated;
grant select on public.households, public.members, public.invites, public.household_settings,
  public.notification_prefs, public.push_subscriptions, public.activity_log to authenticated;
grant update (name, together_since) on public.households to authenticated;
grant update (display_name, color) on public.members to authenticated;
grant update (room_labels, both_color) on public.household_settings to authenticated;
grant update (enabled, quiet_start, quiet_end, kinds) on public.notification_prefs to authenticated;
grant insert (household_id, member_id, endpoint, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;
grant update (last_used_at, p256dh, auth, user_agent) on public.push_subscriptions to authenticated;
grant delete on public.push_subscriptions to authenticated;
grant insert (household_id, actor_id, verb, entity_type, entity_id, summary) on public.activity_log to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- First person sets up the household (becomes owner).
create or replace function public.create_household(p_display_name text, p_color text, p_household_name text default 'Our home')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid;
  v_member uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if exists (select 1 from public.members where user_id = v_uid and deleted_at is null) then
    raise exception 'You already belong to a household' using errcode = 'P0001';
  end if;
  insert into public.households (name, created_by) values (coalesce(nullif(trim(p_household_name), ''), 'Our home'), v_uid)
    returning id into v_household;
  insert into public.members (household_id, user_id, display_name, role, color, created_by)
    values (v_household, v_uid, trim(p_display_name), 'owner', p_color, v_uid)
    returning id into v_member;
  insert into public.household_settings (household_id, created_by) values (v_household, v_uid);
  insert into public.notification_prefs (member_id, household_id, created_by) values (v_member, v_household, v_uid);
  insert into public.activity_log (household_id, actor_id, verb, summary, created_by)
    values (v_household, v_member, 'household.created', 'set up the household', v_uid);
  return v_household;
end;
$$;

-- A member creates a single-use invite link (48 h). Returns the token; only its hash is stored.
create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_household uuid := public.my_household_id();
  v_token text;
begin
  if v_household is null then raise exception 'You are not in a household' using errcode = 'P0001'; end if;
  if (select count(*) from public.members where household_id = v_household and deleted_at is null) >= 2 then
    raise exception 'This household already has two members' using errcode = 'P0001';
  end if;
  -- only one live invite at a time
  update public.invites set deleted_at = now()
    where household_id = v_household and used_at is null and deleted_at is null;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.invites (household_id, token_hash, created_by)
    values (v_household, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_uid);
  return v_token;
end;
$$;

-- Lets the invite page say who sent it (works before sign-in). Reveals nothing for bad tokens.
create or replace function public.invite_info(p_token text)
returns table (inviter_name text, household_name text, valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.display_name, h.name, true
  from public.invites i
  join public.households h on h.id = i.household_id
  join public.members m on m.user_id = i.created_by and m.household_id = i.household_id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and i.used_at is null and i.deleted_at is null and i.expires_at > now()
    and (select count(*) from public.members x where x.household_id = i.household_id and x.deleted_at is null) < 2
$$;

-- The partner accepts an invite after signing in.
create or replace function public.accept_invite(p_token text, p_display_name text, p_color text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites;
  v_member uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if exists (select 1 from public.members where user_id = v_uid and deleted_at is null) then
    raise exception 'You already belong to a household' using errcode = 'P0001';
  end if;
  select * into v_invite from public.invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    for update;
  if v_invite.id is null or v_invite.deleted_at is not null then
    raise exception 'This invite link is not valid' using errcode = 'P0001';
  end if;
  if v_invite.used_at is not null then
    raise exception 'This invite link has already been used' using errcode = 'P0001';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'This invite link has expired' using errcode = 'P0001';
  end if;
  insert into public.members (household_id, user_id, display_name, role, color, created_by)
    values (v_invite.household_id, v_uid, trim(p_display_name), 'partner', p_color, v_uid)
    returning id into v_member;
  insert into public.notification_prefs (member_id, household_id, created_by)
    values (v_member, v_invite.household_id, v_uid);
  update public.invites set used_at = now(), used_by = v_uid where id = v_invite.id;
  insert into public.activity_log (household_id, actor_id, verb, summary, created_by)
    values (v_invite.household_id, v_member, 'household.joined', 'joined the household', v_uid);
  return v_invite.household_id;
end;
$$;

-- Leave the household. If you were the owner, your partner becomes owner;
-- if nobody is left, the household and everything in it is deleted.
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members;
begin
  select * into v_member from public.members where user_id = v_uid and deleted_at is null;
  if v_member.id is null then return; end if;
  delete from public.members where id = v_member.id;
  if not exists (select 1 from public.members where household_id = v_member.household_id) then
    delete from public.households where id = v_member.household_id;
  elsif v_member.role = 'owner' then
    update public.members set role = 'owner' where household_id = v_member.household_id;
  end if;
end;
$$;

revoke all on function public.create_household(text, text, text), public.create_invite(), public.invite_info(text),
  public.accept_invite(text, text, text), public.leave_household(), public.my_household_id(), public.my_member_id() from public;
grant execute on function public.create_household(text, text, text), public.create_invite(),
  public.accept_invite(text, text, text), public.leave_household(), public.my_household_id(), public.my_member_id() to authenticated;
grant execute on function public.invite_info(text) to anon, authenticated;

-- Realtime: members and settings changes reach both devices live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.members, public.household_settings;
  end if;
end $$;
