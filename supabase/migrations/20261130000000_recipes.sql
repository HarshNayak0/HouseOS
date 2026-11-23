-- Phase 6: recipe box. Imports (website JSON-LD / Gemini for captions) run in the `recipes` Edge Function.
-- Photos live in a private Storage bucket, one folder per household.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 140),
  photo_path text check (photo_path is null or char_length(photo_path) <= 300),
  prep_min integer check (prep_min is null or prep_min between 0 and 2880),
  cook_min integer check (cook_min is null or cook_min between 0 and 2880),
  servings numeric check (servings is null or (servings > 0 and servings <= 100)),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  creator text check (char_length(creator) <= 80),
  notes text check (char_length(notes) <= 2000),
  import_job_id uuid,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recipes_household_idx on public.recipes (household_id, created_at desc);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null default 0,
  qty numeric check (qty is null or qty > 0),
  unit text check (char_length(unit) <= 20),
  item text not null check (char_length(trim(item)) between 1 and 120),
  note text check (char_length(note) <= 120),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  position integer not null default 0,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);

create table public.recipe_ratings (
  household_id uuid not null references public.households (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  rating smallint check (rating is null or rating between 1 and 5),
  note text check (char_length(note) <= 1000),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (recipe_id, member_id)
);

create table public.recipe_import_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('url', 'caption')),
  source_url text,
  status text not null default 'queued' check (status in ('queued', 'reading', 'structuring', 'ready', 'failed')),
  method text check (method in ('json-ld', 'gemini')),
  error text,
  draft jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index recipe_import_jobs_household_idx on public.recipe_import_jobs (household_id, created_at desc);

create trigger set_updated_meta before update on public.recipes for each row execute function public.set_updated_meta();
do $$
declare t text;
begin
  foreach t in array array['recipe_ingredients','recipe_steps','recipe_ratings','recipe_import_jobs'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- activity feed
create or replace function public.log_recipe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_log (household_id, actor_id, verb, entity_type, entity_id, summary, created_by)
    values (new.household_id, public.my_member_id(), 'recipe.added', 'recipes', new.id, left('added the recipe “' || new.title || '”', 200), auth.uid());
  return new;
end;
$$;
create trigger log_recipe after insert on public.recipes for each row execute function public.log_recipe();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_ratings enable row level security;
alter table public.recipe_import_jobs enable row level security;

create policy recipes_select on public.recipes for select to authenticated using (household_id = public.my_household_id());
create policy recipes_update on public.recipes for update to authenticated
  using (household_id = public.my_household_id()) with check (household_id = public.my_household_id());
create policy ingredients_select on public.recipe_ingredients for select to authenticated using (household_id = public.my_household_id());
create policy steps_select on public.recipe_steps for select to authenticated using (household_id = public.my_household_id());
create policy ratings_select on public.recipe_ratings for select to authenticated using (household_id = public.my_household_id());
create policy ratings_insert on public.recipe_ratings for insert to authenticated
  with check (household_id = public.my_household_id() and member_id = public.my_member_id());
create policy ratings_update on public.recipe_ratings for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
create policy import_jobs_select on public.recipe_import_jobs for select to authenticated using (household_id = public.my_household_id());

revoke all on public.recipes, public.recipe_ingredients, public.recipe_steps, public.recipe_ratings, public.recipe_import_jobs from anon, authenticated;
grant select on public.recipes, public.recipe_ingredients, public.recipe_steps, public.recipe_ratings, public.recipe_import_jobs to authenticated;
-- recipes are created/edited through save_recipe(); the app may only soft-delete or change the photo directly
grant update (deleted_at, photo_path) on public.recipes to authenticated;
grant insert (household_id, recipe_id, member_id, rating, note) on public.recipe_ratings to authenticated;
grant update (rating, note) on public.recipe_ratings to authenticated;
grant all on public.recipes, public.recipe_ingredients, public.recipe_steps, public.recipe_ratings, public.recipe_import_jobs to service_role;

-- ---------------------------------------------------------------------------
-- save_recipe: create or replace a recipe with its ingredients and steps in one transaction
-- p = { title, photo_path, prep_min, cook_min, servings, tags[], source_url, creator, notes, import_job_id,
--       ingredients: [{ qty, unit, item, note }], steps: [ "..." ] }
-- ---------------------------------------------------------------------------
create or replace function public.save_recipe(p jsonb, p_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := public.my_household_id();
  v_id uuid := p_id;
  v_ing jsonb;
  v_step jsonb;
  v_pos integer := 0;
begin
  if v_household is null then raise exception 'Not in a household' using errcode = '28000'; end if;
  if jsonb_array_length(coalesce(p->'ingredients', '[]')) > 80 or jsonb_array_length(coalesce(p->'steps', '[]')) > 60 then
    raise exception 'That recipe is too long' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.recipes (household_id, title, photo_path, prep_min, cook_min, servings, tags, source_url, creator, notes, import_job_id, created_by, updated_by)
    values (
      v_household, trim(p->>'title'), nullif(p->>'photo_path', ''), (p->>'prep_min')::integer, (p->>'cook_min')::integer,
      (p->>'servings')::numeric, coalesce(array(select jsonb_array_elements_text(coalesce(p->'tags', '[]'))), '{}'),
      nullif(p->>'source_url', ''), nullif(p->>'creator', ''), nullif(p->>'notes', ''), (p->>'import_job_id')::uuid, auth.uid(), auth.uid()
    ) returning id into v_id;
  else
    update public.recipes set
      title = trim(p->>'title'), photo_path = nullif(p->>'photo_path', ''), prep_min = (p->>'prep_min')::integer,
      cook_min = (p->>'cook_min')::integer, servings = (p->>'servings')::numeric,
      tags = coalesce(array(select jsonb_array_elements_text(coalesce(p->'tags', '[]'))), '{}'),
      source_url = nullif(p->>'source_url', ''), creator = nullif(p->>'creator', ''), notes = nullif(p->>'notes', '')
    where id = v_id and household_id = v_household and deleted_at is null;
    if not found then raise exception 'Recipe not found' using errcode = 'P0002'; end if;
    delete from public.recipe_ingredients where recipe_id = v_id;
    delete from public.recipe_steps where recipe_id = v_id;
  end if;
  for v_ing in select * from jsonb_array_elements(coalesce(p->'ingredients', '[]')) loop
    if coalesce(trim(v_ing->>'item'), '') = '' then continue; end if;
    insert into public.recipe_ingredients (household_id, recipe_id, position, qty, unit, item, note, created_by)
      values (v_household, v_id, v_pos, nullif(v_ing->>'qty', '')::numeric, nullif(trim(v_ing->>'unit'), ''), trim(v_ing->>'item'), nullif(trim(v_ing->>'note'), ''), auth.uid());
    v_pos := v_pos + 1;
  end loop;
  v_pos := 0;
  for v_step in select * from jsonb_array_elements(coalesce(p->'steps', '[]')) loop
    if coalesce(trim(v_step #>> '{}'), '') = '' then continue; end if;
    insert into public.recipe_steps (household_id, recipe_id, position, body, created_by)
      values (v_household, v_id, v_pos, trim(v_step #>> '{}'), auth.uid());
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.save_recipe(jsonb, uuid) from public;
grant execute on function public.save_recipe(jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket "recipe-photos", folder per household (<household_id>/<file>.webp)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('recipe-photos', 'recipe-photos', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
      on conflict (id) do nothing;
    execute $p$create policy "recipe photos: household read" on storage.objects for select to authenticated
      using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = public.my_household_id()::text)$p$;
    execute $p$create policy "recipe photos: household upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = public.my_household_id()::text)$p$;
    execute $p$create policy "recipe photos: household delete" on storage.objects for delete to authenticated
      using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = public.my_household_id()::text)$p$;
  end if;
end $$;

-- purge with the rest of the trash; import jobs kept 60 days (for the rate limit and debugging)
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
  delete from public.recipes where deleted_at < now() - interval '7 days';
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
    alter publication supabase_realtime add table public.recipes, public.recipe_ingredients, public.recipe_steps,
      public.recipe_ratings, public.recipe_import_jobs;
  end if;
end $$;
