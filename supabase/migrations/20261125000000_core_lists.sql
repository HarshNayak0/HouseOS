-- Phase 3: shopping list, tasks + subtasks, chores + completions, notes board.
-- Same rules as phase 2: RLS limited to the caller's household; every row has household_id,
-- created_by, created_at, updated_at, deleted_at. Deletes are soft (deleted_at) and purged after 7 days.

-- updated_at + updated_by on every change (used for the "updated by … just now" hint)
create or replace function public.set_updated_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- assignees must live in the same household
create or replace function public.check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.members m where m.id = new.assignee_id and m.household_id = new.household_id
  ) then
    raise exception 'Assignee is not in this household' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  normalized_name text not null default '',
  qty numeric check (qty is null or qty > 0),
  unit text check (char_length(unit) <= 20),
  store text not null default 'Any store' check (char_length(store) between 1 and 40),
  category text check (char_length(category) <= 40),
  source_recipe_id uuid,
  checked_at timestamptz,
  checked_by uuid references public.members (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index shopping_items_household_idx on public.shopping_items (household_id, created_at);

-- learned from history for quick-add suggestions (survives the trash purge)
create table public.item_frequency (
  household_id uuid not null references public.households (id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  times_added integer not null default 1,
  last_store text,
  last_added_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (household_id, normalized_name)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  notes text check (char_length(notes) <= 2000),
  due_at timestamptz,
  due_has_time boolean not null default false,
  assignee_id uuid references public.members (id) on delete set null, -- null = both
  priority smallint not null default 0 check (priority between 0 and 3),
  visibility text not null default 'shared' check (visibility in ('shared', 'personal')),
  completed_at timestamptz,
  completed_by uuid references public.members (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_household_idx on public.tasks (household_id, due_at);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  done boolean not null default false,
  position integer not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index subtasks_task_idx on public.subtasks (task_id);

create table public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  notes text check (char_length(notes) <= 1000),
  rrule text not null check (rrule ~ '^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$'),
  dtstart timestamptz not null,
  next_due_at timestamptz not null,
  assignment_mode text not null default 'fixed' check (assignment_mode in ('fixed', 'rotating')),
  assignee_id uuid references public.members (id) on delete set null, -- null = both
  remind boolean not null default true,
  paused boolean not null default false,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index chores_household_idx on public.chores (household_id, next_due_at);

create table public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  chore_id uuid not null references public.chores (id) on delete cascade,
  completed_by uuid references public.members (id) on delete set null,
  completed_at timestamptz not null default now(),
  due_at timestamptz not null,
  assignee_at_time uuid references public.members (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index chore_completions_household_idx on public.chore_completions (household_id, completed_at desc);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  color text not null default 'turmeric' check (color in ('turmeric', 'lotus', 'leaf', 'sky', 'sand')),
  pinned boolean not null default false,
  expires_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index notes_household_idx on public.notes (household_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['shopping_items','tasks','subtasks','chores','notes'] loop
    execute format('create trigger set_updated_meta before update on public.%I for each row execute function public.set_updated_meta()', t);
  end loop;
  foreach t in array array['item_frequency','chore_completions'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
create trigger check_assignee before insert or update of assignee_id on public.tasks for each row execute function public.check_assignee();
create trigger check_assignee before insert or update of assignee_id on public.chores for each row execute function public.check_assignee();

-- shopping: normalise names, record who ticked an item, learn frequent items
create or replace function public.shopping_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := trim(new.name);
  new.normalized_name := lower(regexp_replace(new.name, '\s+', ' ', 'g'));
  new.store := coalesce(nullif(trim(new.store), ''), 'Any store');
  if tg_op = 'UPDATE' and new.checked_at is distinct from old.checked_at then
    new.checked_by := case when new.checked_at is null then null else public.my_member_id() end;
  end if;
  return new;
end;
$$;
create trigger shopping_before before insert or update on public.shopping_items for each row execute function public.shopping_before();

create or replace function public.shopping_learn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.item_frequency (household_id, normalized_name, display_name, last_store, created_by)
    values (new.household_id, new.normalized_name, new.name, new.store, auth.uid())
  on conflict (household_id, normalized_name) do update
    set times_added = public.item_frequency.times_added + 1,
        display_name = excluded.display_name,
        last_store = excluded.last_store,
        last_added_at = now();
  return new;
end;
$$;
create trigger shopping_learn after insert on public.shopping_items for each row execute function public.shopping_learn();

-- tasks: record who completed
create or replace function public.tasks_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.completed_at is distinct from old.completed_at then
    new.completed_by := case when new.completed_at is null then null else public.my_member_id() end;
  end if;
  return new;
end;
$$;
create trigger tasks_before before update on public.tasks for each row execute function public.tasks_before();

-- activity feed entries (shared items only; personal tasks are never logged)
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_verb text;
  v_summary text;
begin
  if tg_table_name = 'shopping_items' then
    if tg_op = 'INSERT' then v_verb := 'shopping.added'; v_summary := 'added ' || new.name || ' to the shopping list';
    elsif new.checked_at is not null and old.checked_at is null then v_verb := 'shopping.checked'; v_summary := 'got ' || new.name;
    end if;
  elsif tg_table_name = 'tasks' then
    if new.visibility = 'personal' then return new; end if;
    if tg_op = 'INSERT' then v_verb := 'task.added'; v_summary := 'added the task “' || new.title || '”';
    elsif new.completed_at is not null and old.completed_at is null then v_verb := 'task.done'; v_summary := 'finished “' || new.title || '”';
    end if;
  elsif tg_table_name = 'chores' and tg_op = 'INSERT' then
    v_verb := 'chore.added'; v_summary := 'added the chore “' || new.title || '”';
  elsif tg_table_name = 'notes' and tg_op = 'INSERT' then
    v_verb := 'note.added'; v_summary := 'left a note';
  end if;
  if v_verb is not null then
    insert into public.activity_log (household_id, actor_id, verb, entity_type, entity_id, summary, created_by)
      values (new.household_id, public.my_member_id(), v_verb, tg_table_name, new.id, left(v_summary, 200), auth.uid());
  end if;
  return new;
end;
$$;
create trigger log_activity after insert or update on public.shopping_items for each row execute function public.log_activity();
create trigger log_activity after insert or update on public.tasks for each row execute function public.log_activity();
create trigger log_activity after insert on public.chores for each row execute function public.log_activity();
create trigger log_activity after insert on public.notes for each row execute function public.log_activity();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.shopping_items enable row level security;
alter table public.item_frequency enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.chores enable row level security;
alter table public.chore_completions enable row level security;
alter table public.notes enable row level security;

create policy shopping_select on public.shopping_items for select to authenticated using (household_id = public.my_household_id());
create policy shopping_insert on public.shopping_items for insert to authenticated with check (household_id = public.my_household_id());
create policy shopping_update on public.shopping_items for update to authenticated
  using (household_id = public.my_household_id()) with check (household_id = public.my_household_id());

create policy frequency_select on public.item_frequency for select to authenticated using (household_id = public.my_household_id());

-- personal tasks are visible only to whoever created them
create policy tasks_select on public.tasks for select to authenticated
  using (household_id = public.my_household_id() and (visibility = 'shared' or created_by = auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated with check (household_id = public.my_household_id());
create policy tasks_update on public.tasks for update to authenticated
  using (household_id = public.my_household_id() and (visibility = 'shared' or created_by = auth.uid()))
  with check (household_id = public.my_household_id() and (visibility = 'shared' or created_by = auth.uid()));

create policy subtasks_select on public.subtasks for select to authenticated
  using (household_id = public.my_household_id() and exists (select 1 from public.tasks t where t.id = task_id));
create policy subtasks_insert on public.subtasks for insert to authenticated
  with check (household_id = public.my_household_id() and exists (select 1 from public.tasks t where t.id = task_id));
create policy subtasks_update on public.subtasks for update to authenticated
  using (household_id = public.my_household_id() and exists (select 1 from public.tasks t where t.id = task_id))
  with check (household_id = public.my_household_id());

create policy chores_select on public.chores for select to authenticated using (household_id = public.my_household_id());
create policy chores_insert on public.chores for insert to authenticated with check (household_id = public.my_household_id());
create policy chores_update on public.chores for update to authenticated
  using (household_id = public.my_household_id()) with check (household_id = public.my_household_id());

create policy completions_select on public.chore_completions for select to authenticated using (household_id = public.my_household_id());

create policy notes_select on public.notes for select to authenticated using (household_id = public.my_household_id());
create policy notes_insert on public.notes for insert to authenticated with check (household_id = public.my_household_id());
create policy notes_update on public.notes for update to authenticated
  using (household_id = public.my_household_id()) with check (household_id = public.my_household_id());

-- column-level grants (no hard deletes from clients; everything soft-deletes)
revoke all on public.shopping_items, public.item_frequency, public.tasks, public.subtasks, public.chores,
  public.chore_completions, public.notes from anon, authenticated;
grant select on public.shopping_items, public.item_frequency, public.tasks, public.subtasks, public.chores,
  public.chore_completions, public.notes to authenticated;
grant insert (id, household_id, name, qty, unit, store, category, source_recipe_id) on public.shopping_items to authenticated;
grant update (name, qty, unit, store, category, checked_at, deleted_at) on public.shopping_items to authenticated;
grant insert (id, household_id, title, notes, due_at, due_has_time, assignee_id, priority, visibility) on public.tasks to authenticated;
grant update (title, notes, due_at, due_has_time, assignee_id, priority, visibility, completed_at, deleted_at) on public.tasks to authenticated;
grant insert (id, household_id, task_id, title, position) on public.subtasks to authenticated;
grant update (title, done, position, deleted_at) on public.subtasks to authenticated;
grant insert (id, household_id, title, notes, rrule, dtstart, next_due_at, assignment_mode, assignee_id, remind) on public.chores to authenticated;
grant update (title, notes, rrule, dtstart, next_due_at, assignment_mode, assignee_id, remind, paused, deleted_at) on public.chores to authenticated;
grant insert (id, household_id, body, color, pinned, expires_at) on public.notes to authenticated;
grant update (body, color, pinned, expires_at, archived_at, deleted_at) on public.notes to authenticated;

-- ---------------------------------------------------------------------------
-- chores: complete / undo
-- ---------------------------------------------------------------------------
-- Marks the current occurrence done and moves the chore to its next occurrence (computed by the app
-- from the RRULE in Toronto time). Rotating chores pass to the other person.
create or replace function public.complete_chore(p_chore uuid, p_next_due timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chore public.chores;
  v_me uuid := public.my_member_id();
  v_next_assignee uuid;
  v_completion uuid;
begin
  select * into v_chore from public.chores
    where id = p_chore and household_id = public.my_household_id() and deleted_at is null
    for update;
  if v_chore.id is null then raise exception 'Chore not found' using errcode = 'P0002'; end if;
  if p_next_due is null or p_next_due <= v_chore.next_due_at then
    raise exception 'The next due date must be after the current one' using errcode = '22023';
  end if;
  v_next_assignee := v_chore.assignee_id;
  if v_chore.assignment_mode = 'rotating' then
    select m.id into v_next_assignee from public.members m
      where m.household_id = v_chore.household_id and m.deleted_at is null
        and m.id is distinct from v_chore.assignee_id
      order by m.created_at limit 1;
    v_next_assignee := coalesce(v_next_assignee, v_chore.assignee_id);
  end if;
  insert into public.chore_completions (household_id, chore_id, completed_by, due_at, assignee_at_time, created_by)
    values (v_chore.household_id, v_chore.id, v_me, v_chore.next_due_at, v_chore.assignee_id, auth.uid())
    returning id into v_completion;
  update public.chores set next_due_at = p_next_due, assignee_id = v_next_assignee where id = v_chore.id;
  insert into public.activity_log (household_id, actor_id, verb, entity_type, entity_id, summary, created_by)
    values (v_chore.household_id, v_me, 'chore.done', 'chores', v_chore.id, left('did “' || v_chore.title || '”', 200), auth.uid());
  return v_completion;
end;
$$;

-- Undo a completion you made in the last 24 h (puts the chore back as it was).
create or replace function public.undo_chore_completion(p_completion uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.chore_completions;
begin
  select * into v_c from public.chore_completions
    where id = p_completion and household_id = public.my_household_id() and completed_by = public.my_member_id()
      and completed_at > now() - interval '24 hours'
    for update;
  if v_c.id is null then raise exception 'Nothing to undo' using errcode = 'P0002'; end if;
  if exists (select 1 from public.chore_completions where chore_id = v_c.chore_id and completed_at > v_c.completed_at) then
    raise exception 'Only the latest completion can be undone' using errcode = 'P0001';
  end if;
  update public.chores set next_due_at = v_c.due_at, assignee_id = v_c.assignee_at_time where id = v_c.chore_id;
  delete from public.chore_completions where id = v_c.id;
  delete from public.activity_log where entity_id = v_c.chore_id and verb = 'chore.done' and created_at >= v_c.completed_at;
end;
$$;

revoke all on function public.complete_chore(uuid, timestamptz), public.undo_chore_completion(uuid) from public;
grant execute on function public.complete_chore(uuid, timestamptz), public.undo_chore_completion(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- housekeeping: purge the 7-day trash, archive expired notes, prune the activity feed
-- ---------------------------------------------------------------------------
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
  delete from public.notes where deleted_at < now() - interval '7 days';
  update public.notes set archived_at = now() where expires_at < now() and archived_at is null and deleted_at is null;
  delete from public.activity_log where created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.purge_trash() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('veedu-housekeeping', '17 * * * *', 'select public.purge_trash()');
  end if;
end $$;

-- realtime for every list
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_items, public.tasks, public.subtasks,
      public.chores, public.chore_completions, public.notes, public.activity_log;
  end if;
end $$;
