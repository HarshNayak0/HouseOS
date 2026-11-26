-- Phase 3b: push reminders.
-- The `notify` Edge Function decides what's due and sends Web Push. These columns record what has
-- already been sent; pg_cron calls the function every 5 minutes and a trigger calls it when a note is posted.

alter table public.chores add column if not exists reminded_due_at timestamptz;
alter table public.tasks add column if not exists reminded_due_at timestamptz;
alter table public.notes add column if not exists notified_at timestamptz;
-- (clients have no grant on these columns; only the function, using the service role, writes them)

-- default per-kind switches for existing prefs rows
update public.notification_prefs set kinds = '{"notes": true, "chores": true, "tasks": true}'::jsonb || kinds;
alter table public.notification_prefs alter column kinds set default '{"notes": true, "chores": true, "tasks": true}'::jsonb;

-- Ask the notify function to run now. Uses pg_net (asynchronous, so it never slows down a save).
-- (The address comes from app_config, filled in by the notify function itself: see 20261206_instance_config.)
create or replace function public.ping_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regproc('net.http_post') is null then return; end if; -- pg_net not installed (e.g. local tests)
  -- the address lives in app_config (20261206_instance_config); until then, do nothing
  if to_regclass('public.app_config') is null or not exists (select 1 from public.app_config where key = 'functions_url') then return; end if;
  perform net.http_post(
    url := (select value from public.app_config where key = 'functions_url') || '/' || 'notify',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.ping_notify() from public, anon, authenticated;

create or replace function public.notes_ping_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ping_notify();
  return new;
end;
$$;
create trigger notes_ping_notify after insert on public.notes for each row execute function public.notes_ping_notify();

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('veedu-reminders', '*/5 * * * *', 'select public.ping_notify()');
  end if;
end $$;
