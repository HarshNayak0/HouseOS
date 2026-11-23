-- Recipe imports can also come from screenshots (read by Gemini).
alter table public.recipe_import_jobs drop constraint if exists recipe_import_jobs_kind_check;
alter table public.recipe_import_jobs add constraint recipe_import_jobs_kind_check check (kind in ('url', 'caption', 'screenshots'));
