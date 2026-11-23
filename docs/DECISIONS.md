# Decisions log

Short log of choices and why. Newest first.

| Date | Decision | Why |
|---|---|---|
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
