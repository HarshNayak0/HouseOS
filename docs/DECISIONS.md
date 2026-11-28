# Decisions log

Short log of choices and why. Newest first.

| Date | Decision | Why |
|---|---|---|
| 2026-11-29 | Notes (and the note you're writing) keep dark text and icons in every look | They're always paper-coloured; at night the typed text was cream on yellow |
| 2026-11-29 | Camera outside: damped glide, soft (eased) compound edge, zoom to screen centre (not cursor), double-tap the yard to focus there; taps only count with one finger, quick, on the house | Harsh found free movement clunky; pinches were being read as taps and zoom-to-cursor swings the tilted view |
| 2026-11-29 | Jasmine marker + close-up view and card; vine rebuilt in detail (shoots, leaf pairs, five-petal flowers, buds) | Harsh asked to see the jasmine up close |
| 2026-11-29 | Grocery tick-off: the item's name flies in an arc into the basket (following it as the row closes), the row collapses, the basket bounces, and the item eases into the basket list | The fade-in-place version read as the item vanishing and reappearing |
| 2026-11-29 | Outside the house the camera can pan along the ground and come as close as 1.6 m (target kept inside the compound; Recentre button; no idle drift once moved); inside it stays fixed | Harsh couldn't read the nameplate with the pivot locked to the house centre |
| 2026-11-29 | Room labels use the panel colour tokens (dark at night) | Cream text on cream bubbles was unreadable in the night look |
| 2026-11-29 | Basket moment made bigger (a basket pops up in the row) and reduce-motion now gets fades instead of nothing | The first version was too quick and small to notice, and disappeared entirely with reduce motion on |
| 2026-11-29 | Panels follow the sun with four looks (morning, day, dusk, night) via colour tokens redefined on `html[data-look]`; hard-coded hex colours in panels replaced by tokens | One switch changes every panel consistently; registered CSS properties let it fade; axe checks both day and night |
| 2026-11-29 | Nameplate, chappals (from a once-a-day `last_seen_on`, no location), three wall photos, a jasmine that grows with things done together (never shrinks or wilts) | Harsh's picks from the homey brainstorm; nothing that guilts or tracks |
| 2026-11-29 | Festivals and seasons computed on the device (`decor.ts`) with a small table of moving dates (Onam 2026–28; Diwali, Vishu 2026–30); unknown years show nothing rather than a guess | Almanacs disagreed for Onam after 2028; better no pookalam than one on the wrong day |
| 2026-11-29 | Garlands also both anniversaries (Oct 18 and Sep 11); Halloween pumpkins sit among the autumn leaves | Harsh's answers |
| 2026-11-29 | All sounds synthesised with Web Audio (no recordings) instead of downloading CC0 clips | No files to license, host or download; works offline; still $0 |
| 2026-11-29 | iPhone haptics through a hidden `<input type="checkbox" switch>` (iOS 18+) | iOS Safari has no vibration API; this is the only web option, and failing silently is harmless |
| 2026-11-29 | Homey decorations built once and shown/hidden; small pieces don't cast shadows; repeats are instanced | Draw calls ~200 → ~225 on the default view; frame rate unchanged |
| 2026-11-29 | The app reads the new columns but falls back if the migration hasn't run yet | Vercel deploys on push before the SQL is run by hand |
| 2026-11-28 | Trips v2: vibe (city / beach / cottage / event), transport and extras drive a pure packing-rules engine (`src/lib/packing.ts`); per-person lists plus one shared list; outfit wording chosen per person | Harsh wanted the least friction: the list should already be right. "Confident & Cozy" for him; "Cute & Comfy" offered to Prerna |
| 2026-11-28 | Suggested items carry a `rule_key`; a unique index (trip, owner, rule) stops both phones adding the same suggestion; hand edits set `edited` and are never overwritten; removing a suggestion sets qty 0 (not a delete) | So re-suggesting after a date or weather change can't undo your edits or bring back what you removed |
| 2026-11-28 | Learning is per person and per vibe (outfit share, quantity deltas, always-add, never-pack), stored in `packing_profiles` and only changed when you say "Remember" or do the after-trip check-in | Predictable: nothing changes silently. Nothing is sent to an AI service |
| 2026-11-28 | Weather from Open-Meteo (free, no key, 16-day forecast) via the browser; season guess before that | $0; no new secret or function |
| 2026-11-28 | Trip ideas are their own table (`trip_ideas`), not trips without dates | Calendar, lantern and dashboard all assume a trip has dates |
| 2026-11-28 | Share target switched to POST multipart (`/share/receive`): files go to the household bucket, then you pick the trip; text and links still go to the recipe import | Lets a ticket PDF be shared straight from email on Android (iPhone doesn't support web share targets) |
| 2026-11-28 | No pre-trip checklist or pet items; existing trips deleted by hand, not by the migration | Harsh's choice; the migration also runs on couples' copies, which must never lose data |
| 2026-11-27 | High-priority tasks: 8 am (in the digest) + 6 pm nudge until done; medium: daily digest line until done. From the due day (no date: from creation); owner only (assignee, else creator); high fades to digest-only after 7 days; own switch; one grouped, self-replacing notification; claimed in `task_nudge_log` | Harsh's choices after weighing notification fatigue: twice a day for high, once for medium |
| 2026-11-26 | Reusable copies: one codebase, one deployment per couple on the couple's own free accounts; settings in `instances/<slug>.json`, secrets in GitHub environments, `couples.yml` deploys with the CLIs (no Git link to their Vercel) | Keeps each copy at $0 and their data in their hands; two users per Google project need no verification; one code path to maintain |
| 2026-11-26 | Per-copy settings default to the original's values (Toronto, veeduos, its project ref) | The live copy needs no reconfiguration and behaves exactly as before |
| 2026-11-26 | Time zone generalised: `zonedToUtc` (app) and `_shared/tz.ts` (functions) work for any IANA zone; the "toronto…" names stay as aliases | The functions' old offsets were Toronto-only (−4/−5) |
| 2026-11-26 | Functions' address in `app_config`, written by `notify` itself; old migrations no longer contain the original's URL; the live database's address is copied over by the migration | A new copy must never ping the original project; no manual SQL per copy |
| 2026-11-26 | Function access for previews is a per-copy regex (`PREVIEW_ORIGIN_REGEX`), none by default | The Vercel team name was hard-coded |
| 2026-11-26 | Couples' migrations via `supabase db push` (tested on a fresh database: all 14 apply, a second push is a no-op); the original keeps SQL-editor runs | The original has no migration history; `migration repair` can switch it later |
| 2026-11-26 | The process is a project Claude skill (`.claude/skills/veedu-new-couple`) with references and templates | Repeatable setup and care, by the owner or Claude |
| 2026-11-26 | On touch screens every text field is ≥16 px (one unlayered CSS rule); `touch-action: manipulation` on the page | iPhone Safari zooms into fields under 16 px and stays zoomed, cropping the top and right; double-tap zoom on quick taps did the same. Pinch-to-zoom is kept (accessibility), no `maximum-scale` |
| 2026-11-26 | Quick add: one floating + over the house that fans out into Grocery / Task / Note; hidden while a panel is open | Capture in one tap from anywhere; rooms already have their own add box |
| 2026-11-26 | "I'm at the store": `store_visits` + DB triggers ping `notify`; partner gets "X is at Y", shopper gets items added during the visit; ends by hand or after 2 h | Push needs the server (the partner's subscriptions aren't readable by the app); claims prevent repeats |
| 2026-11-26 | Staples from `item_frequency` (count, first and last added): usual gap = span / (count − 1); due at 0.9× the gap; needs ≥3 purchases, gap ≥2 days, and stops after 4× | No new tables or history; good enough rhythm detection for groceries |
| 2026-11-26 | Free time for dates only (as asked): weekday evenings 6–10:30, weekends 10–10:30, 30 min buffer, timed events only, trips block days | All-day events are mostly holidays and birthdays |
| 2026-11-26 | Morning digest from `notify` at 8 am (dropped after 11), per person, nothing on an empty day, claimed in `digest_log` | One useful push instead of several; respects quiet hours and its own switch |
| 2026-11-26 | Instagram reels: no video scraping | Instagram blocks and forbids downloading reels from a server (and the free AI can't fetch them by link); captions and screenshots stay the way in |
| 2026-11-26 | Each room's panel is its own chunk (next/dynamic), prefetched 4 s after sign-in | First load 318 → 268 KB gzipped; rooms still open instantly |
| 2026-11-26 | Live rows stay fresh for 5 min (staleTime); realtime refreshes are batched per table (250 ms) | Realtime already keeps lists current; avoids ~10 refetches on every app focus and one refetch per row in a burst |
| 2026-11-26 | Edge Functions verify the caller with `getClaims` (local JWT check with asymmetric keys, else Auth) | Saves a network round trip per call; same result |
| 2026-11-26 | Shared function code in `supabase/functions/_shared/` (server, http, crypto, rules); one client `callFunction` | Removes ~150 duplicated lines; milestone labels had already drifted ("1 years") |
| 2026-11-26 | CORS for the functions: the app, this project's Vercel previews (`houseos-…-harsh-s-vercel`), localhost | Was any `*.vercel.app` for calendar and recipes |
| 2026-11-26 | Trash: DB test fails if a table with `deleted_at` is neither purged nor explicitly excluded | Auto-purging every such table would delete members and settings; a guard catches forgotten tables instead |
| 2026-11-26 | CI skips `playwright install-deps` when the browser is cached; deploy workflow smoke-tests every function | GitHub's runners already have Chromium's libraries (the apt step took 5 min); catches a function that fails to start |
| 2026-11-24 | Usage monitor: monthly `pg_cron` snapshot of DB size and Storage bytes, "Check now" (≤ every 10 min), dashboard warning at 70% | SPEC §5; the two hard Supabase limits are the only ones visible from SQL. Egress, function calls and Vercel are checked in their own dashboards |
| 2026-11-24 | Accessibility: axe (WCAG 2.1 A/AA) in the Playwright suite; floor-plan name pills moved out of the links (spoken name = English name + purpose) | Fixes "label in name"; an English screen reader can't read the Malayalam names anyway |
| 2026-11-24 | Person chips choose white or dark text by contrast; muted text darkened to #7a6b5d | Lotus and brass chips with white text failed AA |
| 2026-11-24 | `.env.example` and `env.ts` list only Vercel's variables; function secrets are GitHub Secrets only | Groq and the dispatch token were dropped in phase 6; fewer places for secrets |
| 2026-11-24 | Phase 8 split: 8a roof opening + automatic evening, 8b usage monitor, audits, tests, README | Two smaller things to test |
| 2026-11-24 | Courtyard opening: both tiers clipped around the nadumuttam, inner roof sloping into it, jaali light-well sides; mukhappu shortened to a front pediment (z 1.95–2.65) | SPEC asks for the opening; in the prototype the gable and the tall upper tier sit right over the courtyard, so a true funnel roof would need a ~75° pitch. This keeps the street silhouette |
| 2026-11-24 | Sunset computed on the device (NOAA formulas, Toronto lat/lng), evening = sunset −20 min to sunrise +15 min | No API, $0, works offline; accurate to about 2 minutes |
| 2026-11-24 | Evening preference per device (auto / day / evening); header button override lapses at the next sunrise or sunset | Matches the other display settings; auto never gets stuck |
| 2026-11-24 | Effects always use a block body `useEffect(() => { … })`, never a one-line arrow | Newer Chrome returns a Promise from `scrollIntoView`; a one-line arrow handed it to React as a "cleanup", which crashed the vault form on close |
| 2026-11-24 | Vault: AES-256-GCM envelope encryption in a `vault` Edge Function; per-item data key wrapped by `VAULT_MASTER_KEY` (function secret only); item id as associated data | SPEC §4.6; protects against a leaked database/backup at $0. Not end-to-end (the server can decrypt): documented, no bank passwords |
| 2026-11-24 | Split tables: `vault_items` (label, section, renewal date; household can read) and `vault_secrets` (ciphertext; no app access at all) | Renewals feed the calendar, dashboard and bell while locked; secrets never reach the browser except through an unlocked session |
| 2026-11-24 | Unlock = passkey (@simplewebauthn, rpID = the app's host) or own 6-digit PIN; token in memory only, 5 min idle / 30 min max | SPEC; nothing left behind in storage on a shared or lost phone |
| 2026-11-24 | PIN: PBKDF2 over a pepper from the master key; tries counted atomically before checking (`vault_pin_try`); pauses 15 min / 1 h / 24 h | A 6-digit PIN is weak on its own; parallel guesses can't slip past the counter |
| 2026-11-24 | First PIN and PIN reset need a Google sign-in from the last 15 minutes (JWT `amr` time) | Someone holding an unlocked phone can't quietly set a PIN and read the vault |
| 2026-11-24 | Vault files in a separate `vault-files` bucket with no user policies; signed upload and 60-second download links from the function | Lease PDFs stay behind the lock, unlike `household-files` |
| 2026-11-24 | Vault trash: soft delete, purged with its files by the function after 7 days (not by the SQL purge) | SQL can't delete storage files; the function can |
| 2026-11-24 | Trips can be renamed and re-dated; moving the start keeps the trip length and (optionally) shifts the day-by-day plan; plan items left outside the dates are listed to move or delete | Plans change; nothing is silently hidden |
| 2026-11-24 | Phase 7 split: 7a bedroom + backyard, 7b closet vault | The vault needs its own key setup and careful testing; keeping it separate keeps each test pass small |
| 2026-11-24 | Date ratings: one row per person, insert-then-update, editable only by its owner (RLS on `member_id`) | Same pattern as recipe ratings; each of you keeps your own score |
| 2026-11-24 | Scheduled dates go to the Us calendar (else your primary); the app stores the event id and deletes it when unplanned | One source of truth on Google; no duplicate in the app calendar |
| 2026-11-24 | Trip files in one private `household-files` bucket (5 MB; WebP/JPEG/PNG/PDF), per-household folders, 1-hour signed links | Free-tier storage; the bucket is shared with the vault in 7b |
| 2026-11-24 | Itinerary items are rows dated within the trip, not a JSON blob per day | Both of you can edit at once with realtime and soft delete |
| 2026-11-24 | Budget total = booking costs + expenses; one currency per trip (CAD default) | No currency conversion API (cost rule) |
| 2026-11-24 | Boat lantern lights from 30 days before a trip until it ends; petti lamp for a date planned this Mon–Sun week | SPEC §3.3 indicators, Toronto weeks |
| 2026-11-24 | Image shrinker checks the encoded type and falls back to JPEG, then downsizes until it fits | iPhone Safari can't encode WebP and silently returned full-size PNGs, so screenshots were rejected as "too large" |
| 2026-11-24 | Screenshot import (≤4 images, compressed on the phone, read by Gemini, not stored) | Harsh can't copy captions in the Instagram app; screenshots also catch on-screen ingredient lists. Same free key, still no downloading from Instagram |
| 2026-11-24 | Recipe imports: no video upload, no Groq; Gemini (free tier) for pasted captions and for websites without JSON-LD; JSON-LD first, no AI | Harsh's choice; fewest keys, still $0; no GitHub media worker needed |
| 2026-11-24 | Imports run synchronously in a `recipes` Edge Function; `recipe_import_jobs` logs each one (rate limit 20/day, 60/month; kept 60 days) | Seconds, not minutes, without video; the log enforces the limit |
| 2026-11-24 | AI answers are validated and cleaned (`normalizeAiDraft`): missing amounts stay null and are flagged | SPEC: never invent quantities |
| 2026-11-24 | Rule-based caption reader as a fallback when Gemini is missing or fails | Imports still work at zero AI |
| 2026-11-24 | Recipes are created/edited only via `save_recipe()` (one transaction: recipe + ingredients + steps) | Keeps a recipe and its parts consistent; clients can't half-write one |
| 2026-11-24 | Photos: browser WebP compression, private Storage bucket per household, signed URLs; imported photos are copied in via the function | SPEC storage hygiene; never hotlink |
| 2026-11-24 | Importer refuses local/private addresses and caps downloads (4 MB pages, 6 MB images) | Stops the function being used to probe internal services |
| 2026-11-24 | Ratings: insert then update (not upsert) | Upsert would try to rewrite key columns the app isn't granted |
| 2026-11-24 | Dashboard built entirely from existing data on the client; ranking of the time-sensitive strip is a pure, unit-tested function (`src/lib/dashboard.ts`) | No new tables or server work; trips and vault renewals slot in when phase 7 adds them |
| 2026-11-24 | Date-only tasks count as overdue after their day; timed tasks after their time | Matches how people read "due today" |
| 2026-11-24 | Dashboard items open their room in place (`history.pushState`), so the camera flies there | Feels like moving through the house |
| 2026-11-24 | Phone room panel is a draggable sheet: drag the top bar to full screen / back to ~58% / down to close; tapping the grab bar toggles | More room for lists on phones; the bar is a real button for keyboard and screen readers |
| 2026-11-24 | All Google Calendar work runs in one Supabase Edge Function (`calendar`): OAuth start/callback, sync, event writes, the Us calendar | Google client secret and the token key never touch Vercel or the browser |
| 2026-11-24 | Scope `https://www.googleapis.com/auth/calendar` | One scope covers reading both calendars, writing events, and creating/sharing the Us calendar; fine for an unverified personal app (<100 users) |
| 2026-11-24 | Refresh tokens: AES-256-GCM, random IV, key only in function secrets; column not granted to the app | SPEC: encrypted at rest; a DB leak alone can't use them |
| 2026-11-24 | OAuth `state` is HMAC-signed (member id + 10 min expiry + safe return path) | Prevents connecting a Google account to someone else's member |
| 2026-11-24 | Sync: Google syncToken incremental, full re-check every 7 days (−60 to +400 days, single events), 410 → restart | Cheap and correct; long-running recurring series still appear |
| 2026-11-24 | Gift ideas default to "for the other person" and are hidden from them by RLS | Surprises stay surprises |
| 2026-11-24 | Milestones seeded by SQL for existing and new households; partner's birthday is linked when they join | SPEC seeds; no manual setup |
| 2026-11-24 | September planner covers Sep 1 – Oct 18 | All four milestones fall in that stretch |
| 2026-11-24 | Explicit grants for `service_role` on all app tables (+ default privileges) | New Supabase projects don't grant them automatically; the notify function got "permission denied" |
| 2026-11-24 | Reminders: one `notify` Edge Function, called every 5 min by pg_cron (via pg_net) and right after a note is posted; rules in a pure, unit-tested `logic.ts` | One place for all push; cheap (~9k invocations/month of 500k free) |
| 2026-11-24 | Each reminder is "claimed" (reminded_due_at / notified_at set with a conditional update) before sending | Overlapping runs can't double-send |
| 2026-11-24 | Function deployed with no JWT check | It takes no input and only sends what's due, so calling it extra times is harmless; avoids storing a key in the database |
| 2026-11-24 | Quiet hours delay a reminder until every recipient is out of quiet hours; opting out of a kind skips that person | Simple and predictable for two people in one time zone |
| 2026-11-24 | Functions deployed by a GitHub Action with a Supabase access token | No pasting code into dashboards; updates ship with a push |
| 2026-11-24 | Any "done" record can be removed later by either person (`remove_chore_completion`): the latest one restores the chore's due date and person, older ones just leave the log | Harsh asked for a way to fix a Done tapped by mistake after the Undo message is gone |
| 2026-11-24 | Phase 3 lists: shopping (+ learned frequent items), tasks + subtasks (personal tasks hidden by RLS), chores + completions, notes | SPEC §4.1–4.5 core lists |
| 2026-11-24 | Chore recurrence: RRULE evaluated on Toronto "floating" wall-clock time, then converted to UTC; chores due 18:00 Toronto; completing schedules the next date after max(due, now) | DST-safe; missed weeks don't pile up |
| 2026-11-24 | `complete_chore` / `undo_chore_completion` RPCs; the app passes the next date (computed from the RRULE), the database checks it moves forward and handles rotation | Keeps the completion log, rotation and next date consistent in one transaction |
| 2026-11-24 | Soft delete everywhere (`deleted_at`), "Recently deleted" with Restore, hourly `pg_cron` job purges after 7 days, archives expired notes and prunes the activity log after 90 days | SPEC: 7-day trash, expiring notes, 90-day feed |
| 2026-11-24 | Clients may not hard-delete; column grants limit what each table accepts; `updated_by` set by trigger | Enforced in the database, not the UI |
| 2026-11-24 | Optimistic updates via TanStack Query with client-generated ids; one Realtime channel for all lists refreshes the other phone; "updated by … just now" hint for 6 s | Instant feel; last write wins as specified |
| 2026-11-24 | Activity feed written by database triggers (personal tasks never logged) | Can't be skipped or faked by a client; phase 5 shows it |
| 2026-11-24 | Push reminders for chores/tasks/notes split into phase 3b (Supabase Edge Function + pg_cron) | Needs a function deployed in Supabase; keeps this part zero-setup |
| 2026-11-23 | Household realtime subscription lives in one place (`<Providers>`), not inside `useHousehold()` | Two components using the hook opened the same channel twice and supabase-js threw, crashing the house on a fresh load |
| 2026-11-23 | `app/error.tsx` and `global-error.tsx` show the error text and version | So crashes on real devices can be reported precisely |
| 2026-11-23 | Logo and app icons are renders of the real 3D house (`src/scene/logo.ts`, `scripts/render-logo.cjs`); masters in `docs/brand/` | Harsh asked for a realistic, lit 3D logo; reusing the model keeps it consistent and free |
| 2026-11-23 | Phase 2 tables limited to household, members, invites, settings, notification prefs, push subscriptions, activity log; later phases add their own migrations | Keeps each phase's schema reviewable; the full schema is still the plan in PLAN §3 |
| 2026-11-23 | Invites, joining, leaving and household creation are `security definer` SQL functions; clients get column-level update grants only | Keeps the two-member rule, single-use 48 h tokens and roles enforceable in the database, not just the UI |
| 2026-11-23 | Invite tokens: 24 random bytes (hex); only the SHA-256 hash is stored | A leaked database row can't be turned back into a working link |
| 2026-11-23 | Session check in `src/proxy.ts` uses `getClaims()` (local JWT verification) | Avoids a network call to Supabase on every page view |
| 2026-11-23 | App runs without accounts when the Supabase env vars are missing | CI and pre-setup deploys keep working; no fake auth needed in tests |
| 2026-11-23 | RLS tests run on plain Postgres with a small Supabase stub (`tests/db/`), locally and as a CI job | Free, fast, and catches policy mistakes before they reach the real project |
| 2026-11-23 | Test notification is sent from a Vercel route with `web-push`; scheduled reminders will be sent from Supabase Edge Functions (phase 3+) | Phase 2 only needs on-demand sending |
| 2026-11-23 | Service worker caches nothing (push + notification click only) | Avoids stale versions of the app; offline support isn't in scope |
| 2026-11-23 | Icons drawn as SVG and rendered to PNG once (`public/icons`, `src/app/icon.png`) | No paid assets; tiny files |
| 2026-11-23 | "Camera animations" setting: follow the system reduce-motion setting (default) or always fly | Harsh's desktop has reduce motion on (so flights were instant by design) but he wants flights; default still respects the spec |
| 2026-11-23 | Precompile shaders after load; frame-rate check skips the first second | First frames include one-off shader compilation, which made the slow-device check too pessimistic |
| 2026-11-23 | Room camera framing computed to fit the room's bounding box into the screen area not covered by the panel/sheet (replaces the prototype's size-scaled offsets) | The prototype's offset grew with room size, so on phones the 16 m backyard view landed on the bedroom; unit tests now check every room on four screen sizes |
| 2026-11-23 | "This device" report in Settings (version, view setting, reduce-motion, measured fps, GPU, screen) | To diagnose device-specific 3D problems without guessing |
| 2026-11-23 | Camera is aimed at the target on every flight frame (`camera.lookAt`) | drei only runs `OrbitControls.update()` (which aims the camera) while controls are enabled; they are disabled during flights, so the camera slid without turning, then snapped at the end |
| 2026-11-23 | App version (commit) shown at the bottom of Settings | To confirm a phone is running the latest deploy |
| 2026-11-23 | Room changes use `history.pushState` and start the camera flight immediately | `router.push` waited for a server request first, so the fly-in started late or looked skipped |
| 2026-11-23 | Camera flights orbit (interpolate angle/distance round the target) instead of moving in a straight line | After the idle drift, straight-line flights cut across the house at odd angles, especially on phones |
| 2026-11-23 | Verandah lamp lights fade with the roof | The fittings lift away with the roof; their light stayed and left bright spots on the polished floor |
| 2026-11-23 | Teak wall-plates raised 12 mm above the wall tops; camera near plane 0.1 → 0.5 m | Coplanar tops flickered (z-fighting) between white plaster and teak |
| 2026-11-23 | Extra furniture detail in `props/details.ts` (kitchen sink, cabinet doors, wardrobe, desk lamp, coats, bucket…) | Harsh asked for more realistic rooms; built after the prototype pieces so its random sequence is unchanged; +70 meshes merge into ~20 extra draw calls |
| 2026-11-23 | Phase 1: scene ported as typed builder modules hosted in R3F (`<Canvas>` + drei `OrbitControls`), not rewritten as JSX meshes | Keeps every coordinate, texture and RNG call identical to the prototype ("port, don't redesign") |
| 2026-11-23 | Static geometry merged per material at load (734 meshes → 64) instead of hand-instancing | Same draw-call saving as instancing with far less code; animated/pickable objects stay separate |
| 2026-11-23 | Colour management off (`<Canvas legacy>`) and light intensities × π | Reproduces the r128 prototype's look on three.js r187 |
| 2026-11-23 | `PCFShadowMap` instead of `PCFSoftShadowMap` | `PCFSoftShadowMap` was removed in recent three.js; shadows are slightly softer-edged than the prototype |
| 2026-11-23 | Next.js `cacheComponents` turned off | Needed for `dynamicParams = false` so unknown rooms return a real 404; the app is client-rendered anyway |
| 2026-11-23 | Panel slide uses a 220 ms CSS transition; Framer Motion deferred until list animations (phase 3) | Spec asks 150–250 ms; avoids shipping a library for one transition |
| 2026-11-23 | 3D/2D choice stored per device (localStorage) until settings move to the database in phase 2 | No backend yet |
| 2026-11-23 | Boat lantern stays unlit (and its light off) until a trip is within 30 days | SPEC §3.3; the prototype lit it always |
| 2026-11-23 | New indicators: brass bell at the closet doorway, warm glow over the bedroom petti | SPEC §3.3 additions |
| 2026-11-23 | GitHub Actions bumped to checkout v7, setup-node v7, cache v6, upload-artifact v7 | v4 ran on deprecated Node 20 |
| 2026-11-23 | Host on Vercel Hobby (compared with Cloudflare Pages + Supabase Edge Functions, Netlify, Render, Oracle, Cloud Run) | Least work, Next.js runs as specced, per-branch previews; personal-use limit fits a two-person app. Cloudflare was the runner-up if we ever need to leave |
| 2026-11-23 | Security headers (CSP, HSTS, nosniff, frame-deny) set in `next.config.ts`; CSP allows `'unsafe-inline'` scripts for now | Next.js hydration needs it without nonces; tighten with nonces in phase 8 |
| 2026-11-23 | Keep-alive calls a tiny `public.ping()` SQL function, not just the REST root | Supabase pausing is based on database activity, so the ping must run a query |
| 2026-11-23 | Backups use the Supabase CLI (`db dump` roles / schema / data), GPG-encrypted, kept 56 days as workflow artifacts | Matches Supabase's documented restore; 56 days = last 8 weekly dumps; doesn't bloat the repo |
| 2026-11-23 | CI skips docs-only commits, caches Playwright's browser, cancels superseded runs | Keeps us well inside 2,000 free Actions minutes on a private repo |
| 2026-11-23 | Stack pinned to Next.js 16, React 19, Tailwind 4 (CSS `@theme` tokens), Vitest 5, Playwright 1.65, Node 22 | Latest stable; all free |
| 2026-11-23 | Instagram import = paste caption or upload video only; no downloading from Instagram links. Cap 60 imports/month | Harsh's choice. Avoids Instagram blocking and account risk; stays $0 |
| 2026-11-23 | Plan approved | See `docs/PLAN.md` |
| 2026-11-23 | UI shows names "Harsh" / "Prerna"; repo stays private; app creates and shares the "Us" calendar; both members in America/Toronto | Harsh's answers to PLAN §6 |
| 2026-11-23 | Store encrypted backups as workflow artifacts, not a git branch | A backup branch grows the repo forever; artifacts expire on their own |
| 2026-11-23 | Vault uses server-side AES-256-GCM envelope encryption, master key only in Vercel and Supabase secrets | Free; protects against DB leaks and backups; limits documented in PLAN §6 |
| 2026-11-23 | Extra tables beyond the spec minimum (`calendar_sources`, `item_frequency`, `scheduled_notifications`, …) | See PLAN §3 |
| 2026-11-23 | Merge static geometry and instance repeated props when porting the prototype | Hits the draw-call and ≥30 fps budget on phones |
| 2026-11-23 | Kit imported: `SPEC.md`, `CLAUDE.md`, `reference/veedu-prototype.html`; partner is Prerna Nair | Starting point |
