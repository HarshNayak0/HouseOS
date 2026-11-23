-- Let the server-side admin role (service_role, used only by Edge Functions such as `notify`) read and
-- write the app's tables. Newer Supabase projects no longer grant this automatically.
-- service_role bypasses RLS and is never used by the app in the browser.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
