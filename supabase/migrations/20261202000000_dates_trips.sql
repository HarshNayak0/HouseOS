-- Phase 7a: bedroom (date ideas + memories) and backyard (trips).
-- Files (memory photos, trip covers, booking attachments) live in a private "household-files" bucket.

create table public.date_ideas (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  notes text check (char_length(notes) <= 2000),
  link text check (link is null or link ~ '^https?://'),
  location text check (char_length(location) <= 200),
  tags text[] not null default '{}' check (cardinality(tags) <= 8),
  cost smallint not null default 1 check (cost between 0 and 4), -- 0 free, 1–4 = $–$$$$
  duration text not null default 'evening' check (duration in ('quick', 'evening', 'half-day', 'full-day', 'weekend')),
  status text not null default 'wishlist' check (status in ('wishlist', 'planned', 'done')),
  planned_for timestamptz,
  calendar_source_id uuid references public.calendar_sources (id) on delete set null,
  calendar_event_id text,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.date_memories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  date_idea_id uuid references public.date_ideas (id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  happened_on date not null,
  photo_path text check (char_length(photo_path) <= 300),
  memory_note text check (char_length(memory_note) <= 2000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.date_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  memory_id uuid not null references public.date_memories (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (memory_id, member_id)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  destination text check (char_length(destination) <= 120),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  cover_path text check (char_length(cover_path) <= 300),
  budget_planned numeric check (budget_planned is null or budget_planned >= 0),
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- day-by-day itinerary (one row per plan item; the day is its date)
create table public.trip_days (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  day_date date not null,
  at_time time,
  title text not null check (char_length(trim(title)) between 1 and 160),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index trip_days_trip_idx on public.trip_days (trip_id, day_date);

create table public.trip_bookings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  kind text not null default 'other' check (kind in ('flight', 'train', 'bus', 'hotel', 'car', 'activity', 'other')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  confirmation_no text check (char_length(confirmation_no) <= 60),
  starts_at timestamptz,
  cost numeric check (cost is null or cost >= 0),
  attachment_path text check (char_length(attachment_path) <= 300),
  attachment_name text check (char_length(attachment_name) <= 160),
  notes text check (char_length(notes) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.trip_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  amount numeric not null check (amount >= 0),
  paid_by uuid references public.members (id) on delete set null,
  spent_on date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.packing_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  trip_id uuid not null references public.trips (id) on delete cascade,
  owner_id uuid references public.members (id) on delete set null, -- null = shared
  title text not null check (char_length(trim(title)) between 1 and 120),
  packed boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index packing_items_trip_idx on public.packing_items (trip_id);

create table public.packing_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  items text[] not null default '{}' check (cardinality(items) <= 200),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

do $$
declare t text;
begin
  foreach t in array array['date_ideas','date_memories','trips','trip_days','trip_bookings','trip_expenses','packing_items','packing_templates'] loop
    execute format('create trigger set_updated_meta before update on public.%I for each row execute function public.set_updated_meta()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (household_id = public.my_household_id())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (household_id = public.my_household_id())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (household_id = public.my_household_id()) with check (household_id = public.my_household_id())', t || '_update', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
create trigger set_updated_at before update on public.date_ratings for each row execute function public.set_updated_at();
alter table public.date_ratings enable row level security;
create policy date_ratings_select on public.date_ratings for select to authenticated using (household_id = public.my_household_id());
create policy date_ratings_insert on public.date_ratings for insert to authenticated
  with check (household_id = public.my_household_id() and member_id = public.my_member_id());
create policy date_ratings_update on public.date_ratings for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
revoke all on public.date_ratings from anon, authenticated;
grant select on public.date_ratings to authenticated;
grant insert (household_id, memory_id, member_id, rating) on public.date_ratings to authenticated;
grant update (rating) on public.date_ratings to authenticated;
grant all on public.date_ratings to service_role;

-- what the app may write (everything soft-deletes)
grant insert (id, household_id, title, notes, link, location, tags, cost, duration, status, planned_for, calendar_source_id, calendar_event_id) on public.date_ideas to authenticated;
grant update (title, notes, link, location, tags, cost, duration, status, planned_for, calendar_source_id, calendar_event_id, deleted_at) on public.date_ideas to authenticated;
grant insert (id, household_id, date_idea_id, title, happened_on, photo_path, memory_note) on public.date_memories to authenticated;
grant update (title, happened_on, photo_path, memory_note, deleted_at) on public.date_memories to authenticated;
grant insert (id, household_id, title, destination, starts_on, ends_on, cover_path, budget_planned, currency, notes) on public.trips to authenticated;
grant update (title, destination, starts_on, ends_on, cover_path, budget_planned, currency, notes, deleted_at) on public.trips to authenticated;
grant insert (id, household_id, trip_id, day_date, at_time, title, notes) on public.trip_days to authenticated;
grant update (day_date, at_time, title, notes, deleted_at) on public.trip_days to authenticated;
grant insert (id, household_id, trip_id, kind, title, confirmation_no, starts_at, cost, attachment_path, attachment_name, notes) on public.trip_bookings to authenticated;
grant update (kind, title, confirmation_no, starts_at, cost, attachment_path, attachment_name, notes, deleted_at) on public.trip_bookings to authenticated;
grant insert (id, household_id, trip_id, title, amount, paid_by, spent_on) on public.trip_expenses to authenticated;
grant update (title, amount, paid_by, spent_on, deleted_at) on public.trip_expenses to authenticated;
grant insert (id, household_id, trip_id, owner_id, title, packed) on public.packing_items to authenticated;
grant update (owner_id, title, packed, deleted_at) on public.packing_items to authenticated;
grant insert (id, household_id, title, items) on public.packing_templates to authenticated;
grant update (title, items, deleted_at) on public.packing_templates to authenticated;

-- child rows must belong to a trip in the same household
create or replace function public.check_trip_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.trips t where t.id = new.trip_id and t.household_id = new.household_id) then
    raise exception 'Trip not found' using errcode = '23503';
  end if;
  return new;
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['trip_days','trip_bookings','trip_expenses','packing_items'] loop
    execute format('create trigger check_trip_household before insert or update of trip_id, household_id on public.%I for each row execute function public.check_trip_household()', t);
  end loop;
end $$;

-- activity feed
create or replace function public.log_dates_trips()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v text;
begin
  if tg_table_name = 'date_ideas' then
    if tg_op = 'INSERT' then v := 'added the date idea “' || new.title || '”';
    elsif new.status = 'planned' and old.status is distinct from 'planned' then v := 'planned a date: “' || new.title || '”';
    elsif new.status = 'done' and old.status is distinct from 'done' then v := 'marked “' || new.title || '” as done 💛';
    end if;
  elsif tg_table_name = 'trips' and tg_op = 'INSERT' then
    v := 'started planning “' || new.title || '”';
  end if;
  if v is not null then
    insert into public.activity_log (household_id, actor_id, verb, entity_type, entity_id, summary, created_by)
      values (new.household_id, public.my_member_id(), tg_table_name || '.' || lower(tg_op), tg_table_name, new.id, left(v, 200), auth.uid());
  end if;
  return new;
end;
$$;
create trigger log_dates_trips after insert or update on public.date_ideas for each row execute function public.log_dates_trips();
create trigger log_dates_trips after insert on public.trips for each row execute function public.log_dates_trips();

-- private files: <household_id>/<kind>/<file>
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('household-files', 'household-files', false, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
      on conflict (id) do nothing;
    execute $p$create policy "household files: read" on storage.objects for select to authenticated
      using (bucket_id = 'household-files' and (storage.foldername(name))[1] = public.my_household_id()::text)$p$;
    execute $p$create policy "household files: upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'household-files' and (storage.foldername(name))[1] = public.my_household_id()::text)$p$;
    execute $p$create policy "household files: delete" on storage.objects for delete to authenticated
      using (bucket_id = 'household-files' and (storage.foldername(name))[1] = public.my_household_id()::text)$p$;
  end if;
end $$;

-- trash purge includes the new tables
create or replace function public.purge_trash()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare t text;
begin
  foreach t in array array['shopping_items','subtasks','tasks','chores','chore_completions','notes','gift_ideas','milestones','recipes',
    'date_ideas','date_memories','trips','trip_days','trip_bookings','trip_expenses','packing_items','packing_templates'] loop
    execute format('delete from public.%I where deleted_at < now() - interval ''7 days''', t);
  end loop;
  delete from public.recipe_import_jobs where created_at < now() - interval '60 days';
  delete from public.calendar_event_cache where ends_at < now() - interval '120 days';
  update public.notes set archived_at = now() where expires_at < now() and archived_at is null and deleted_at is null;
  delete from public.activity_log where created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.purge_trash() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.date_ideas, public.date_memories, public.date_ratings, public.trips,
      public.trip_days, public.trip_bookings, public.trip_expenses, public.packing_items, public.packing_templates;
  end if;
end $$;
