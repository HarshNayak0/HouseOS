-- Phase 4: Google Calendar sync, milestones and gift ideas.
-- Calendar rows are written only by the `calendar` Edge Function (service role); the app reads them.
-- Refresh tokens are stored encrypted (AES-GCM, key held only in the function's secrets) and are
-- never readable by the app (no column grant).

create table public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null unique references public.members (id) on delete cascade,
  google_email text not null,
  refresh_token_enc text not null,
  status text not null default 'ok' check (status in ('ok', 'error', 'revoked')),
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  account_id uuid not null references public.calendar_accounts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  google_calendar_id text not null,
  summary text not null,
  color text,
  access_role text not null default 'reader',
  is_primary boolean not null default false,
  is_us_calendar boolean not null default false,
  visible boolean not null default false,
  sync_token text,
  last_synced_at timestamptz,
  full_synced_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, google_calendar_id)
);
create index calendar_sources_household_idx on public.calendar_sources (household_id);

create table public.calendar_event_cache (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  source_id uuid not null references public.calendar_sources (id) on delete cascade,
  google_event_id text not null,
  etag text,
  summary text,
  location text,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  html_link text,
  recurring_event_id text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (source_id, google_event_id)
);
create index calendar_event_cache_time_idx on public.calendar_event_cache (household_id, starts_at);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  kind text not null default 'other' check (kind in ('birthday', 'anniversary', 'other')),
  base_date date not null,
  person_id uuid references public.members (id) on delete set null, -- whose birthday; null = both
  remind_days integer[] not null default '{14,7,1}',
  reminded text[] not null default '{}', -- written by the notify function: "YYYY-MM-DD:days"
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.gift_ideas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  milestone_id uuid references public.milestones (id) on delete cascade,
  for_member_id uuid references public.members (id) on delete cascade, -- hidden from this person
  title text not null check (char_length(trim(title)) between 1 and 120),
  link text check (link is null or link ~ '^https?://'),
  price numeric check (price is null or price >= 0),
  status text not null default 'idea' check (status in ('idea', 'bought', 'given')),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['calendar_accounts','calendar_sources','calendar_event_cache'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['milestones','gift_ideas'] loop
    execute format('create trigger set_updated_meta before update on public.%I for each row execute function public.set_updated_meta()', t);
  end loop;
end $$;

-- gift ideas are "for" the other person by default, so they stay a surprise
create or replace function public.gift_default_for()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.for_member_id is null then
    select m.id into new.for_member_id from public.members m
      where m.household_id = new.household_id and m.deleted_at is null and m.id is distinct from public.my_member_id()
      limit 1;
  end if;
  return new;
end;
$$;
create trigger gift_default_for before insert on public.gift_ideas for each row execute function public.gift_default_for();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.calendar_accounts enable row level security;
alter table public.calendar_sources enable row level security;
alter table public.calendar_event_cache enable row level security;
alter table public.milestones enable row level security;
alter table public.gift_ideas enable row level security;

create policy cal_accounts_select on public.calendar_accounts for select to authenticated using (household_id = public.my_household_id());
create policy cal_sources_select on public.calendar_sources for select to authenticated using (household_id = public.my_household_id());
-- each person chooses which of their own calendars are shown
create policy cal_sources_update on public.calendar_sources for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
create policy cal_events_select on public.calendar_event_cache for select to authenticated using (household_id = public.my_household_id());

create policy milestones_select on public.milestones for select to authenticated using (household_id = public.my_household_id());
create policy milestones_insert on public.milestones for insert to authenticated with check (household_id = public.my_household_id());
create policy milestones_update on public.milestones for update to authenticated
  using (household_id = public.my_household_id()) with check (household_id = public.my_household_id());

create policy gifts_select on public.gift_ideas for select to authenticated
  using (household_id = public.my_household_id() and for_member_id is distinct from public.my_member_id());
create policy gifts_insert on public.gift_ideas for insert to authenticated
  with check (household_id = public.my_household_id());
create policy gifts_update on public.gift_ideas for update to authenticated
  using (household_id = public.my_household_id() and for_member_id is distinct from public.my_member_id())
  with check (household_id = public.my_household_id() and for_member_id is distinct from public.my_member_id());

revoke all on public.calendar_accounts, public.calendar_sources, public.calendar_event_cache, public.milestones,
  public.gift_ideas from anon, authenticated;
-- never the refresh token
grant select (id, household_id, member_id, google_email, status, last_error, created_at, updated_at, deleted_at)
  on public.calendar_accounts to authenticated;
grant select (id, household_id, account_id, member_id, google_calendar_id, summary, color, access_role, is_primary,
  is_us_calendar, visible, last_synced_at, created_at, updated_at, deleted_at) on public.calendar_sources to authenticated;
grant update (visible) on public.calendar_sources to authenticated;
grant select on public.calendar_event_cache to authenticated;
grant select on public.milestones, public.gift_ideas to authenticated;
grant insert (id, household_id, title, kind, base_date, person_id, remind_days) on public.milestones to authenticated;
grant update (title, kind, base_date, person_id, remind_days, deleted_at) on public.milestones to authenticated;
grant insert (id, household_id, milestone_id, for_member_id, title, link, price, status, notes) on public.gift_ideas to authenticated;
grant update (title, link, price, status, notes, milestone_id, deleted_at) on public.gift_ideas to authenticated;
grant all on public.calendar_accounts, public.calendar_sources, public.calendar_event_cache, public.milestones,
  public.gift_ideas to service_role;

-- ---------------------------------------------------------------------------
-- seed milestones for households that don't have any yet (SPEC §4.4)
-- ---------------------------------------------------------------------------
create or replace function public.seed_milestones(p_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_partner uuid;
begin
  if exists (select 1 from public.milestones where household_id = p_household) then return; end if;
  select id into v_owner from public.members where household_id = p_household and role = 'owner' and deleted_at is null limit 1;
  select id into v_partner from public.members where household_id = p_household and role = 'partner' and deleted_at is null limit 1;
  insert into public.milestones (household_id, title, kind, base_date, person_id, created_by, updated_by) values
    (p_household, 'Prerna''s birthday', 'birthday', '2001-09-01', v_partner, null, null),
    (p_household, 'First date', 'anniversary', '2025-09-11', null, null, null),
    (p_household, 'Harsh''s birthday', 'birthday', '2001-09-14', v_owner, null, null),
    (p_household, 'Relationship anniversary', 'anniversary', '2025-10-18', null, null, null);
  update public.households set together_since = coalesce(together_since, '2025-10-18') where id = p_household;
end;
$$;
revoke all on function public.seed_milestones(uuid) from public, anon, authenticated;

do $$
declare h uuid;
begin
  for h in select id from public.households loop
    perform public.seed_milestones(h);
  end loop;
end $$;

-- when the partner joins later, fill in whose birthday it is
create or replace function public.link_partner_birthday()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'partner' then
    update public.milestones set person_id = new.id
      where household_id = new.household_id and kind = 'birthday' and person_id is null and title = 'Prerna''s birthday';
  end if;
  return new;
end;
$$;
create trigger link_partner_birthday after insert on public.members for each row execute function public.link_partner_birthday();

-- seed for households created from now on
create or replace function public.seed_milestones_on_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_milestones(new.household_id);
  return new;
end;
$$;
create trigger seed_milestones_on_owner after insert on public.members
  for each row when (new.role = 'owner') execute function public.seed_milestones_on_household();

-- ---------------------------------------------------------------------------
-- background sync: every 15 minutes (the app also asks for a sync when it opens)
-- ---------------------------------------------------------------------------
create or replace function public.ping_function(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regproc('net.http_post') is null then return; end if;
  perform net.http_post(
    url := 'https://zdqiagmbyhfzofqauclj.supabase.co/functions/v1/' || p_name,
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.ping_function(text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('veedu-calendar-sync', '*/15 * * * *', 'select public.ping_function(''calendar/sync'')');
  end if;
end $$;

-- purge deleted gift ideas / milestones with the rest of the trash
create or replace function public.purge_trash()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.shopping_items where deleted_at < now() - interval '7 days';
  delete from public.subtasks where deleted_at < now() - interval '7 days';
  delete from public.tasks where deleted_at < now() - interval '7 days';
  delete from public.chores where deleted_at < now() - interval '7 days';
  delete from public.chore_completions where deleted_at < now() - interval '7 days';
  delete from public.notes where deleted_at < now() - interval '7 days';
  delete from public.gift_ideas where deleted_at < now() - interval '7 days';
  delete from public.milestones where deleted_at < now() - interval '7 days';
  delete from public.calendar_event_cache where ends_at < now() - interval '120 days';
  update public.notes set archived_at = now() where expires_at < now() and archived_at is null and deleted_at is null;
  delete from public.activity_log where created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.purge_trash() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.calendar_accounts, public.calendar_sources,
      public.calendar_event_cache, public.milestones, public.gift_ideas;
  end if;
end $$;
