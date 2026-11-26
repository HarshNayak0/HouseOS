# How Veedu was built

Read this before changing code that every copy shares, or before quoting a couple for custom work.
`SPEC.md` is the original brief, `docs/PLAN.md` the plan and cost table, `docs/DECISIONS.md` the log of
every choice and why (newest first) — check it before re-deciding something.

Contents: House rules · Stack and shape · Phase by phase · Patterns worth reusing · Gotchas we hit ·
Customising for a couple · Testing

---

## House rules (from CLAUDE.md — they apply to every copy)

- $0/month to run (ceiling ~$2); ask before adding anything paid.
- Store times in UTC; display in the home time zone (`INSTANCE.timeZone`, Toronto for the original).
- Never send vault, notes or calendar data to an AI provider. Gemini sees recipe content only.
- No secrets in client code except public keys; validate input with Zod; RLS on every table.
- Work in phases; commit and push at the end of each; keep `README.md` and `docs/DECISIONS.md` current.
- The 3D house is ported from `reference/veedu-prototype.html` — port, don't redesign.

## Stack and shape

- **Web app**: Next.js 16 (App Router; `src/proxy.ts` is the session gate), TypeScript strict, Tailwind 4,
  TanStack Query, Zod. Hosted on Vercel Hobby.
- **3D**: React Three Fiber + three.js, loaded lazily behind a real-progress loading screen. Static meshes
  merged per material (~200 draw calls); textures drawn in code; DPR ≤ 2; a 2D floor plan
  (`src/components/house/FloorPlan.tsx`) is the accessible twin and the fallback for reduced motion,
  no WebGL, or slow phones (<28 fps).
- **Rooms → panels**: each room's code is its own chunk (`src/panels/RoomContent.tsx`), prefetched after
  sign-in. Living (dashboard, notes), Kitchen (shopping, staples, I'm-at-the-store, recipes), Office
  (calendar, tasks, milestones), Wash (chores), Bedroom (dates, memories, free-time finder), Backyard
  (trips), Closet (vault).
- **Data**: Supabase Postgres. Every table is household-scoped with RLS via `my_household_id()` /
  `my_member_id()`; column-level grants say exactly what the app may write; soft delete (`deleted_at`)
  with a 7-day trash purged hourly by `pg_cron`.
- **Live updates**: one Realtime channel for all lists (`useListsRealtime` in `src/lib/lists/rows.ts`),
  batching refreshes per table; rows stay fresh 5 minutes otherwise.
- **Edge Functions** (Deno, `supabase/functions/`): `notify` (reminders, store alerts, morning digest; cron
  every 5 min + database triggers), `calendar` (Google OAuth, two-way sync), `recipes` (imports), `vault`
  (encryption, passkeys, PINs). Shared code in `_shared/` (`server.ts`, `http.ts`, `crypto.ts`, `tz.ts`,
  `rules.ts`, plus `recipe.ts` / `vault.ts` that the app also imports).
- **Per-copy settings**: `src/lib/instance.ts` (build-time `NEXT_PUBLIC_HOME_TZ/CITY/LAT/LNG`), function
  secrets `HOME_TZ`, `APP_URL`, `PREVIEW_ORIGIN_REGEX`, and the database's `app_config.functions_url`
  (written by `notify` itself).
- **Automation** (GitHub Actions): CI (lint, types, unit, database RLS tests on plain Postgres, build,
  Playwright + axe at desktop and 375 px), function deploys, keep-alive, encrypted weekly backups, and
  `couples.yml` for every other copy.

## Phase by phase (how it was built, in order)

| Phase | What | Notable decisions |
|---|---|---|
| 0 Setup | Repo, CI, env scaffolding, README, keep-alive and backup workflows | Free tiers only; cost table in PLAN.md |
| 1 House | Prototype ported to R3F modules; routes per room; camera flights; 2D plan; panel shell | Camera `lookAt` every frame (drei only updates while controls are enabled); "Camera animations: always" setting for systems with reduce-motion on |
| 2 Accounts | Schema + RLS, Google sign-in, onboarding, invites (48 h, single use), settings, PWA, Web Push | Insert-then-update on unique conflict instead of upsert (upserts try to rewrite key columns the app can't touch) |
| 3 Lists | Shopping (by store, frequency suggestions), tasks + subtasks, chores (RRULE, rotation, fairness line), notes | Recurrence evaluated in "floating" home time; undo a chore completion |
| 4 Calendar | Google OAuth (offline), syncToken incremental sync + weekly full, "Us" calendar shared by ACL, milestones + reminders | Refresh tokens AES-GCM encrypted; HMAC-signed OAuth state |
| 5 Dashboard | Time-sensitive strip, today, 7-day strip, activity feed, together counter | Pure `buildUrgent` with unit tests |
| 6 Recipes | Recipe box, JSON-LD website import, caption and screenshot import via Gemini, share target | No Instagram downloading (blocked and against their terms); Gemini model fallbacks and retries on 503; never invent quantities |
| 7a Bedroom / Backyard | Date ideas, Surprise me, memories with photos and ratings; trips, itinerary, bookings, packing, budget | Private `household-files` bucket, signed links |
| 7b Closet | Vault: per-item AES-256-GCM keys wrapped by `VAULT_MASTER_KEY`; passkeys (@simplewebauthn) or 6-digit PIN (peppered PBKDF2, atomic try counting, pauses); 5-minute sessions in memory only | Setting/resetting a PIN needs a Google sign-in in the last 15 minutes |
| 8 Polish | Courtyard roof opening, automatic evening at local sunset (NOAA formulas, no API), usage monitor (70% warning), accessibility (axe) and performance passes | Free-plan usage snapshot monthly + "Check now" |
| After | Tidy-up (shared function code, lazy rooms, fewer refetches), quick-add +, I'm at the store, staples, free-time finder, morning digest, 16 px fields on touch screens, reusable copies | See DECISIONS.md |

## Patterns worth reusing

- **Claim before send** (`notify`): mark a reminder handled with a conditional update (or insert into a
  log with a primary key) and only send if that succeeded — nothing goes out twice, even with overlapping runs.
- **Pure logic modules** next to each function (`logic.ts`) so rules are unit-tested in Node.
- **Settings with safe defaults**: every per-copy value falls back to the original's, so the original
  never needs reconfiguring.
- **Mock harness** for UI checks without a real backend: build with the gate bypassed, intercept
  `*.supabase.co` requests in Playwright with an in-memory database, screenshot and run axe. (Restore
  `src/proxy.ts` afterwards — never commit the bypass.)

## Gotchas we hit (so you don't again)

- iPhone Safari zooms into any field under 16 px and stays zoomed → a global rule makes fields 16 px on
  touch screens; `touch-action: manipulation` stops double-tap zoom.
- Safari can't encode WebP → image compression checks the result type and falls back to JPEG.
- `useEffect(() => el.scrollIntoView())` returns a Promise in newer Chrome, which React treats as a cleanup
  → always use block bodies in effects.
- The Supabase SQL editor keeps statements that ran before an error → migrations must be idempotent.
- A missing Google redirect URI shows up only on a fresh sign-in, weeks later.
- Scraping the GitHub "latest" CLI hits rate limits → pin tool versions (Supabase CLI 3.3.0, Vercel CLI 65.12.1).
- Edge Function deploys can't reach your own tables without explicit `service_role` grants.

## Customising for a couple

- **No code**: their names, colours and room labels (Settings), time zone / city / coordinates
  (`instances/<slug>.json`).
- **Small, shared** (add a setting, default to today's behaviour): app name in the header and manifest
  (currently "Veedu" in ~20 strings), default room labels, which rooms appear.
- **Bespoke house** (days of work, quote separately): the scene lives in `src/scene/` (structure, roof,
  rooms, props, garden, lighting, camera views in `config.ts` / `camera/views.ts`). A new house means a
  new layout in `config.ts` (room bounds must still map to the seven rooms), new geometry modules, and
  re-tuning each room's camera view and the 2D floor plan. Keep it behind a per-copy setting so every
  copy still builds from the same code.

## Testing

`npm run lint`, `npm run typecheck`, `npm test` (Vitest: logic, crypto, time zones, staples, free time,
digest, instance configs), `npm run test:db` (migrations + RLS on a throwaway Postgres; includes the trash
guard and the store/vault/usage rules), `npm run build && npm run test:e2e` (Playwright at desktop and
375 px with touch, axe accessibility checks). The Deno functions are type-checked by mapping their `npm:`
imports onto `node_modules` in a scratch `tsconfig`; `deploy-functions.yml` and `couples.yml` then
smoke-test that every function starts.
