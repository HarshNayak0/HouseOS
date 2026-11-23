-- Phase 6: recipes.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'harsh@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'prerna@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'stranger@example.com');
create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create temp table t_tok (token text);
create temp table t_r (id uuid);
grant all on t_tok, t_r to authenticated;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select public.create_household('Harsh', 'teak');
insert into t_tok select public.create_invite();
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b2');
select public.accept_invite((select token from t_tok), 'Prerna', 'lotus');
insert into t_r select public.save_recipe('{"title":"Kerala vegetable stew","servings":4,"prep_min":15,"cook_min":20,"tags":["Weeknight"],"source_url":"https://example.com/stew","creator":"@cook",
  "ingredients":[{"qty":2,"unit":"cup","item":"coconut milk"},{"qty":null,"unit":null,"item":"curry leaves"},{"item":"  "}],"steps":["Sauté the spices","Add vegetables",""]}'::jsonb);
do $$ begin
  assert (select count(*) from public.recipe_ingredients) = 2, 'blank ingredients skipped';
  assert (select count(*) from public.recipe_steps) = 2, 'blank steps skipped';
  assert (select tags from public.recipes) = '{Weeknight}', 'tags saved';
  assert (select count(*) from public.activity_log where verb = 'recipe.added') = 1, 'activity logged';
end $$;
-- edit replaces ingredients and steps
select public.save_recipe('{"title":"Vegetable stew","ingredients":[{"qty":1,"unit":"can","item":"coconut milk"}],"steps":["Simmer"]}'::jsonb, (select id from t_r));
do $$ begin
  assert (select title from public.recipes) = 'Vegetable stew', 'title edited';
  assert (select count(*) from public.recipe_ingredients) = 1, 'ingredients replaced';
end $$;
-- ratings: one per person, only your own
insert into public.recipe_ratings (household_id, recipe_id, member_id, rating) select household_id, id, public.my_member_id(), 5 from public.recipes;
do $$ begin
  insert into public.recipe_ratings (household_id, recipe_id, member_id, rating)
    select r.household_id, r.id, m.id, 1 from public.recipes r, public.members m where m.display_name = 'Harsh';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
-- the app can't write recipes directly (only through save_recipe)
do $$ begin
  insert into public.recipes (household_id, title) values (public.my_household_id(), 'x');
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update public.recipes set title = 'hacked';
  raise exception 'should have failed';
exception when insufficient_privilege then null;
end $$;
update public.recipes set deleted_at = now();
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.recipe_ratings) = 1, 'Harsh sees Prerna''s rating';
  assert (select deleted_at from public.recipes) is not null, 'soft deleted';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3');
do $$ begin
  assert (select count(*) from public.recipes) + (select count(*) from public.recipe_ingredients) + (select count(*) from public.recipe_ratings) = 0, 'stranger sees nothing';
  perform public.save_recipe('{"title":"x"}'::jsonb);
  raise exception 'should have failed';
exception when invalid_authorization_specification then null;
end $$;
reset role;
select 'recipe tests passed' as result;
