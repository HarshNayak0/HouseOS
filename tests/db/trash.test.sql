-- Guard: every table with a `deleted_at` (trash) column must either be emptied by purge_trash() after
-- 7 days, or be listed below with the reason it isn't. A new table that's in neither fails this test,
-- so nothing can quietly pile up in the trash forever.
\set ON_ERROR_STOP on
do $$
declare
  src text := (select prosrc from pg_proc where proname = 'purge_trash' and pronamespace = 'public'::regnamespace);
  missing text;
begin
  select string_agg(c.table_name, ', ' order by c.table_name) into missing
  from information_schema.columns c
  where c.table_schema = 'public' and c.column_name = 'deleted_at'
    and position('''' || c.table_name || '''' in src) = 0          -- not in purge_trash's table list
    and position('public.' || c.table_name || ' ' in src) = 0      -- nor cleaned by its own statement
    and c.table_name not in (
      'members', 'households', 'household_settings', 'invites',    -- the household itself: leaving is handled by its own functions
      'notification_prefs', 'push_subscriptions',                  -- per-device settings, deleted for real when removed
      'calendar_accounts', 'calendar_sources',                     -- removed by the calendar function on disconnect
      'item_frequency',                                             -- quick-add suggestions must outlive the trash
      'recipe_ingredients', 'recipe_steps', 'recipe_ratings',       -- replaced on save / go with their recipe (cascade)
      'date_ratings',                                               -- goes with its memory (cascade)
      'vault_items'                                                 -- the vault function purges these, with their files
    );
  assert missing is null, 'tables with a trash column that nothing empties: ' || missing;
end $$;
select 'trash guard passed' as result;
