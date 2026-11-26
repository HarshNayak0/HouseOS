-- Per-copy settings, so the same migrations work for any couple's Supabase project.
--
-- app_config.functions_url: where pg_cron and the triggers send their "run now" pings. The notify
-- function writes its own address here on every run, so a new copy fills it in by itself on its first
-- deploy. For a database that already had the address written into its ping functions, it's copied
-- across below. Until it's known, the pings simply do nothing. Safe to run more than once.

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
revoke all on public.app_config from anon, authenticated;
grant all on public.app_config to service_role;

-- an existing copy: keep the address its ping functions already used
insert into public.app_config (key, value)
select 'functions_url', m[1]
from pg_proc p, regexp_match(p.prosrc, '(https://[a-z0-9]+\.supabase\.co/functions/v1)') as m
where p.proname in ('ping_notify', 'ping_function') and p.pronamespace = 'public'::regnamespace and m is not null
limit 1
on conflict (key) do nothing;

create or replace function public.ping_function(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare base text;
begin
  if to_regproc('net.http_post') is null then return; end if; -- pg_net not installed (e.g. local tests)
  select value into base from public.app_config where key = 'functions_url';
  if base is null then return; end if; -- not known yet: the first deploy fills it in
  perform net.http_post(
    url := base || '/' || p_name,
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.ping_function(text) from public, anon, authenticated;

create or replace function public.ping_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ping_function('notify');
end;
$$;
revoke all on function public.ping_notify() from public, anon, authenticated;
