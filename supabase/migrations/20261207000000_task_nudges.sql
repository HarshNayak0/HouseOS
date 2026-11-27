-- High-priority task nudges: the notify function records each one it sends (claimed before sending,
-- so nobody gets the same nudge twice). Service role only; rows older than two weeks are deleted by
-- notify itself. Safe to run more than once.
create table if not exists public.task_nudge_log (
  member_id uuid not null references public.members (id) on delete cascade,
  day date not null,
  slot text not null check (slot in ('am', 'pm')),
  sent_at timestamptz not null default now(),
  primary key (member_id, day, slot)
);
alter table public.task_nudge_log enable row level security;
revoke all on public.task_nudge_log from anon, authenticated;
grant all on public.task_nudge_log to service_role;
