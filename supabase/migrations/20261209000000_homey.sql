-- Making the house feel like home: the chappals at the door (who has opened Veedu today), the brass
-- nameplate on the gate, three framed photos in the living room, and which festivals decorate the house.
-- Safe to run more than once.

-- the day (home time) each person last opened Veedu: their chappals sit at the door that day
alter table public.members add column if not exists last_seen_on date;
grant update (last_seen_on) on public.members to authenticated;

-- nameplate text (null = your two names), the living-room photos, festivals turned off
alter table public.household_settings add column if not exists nameplate text;
alter table public.household_settings add column if not exists wall_photos jsonb not null default '[]'::jsonb;
alter table public.household_settings add column if not exists decor_off text[] not null default '{}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'household_settings_nameplate_check') then
    alter table public.household_settings add constraint household_settings_nameplate_check
      check (nameplate is null or char_length(trim(nameplate)) between 1 and 32);
    -- up to three frames: [{"path": "<household>/photos/<file>"} | null, ...]
    alter table public.household_settings add constraint household_settings_wall_photos_check
      check (jsonb_typeof(wall_photos) = 'array' and jsonb_array_length(wall_photos) <= 3 and octet_length(wall_photos::text) <= 2000);
    alter table public.household_settings add constraint household_settings_decor_off_check
      check (decor_off <@ array['onam', 'vishu', 'diwali', 'christmas', 'halloween', 'seasons', 'anniversary', 'birthday']::text[]);
  end if;
end $$;
grant update (nameplate, wall_photos, decor_off) on public.household_settings to authenticated;
