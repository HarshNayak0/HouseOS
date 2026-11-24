-- Phase 7b: the coat-closet vault.
--
-- vault_items     what the app may show without unlocking: section, label, renewal date. Readable by the
--                 household (the dashboard, calendar and closet bell use it). Written only by the `vault`
--                 Edge Function.
-- vault_secrets   the encrypted details (AES-256-GCM with a per-item key, wrapped by a master key that only
--                 the Edge Function holds). No access at all for app users: only the service role.
-- vault_pins, webauthn_credentials, vault_challenges, vault_sessions: unlocking. Service role only.
-- Attachments (manuals, lease PDFs) live in the private "vault-files" bucket, which has no user policies:
-- the function hands out short-lived signed links after an unlock.

create table public.vault_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  section text not null check (section in ('wifi', 'contact', 'lease', 'insurance', 'appliance', 'account')),
  label text not null check (char_length(trim(label)) between 1 and 80),
  renewal_date date,
  has_attachment boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index vault_items_household_idx on public.vault_items (household_id);

create table public.vault_secrets (
  item_id uuid primary key references public.vault_items (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  key_version smallint not null default 1,
  wrapped_dek text not null check (char_length(wrapped_dek) <= 200),
  ciphertext text not null check (char_length(ciphertext) <= 20000),
  attachment_path text check (char_length(attachment_path) <= 300),
  attachment_name text check (char_length(attachment_name) <= 160),
  updated_at timestamptz not null default now()
);

create table public.vault_pins (
  member_id uuid primary key references public.members (id) on delete cascade,
  pin_hash text not null,
  salt text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  credential_id text not null unique check (char_length(credential_id) <= 1024),
  public_key text not null check (char_length(public_key) <= 2048),
  counter bigint not null default 0,
  transports text[] not null default '{}',
  name text not null default 'Passkey' check (char_length(name) <= 60),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index webauthn_credentials_member_idx on public.webauthn_credentials (member_id);

create table public.vault_challenges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members (id) on delete cascade,
  kind text not null check (kind in ('register', 'authenticate')),
  challenge text not null,
  expires_at timestamptz not null
);
create index vault_challenges_member_idx on public.vault_challenges (member_id);

create table public.vault_sessions (
  token_hash text primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- slides with use (5 minutes idle)
  hard_expires_at timestamptz not null      -- never past this (30 minutes)
);
create index vault_sessions_member_idx on public.vault_sessions (member_id);

-- vault_items: the household can read; nobody but the function writes
create trigger set_updated_meta before update on public.vault_items for each row execute function public.set_updated_meta();
alter table public.vault_items enable row level security;
create policy vault_items_select on public.vault_items for select to authenticated using (household_id = public.my_household_id());
revoke all on public.vault_items from anon, authenticated;
grant select on public.vault_items to authenticated;
grant all on public.vault_items to service_role;

-- everything else: RLS on, no policies, no grants for app users
do $$
declare t text;
begin
  foreach t in array array['vault_secrets','vault_pins','webauthn_credentials','vault_challenges','vault_sessions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- One PIN try, counted atomically before the PIN is checked (parallel guesses can't slip past the pause).
-- Returns the try number, or null while the PIN is paused. Pauses: 5th try 15 min, 10th 1 h, 15th on 24 h.
create or replace function public.vault_pin_try(p_member uuid)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.vault_pins set
    failed_attempts = failed_attempts + 1,
    locked_until = case
      when failed_attempts + 1 >= 15 then now() + interval '24 hours'
      when failed_attempts + 1 = 10 then now() + interval '1 hour'
      when (failed_attempts + 1) % 5 = 0 then now() + interval '15 minutes'
      else locked_until end,
    updated_at = now()
  where member_id = p_member and (locked_until is null or locked_until <= now())
  returning failed_attempts;
$$;
revoke all on function public.vault_pin_try(uuid) from public, anon, authenticated;
grant execute on function public.vault_pin_try(uuid) to service_role;

-- private bucket for vault attachments: no user policies at all (signed links from the function only)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('vault-files', 'vault-files', false, 5242880, array['image/webp', 'image/jpeg', 'image/png', 'application/pdf'])
      on conflict (id) do nothing;
  end if;
end $$;

-- clean-up: expired unlock sessions and challenges (the function purges vault trash itself, with its files)
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
  delete from public.vault_sessions where hard_expires_at < now() or expires_at < now();
  delete from public.vault_challenges where expires_at < now();
end;
$$;
revoke all on function public.purge_trash() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.vault_items;
  end if;
end $$;
