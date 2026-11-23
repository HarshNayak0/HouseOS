-- Tiny function the keep-alive workflow calls every 3 days so the free project never pauses.
create or replace function public.ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;

grant execute on function public.ping() to anon, authenticated;
