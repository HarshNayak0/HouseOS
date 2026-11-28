-- Trips, made easier: a vibe, transport and extras per trip (they drive the packing list), the
-- destination's coordinates (for the weather), per-person packing preferences that learn, packing items
-- with quantities, and a someday list of trip ideas. Safe to run more than once.

-- ---------- trips ----------
alter table public.trips add column if not exists vibe text;
alter table public.trips add column if not exists transport text;
alter table public.trips add column if not exists extras text[] not null default '{}';
alter table public.trips add column if not exists dest_lat double precision;
alter table public.trips add column if not exists dest_lng double precision;
alter table public.trips add column if not exists dest_place text;
-- who has done the after-trip packing check-in
alter table public.trips add column if not exists feedback_by uuid[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trips_vibe_check') then
    alter table public.trips add constraint trips_vibe_check check (vibe is null or vibe in ('city', 'beach', 'cottage', 'event'));
    alter table public.trips add constraint trips_transport_check check (transport is null or transport in ('drive', 'fly', 'train'));
    alter table public.trips add constraint trips_extras_check check (extras <@ array['swimming', 'hiking', 'dressy', 'photo', 'laundry']::text[]);
    alter table public.trips add constraint trips_place_check check (char_length(dest_place) <= 160);
  end if;
end $$;
grant insert (vibe, transport, extras, dest_lat, dest_lng, dest_place) on public.trips to authenticated;
grant update (vibe, transport, extras, dest_lat, dest_lng, dest_place, feedback_by) on public.trips to authenticated;

-- ---------- packing items: quantities and suggestions ----------
alter table public.packing_items add column if not exists qty smallint not null default 1;
alter table public.packing_items add column if not exists packed_count smallint not null default 0;
-- set when the item was suggested by the packing rules (e.g. 'outfit_dressy'); null = added by hand
alter table public.packing_items add column if not exists rule_key text;
-- what the rules suggested (so "remember this" knows how far you moved from it)
alter table public.packing_items add column if not exists suggested_qty smallint;
-- you changed a suggestion by hand: later re-suggestions leave it alone
alter table public.packing_items add column if not exists edited boolean not null default false;
alter table public.packing_items add column if not exists reason text;
alter table public.packing_items add column if not exists category text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'packing_items_qty_check') then
    alter table public.packing_items add constraint packing_items_qty_check check (qty between 0 and 30 and packed_count between 0 and 30);
    alter table public.packing_items add constraint packing_items_text_check check (char_length(rule_key) <= 80 and char_length(reason) <= 200 and char_length(category) <= 40);
  end if;
end $$;
-- one suggestion per rule, per person (or shared), per trip — both phones can suggest at once safely
create unique index if not exists packing_items_rule_idx on public.packing_items
  (trip_id, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), rule_key)
  where rule_key is not null and deleted_at is null;
grant insert (qty, packed_count, rule_key, suggested_qty, edited, reason, category) on public.packing_items to authenticated;
grant update (qty, packed_count, suggested_qty, edited, reason, category) on public.packing_items to authenticated;

-- ---------- per-person packing preferences ----------
-- labels: what to call the two kinds of outfits, e.g. {"dressy": "Confident", "casual": "Cozy"}
-- vibes:  what's been learned per vibe, e.g. {"cottage": {"share": 0.25, "delta": {"socks": 1}, "add": ["Fleece"], "drop": ["sunglasses"]}}
create table if not exists public.packing_profiles (
  member_id uuid primary key references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  labels jsonb not null default '{}' check (jsonb_typeof(labels) = 'object' and octet_length(labels::text) <= 2000),
  vibes jsonb not null default '{}' check (jsonb_typeof(vibes) = 'object' and octet_length(vibes::text) <= 20000),
  updated_at timestamptz not null default now()
);
alter table public.packing_profiles enable row level security;
drop policy if exists packing_profiles_select on public.packing_profiles;
drop policy if exists packing_profiles_insert on public.packing_profiles;
drop policy if exists packing_profiles_update on public.packing_profiles;
create policy packing_profiles_select on public.packing_profiles for select to authenticated using (household_id = public.my_household_id());
create policy packing_profiles_insert on public.packing_profiles for insert to authenticated
  with check (household_id = public.my_household_id() and member_id = public.my_member_id());
create policy packing_profiles_update on public.packing_profiles for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
revoke all on public.packing_profiles from anon, authenticated;
grant select on public.packing_profiles to authenticated;
grant insert (member_id, household_id, labels, vibes) on public.packing_profiles to authenticated;
grant update (labels, vibes) on public.packing_profiles to authenticated;
grant all on public.packing_profiles to service_role;
drop trigger if exists set_updated_at on public.packing_profiles;
create trigger set_updated_at before update on public.packing_profiles for each row execute function public.set_updated_at();

-- ---------- trip ideas (a someday list) ----------
create table if not exists public.trip_ideas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  destination text check (char_length(destination) <= 120),
  vibe text check (vibe is null or vibe in ('city', 'beach', 'cottage', 'event')),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.trip_ideas enable row level security;
drop policy if exists trip_ideas_select on public.trip_ideas;
drop policy if exists trip_ideas_insert on public.trip_ideas;
drop policy if exists trip_ideas_update on public.trip_ideas;
create policy trip_ideas_select on public.trip_ideas for select to authenticated using (household_id = public.my_household_id());
create policy trip_ideas_insert on public.trip_ideas for insert to authenticated with check (household_id = public.my_household_id());
create policy trip_ideas_update on public.trip_ideas for update to authenticated
  using (household_id = public.my_household_id()) with check (household_id = public.my_household_id());
revoke all on public.trip_ideas from anon, authenticated;
grant select on public.trip_ideas to authenticated;
grant insert (id, household_id, title, destination, vibe, notes) on public.trip_ideas to authenticated;
grant update (title, destination, vibe, notes, deleted_at) on public.trip_ideas to authenticated;
grant all on public.trip_ideas to service_role;
drop trigger if exists set_updated_meta on public.trip_ideas;
create trigger set_updated_meta before update on public.trip_ideas for each row execute function public.set_updated_meta();

-- trip ideas go to the 7-day trash like everything else
create or replace function public.purge_trash()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t text;
begin
  foreach t in array array['shopping_items','subtasks','tasks','chores','chore_completions','notes','gift_ideas','milestones','recipes',
    'date_ideas','date_memories','trips','trip_days','trip_bookings','trip_expenses','packing_items','packing_templates','trip_ideas'] loop
    execute format('delete from public.%I where deleted_at < now() - interval ''7 days''', t);
  end loop;
  delete from public.recipe_import_jobs where created_at < now() - interval '60 days';
  delete from public.calendar_event_cache where ends_at < now() - interval '120 days';
  update public.notes set archived_at = now() where expires_at < now() and archived_at is null and deleted_at is null;
  delete from public.activity_log where created_at < now() - interval '90 days';
  delete from public.vault_sessions where hard_expires_at < now() or expires_at < now();
  delete from public.vault_challenges where expires_at < now();
end;
$$;
revoke all on function public.purge_trash() from public, anon, authenticated;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['packing_profiles', 'trip_ideas'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
