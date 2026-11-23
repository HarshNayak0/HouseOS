-- Phase 3 follow-up: remove a "done" record at any time (e.g. tapped Done by mistake).
-- If it's the chore's latest completion, the chore goes back to that due date and person;
-- otherwise the record is just removed from the log. Removed records are soft-deleted and purged after 7 days.

create or replace function public.remove_chore_completion(p_completion uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.chore_completions;
  v_latest boolean;
begin
  select * into v_c from public.chore_completions
    where id = p_completion and household_id = public.my_household_id() and deleted_at is null
    for update;
  if v_c.id is null then raise exception 'That record no longer exists' using errcode = 'P0002'; end if;
  v_latest := not exists (
    select 1 from public.chore_completions
    where chore_id = v_c.chore_id and deleted_at is null and completed_at > v_c.completed_at
  );
  update public.chore_completions set deleted_at = now() where id = v_c.id;
  delete from public.activity_log
    where entity_id = v_c.chore_id and verb = 'chore.done'
      and created_at between v_c.completed_at - interval '5 seconds' and v_c.completed_at + interval '5 seconds';
  if v_latest then
    update public.chores set next_due_at = v_c.due_at, assignee_id = v_c.assignee_at_time
      where id = v_c.chore_id and deleted_at is null;
    return 'undone';
  end if;
  return 'removed';
end;
$$;

-- The Undo button after "Done" now uses the same logic.
create or replace function public.undo_chore_completion(p_completion uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.remove_chore_completion(p_completion);
end;
$$;

revoke all on function public.remove_chore_completion(uuid) from public;
grant execute on function public.remove_chore_completion(uuid) to authenticated;

-- purge removed completion records along with the rest of the trash
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
  update public.notes set archived_at = now() where expires_at < now() and archived_at is null and deleted_at is null;
  delete from public.activity_log where created_at < now() - interval '90 days';
end;
$$;
revoke all on function public.purge_trash() from public, anon, authenticated;
