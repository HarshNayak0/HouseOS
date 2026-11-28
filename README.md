# Veedu · വീട്

A shared household app for Harsh and Prerna, navigated as a 3D model of a traditional Kerala home. Each room is a feature: the kitchen holds the shopping list and recipes, the office the calendar and tasks, and so on.

- Spec: [`SPEC.md`](SPEC.md) · Plan: [`docs/PLAN.md`](docs/PLAN.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Restore a backup: [`docs/RESTORE.md`](docs/RESTORE.md)
- 3D prototype (source of truth for the house): [`reference/veedu-prototype.html`](reference/veedu-prototype.html)

**Live:** https://veeduos.vercel.app

**Status:** complete. All phases (0–8) of `SPEC.md` are built and live.

**Rooms:**

| Room | What's there |
|---|---|
| Living room | Dashboard (time-sensitive strip, today, next 7 days, activity) and notes board |
| Kitchen | Shopping list and recipe box with imports |
| Office | Google Calendar (both of you plus "Us"), tasks, milestones |
| Wash area | Chores |
| Bedroom | Date ideas and memories |
| Backyard | Trips |
| Coat closet | Encrypted home vault |

**Running cost:** $0/month. Everything runs on free tiers; see the cost table in `docs/PLAN.md` §4.

---

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · React Three Fiber 9 + three.js · TanStack Query 5 · Zod 4 · Supabase (Postgres with row-level security, Google sign-in, Realtime, Storage, `pg_cron`, Edge Functions) · Web Push · @simplewebauthn (passkeys) · Vitest · Playwright + axe.

Hosting: Vercel Hobby (free `veeduos.vercel.app`). Background jobs: Supabase `pg_cron` calling Edge Functions (`notify`, `calendar`, `recipes`, `vault`). Backups and keep-alive: GitHub Actions.

## Set up from zero

### 1. Accounts (all free)

| Account | Needed from | Notes |
|---|---|---|
| GitHub | phase 0 | This repo, private. Also runs CI, backups and keep-alive. |
| Vercel (Hobby) | phase 0 | Sign up **with GitHub**. Hosts the app. |
| Supabase | phase 2 | Database, sign-in, realtime, file storage. |
| Google Cloud | phase 2 | Google sign-in and Calendar API. |
| Google AI Studio | phase 6 | Gemini free tier, for turning recipe text and screenshots into a recipe card (optional). |

### 2. Deploy to Vercel

1. Go to vercel.com → **Add New… → Project**.
2. Find **HouseOS** in the list of GitHub repos → **Import**. If it's missing, click **Adjust GitHub App Permissions** and give Vercel access to this repo.
3. Leave every setting at its default (Framework: Next.js) → **Deploy**.
4. Every push to `main` now deploys to production, and every other branch gets its own preview URL.

### 3. Supabase and Google sign-in (phase 2)

1. **Supabase project:** supabase.com → New project (Free, region Canada Central). Save the database password in a password manager.
2. **Database:** SQL Editor → run each file in `supabase/migrations/` in name order (oldest first).
3. **Google OAuth client:** Google Cloud console → new project → Google Auth Platform → External app, **published (In production)** → Web client with origin `https://veeduos.vercel.app` and **both** redirect URIs:
   - `https://<project-ref>.supabase.co/auth/v1/callback` (sign-in)
   - `https://<project-ref>.supabase.co/functions/v1/calendar/callback` (calendar, phase 4)

   If one is missing, Google shows `Error 400: redirect_uri_mismatch`.
4. **Supabase Auth:** Providers → Google → paste the client ID and secret. URL Configuration → Site URL `https://veeduos.vercel.app`; Redirect URLs `https://veeduos.vercel.app/**`, `https://*-harsh-s-vercel.vercel.app/**`, `http://localhost:3000/**`.
5. **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` + your email), then redeploy.

New VAPID keys can be generated with `npx web-push generate-vapid-keys`. Changing them means everyone has to turn notifications on again.

Until the Supabase variables are set, the app runs without accounts (this is also how CI runs).

### 4. Environment variables

The web app needs only the five Vercel variables above; [`.env.example`](.env.example) lists them. Values go in **Vercel → Project → Settings → Environment Variables** (and `.env.local` if you run the app on your own computer). Everything secret for the Edge Functions is a GitHub Secret (below), copied to Supabase by the deploy workflow. Never commit real values.

### 5. GitHub Secrets (for the scheduled workflows)

**GitHub → repo → Settings → Secrets and variables → Actions → New repository secret.** Added in phase 2:

| Secret | Used by | Where to get it |
|---|---|---|
| `SUPABASE_URL` | keep-alive | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | keep-alive | Supabase → Project Settings → API → anon/public key |
| `SUPABASE_DB_URL` | backup | Supabase → **Connect** → **Session pooler** connection string (with your DB password filled in) |
| `BACKUP_PASSPHRASE` | backup | A long random passphrase you also save in your password manager |
| `SUPABASE_ACCESS_TOKEN` | deploy functions | Supabase → your avatar → Account preferences → Access Tokens → Generate new token |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | deploy functions | The same values as in Vercel (`VAPID_PUBLIC_KEY` = `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | deploy functions | Google Cloud → Google Auth Platform → Clients → your web client |
| `TOKEN_ENCRYPTION_KEY` | deploy functions | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts Google refresh tokens. |
| `GEMINI_API_KEY` | deploy functions | Google AI Studio → Get API key (free tier). Optional: without it, captions are read by simple rules. |
| `VAULT_MASTER_KEY` | deploy functions | 32 random bytes, base64. Encrypts the closet vault. **Save a copy in your password manager and never change it**: without it the vault can't be read. |

Until these exist, the keep-alive and backup workflows run but skip themselves with a notice.

## Run it on your own computer (optional)

You don't need to: every push builds a preview on Vercel. If you want to:

```bash
npm ci
```

```bash
npm run dev
```

Then open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate Next route types, then `tsc` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright) at desktop and 375 px phone width; needs `npm run build` first |
| `npm run check` | Lint + typecheck + unit tests |
| `npm run test:db` | Applies the migrations to a throwaway Postgres and tests the RLS rules (`tests/db/`) |

## Automation (GitHub Actions)

| Workflow | When | What |
|---|---|---|
| **CI** | every push / PR (not docs-only) | lint, typecheck, unit tests, database (RLS) tests, build, Playwright with accessibility checks |
| **Deploy Supabase functions** | when `supabase/functions/` changes on `main`, or by hand | sets the function secrets and deploys `notify`, `calendar`, `recipes`, `vault` |
| **Supabase keep-alive** | every 3 days | runs a tiny query so the free project never pauses |
| **Weekly backup** | Sundays | encrypted database dump kept 56 days; see [`docs/RESTORE.md`](docs/RESTORE.md) |

Scheduled inside Supabase (`pg_cron`): reminders every 5 minutes, calendar sync every 15 minutes, trash clean-up hourly, usage snapshot monthly.

## Project layout

```
src/app/                 routes: house (/[[...room]]), settings, sign-in, onboarding, invite, API (export, push test, health)
src/components/house/    HouseApp (header, 3D/2D switch), RoomPanel (the sheet), FloorPlan (2D)
src/panels/              one file per feature: ShoppingList, Recipes, Tasks, Chores, Notes, Calendar,
                         Milestones, Dashboard, Dates, Trips, Vault
src/scene/               the 3D house (see below)
src/lib/                 data layer (lists/rows.ts: live rows, batched realtime refresh, insertOrUpdate),
                         time (UTC ↔ Toronto, day-key helpers), files (uploads, signed links), functions
                         (calling the Edge Functions), sun, calendar, vault, usage, …
supabase/migrations/     database schema + RLS, applied in name order
supabase/functions/      Edge Functions: notify, calendar, recipes, vault. _shared/ holds what they share:
                         server.ts (admin client, errors, "who's calling"), http.ts (CORS), crypto.ts
                         (AES-GCM, base64), rules.ts (milestones, quiet hours: also used by the app),
                         recipe.ts and vault.ts (parsing and validation: also used by the app)
tests/unit/              Vitest (pure logic, crypto, recurrence, time zones)
tests/db/                SQL tests of the RLS rules (and a guard that every trash table is emptied), on a throwaway Postgres
tests/e2e/               Playwright: house, floor plan, settings, accessibility (axe)
.github/workflows/       CI, deploy functions, keep-alive, backup
docs/                    plan + cost table, decisions log, restore guide, brand
reference/               the original 3D prototype
```

## The 3D house

The house is ported from `reference/veedu-prototype.html` into `src/scene/`:

| Folder | What's in it |
|---|---|
| `config.ts` | Room bounds, plinth/wall sizes, room labels (English + Malayalam, editable) |
| `textures/` | Every texture, drawn in code at load time (no image downloads) |
| `materials/`, `builder.ts` | Material table and the `box` / `cyl` / `flat` helpers |
| `house/`, `rooms/`, `props/`, `garden/` | Walls, roof, floors, furniture, palms, pond, well |
| `indicators/` | Fridge badge, laundry heap, nilavilakku, boat lantern, closet bell, petti glow |
| `lighting/` | Sun, sky, day ↔ evening |
| `camera/` | Views, camera flights, tap picking, labels (`controller.ts`) |
| `merge.ts` | Merges static meshes per material to cut draw calls |
| `HouseCanvas.tsx` | The React Three Fiber canvas, loaded lazily |

Routes: `/` (house) and `/living`, `/kitchen`, `/bedroom`, `/office`, `/wash`, `/closet`, `/backyard` open the house inside with that room's panel. `/settings` has the display choices (3D/2D, camera animations, evening mode) and everything account-related.

**Roof opening:** both roof tiers are cut open above the nadumuttam. An inner roof slopes down into the courtyard, the opening has carved jaali sides like the gable (a timber light-well), and the mukhappu gable is a pediment on the front slope so the opening behind it stays clear. The code is in `house/roof.ts`: the roof faces are clipped around the opening, so there's no extra geometry.

**Evening mode:** automatic by default. It turns on 20 minutes before sunset and off 15 minutes after sunrise in Toronto. Sunrise and sunset are computed on the device (`src/lib/sun.ts`, NOAA formulas, about ±2 minutes, no API). The **Evening/Daytime** button overrides it until the next sunset or sunrise. Settings → This device offers Automatic, Always daytime or Always evening.

**2D floor plan:** used automatically when the device has no WebGL or prefers reduced motion, offered when the 3D view runs below ~28 fps, and selectable in Settings.

**Performance check:** open `https://veeduos.vercel.app/?debug=1`. A small meter in the bottom-left corner shows frame rate, draw calls, triangles and pixel ratio, which works on a phone too. On a computer, `__veedu.info()` in the console gives the same numbers.

## Performance and accessibility

Measured at the end of phase 8 against the budgets in `SPEC.md` §3.4:

| Budget | Target | Measured |
|---|---|---|
| Initial JS on the house route | < ~350 KB gzipped, 3D lazy-loaded | 268 KB. The 3D scene and each room's panel load separately: a room's code loads when it opens, and all rooms are prefetched once the house has settled |
| Draw calls / triangles | instance or merge repeats | ~200 calls, ~56k triangles (static meshes merged per material) |
| Device pixel ratio | ≤ 2 | capped at 2 |
| Shadows | one map ≤ 2048 px, 1024 on phones | yes |
| Frame rate | 60 target, ≥ 30 on a mid-range phone | check on your phone with `?debug=1` (meter in the corner). Below ~28 fps in the first seconds, the app offers the 2D plan |

Accessibility (WCAG 2.1 AA):
- **Automated checks:** axe runs in CI on the sign-in, legal and settings pages, the 2D floor plan and the room panels (`tests/e2e/a11y.spec.ts`). The signed-in panels were also audited with test data and are clean.
- **Fixes from the audit:**
  - Person chips pick white or dark text for contrast.
  - Done items and the calendar's other-month days are darker.
  - The calendar is a labelled group of buttons, not a half-built grid.
  - Room links and day buttons say what they show.
- **Keyboard:**
  - Every room is reachable by Tab.
  - Enter opens a room and Escape closes it. Focus moves into the panel and shows a brass ring.
  - Most tap targets are 44 px; none in the panels is under 38 px (checked by the test suite).
- **3D view:** the 2D floor plan is its accessible twin. It's used automatically when reduce motion is on (unless Settings says otherwise) or WebGL is missing.

## Usage monitor

The free limits that could run out are Supabase's 500 MB database and 1 GB file storage. A `pg_cron` job records both on the 1st of each month (`usage_snapshots`).
- Settings → **Free-plan usage** shows the bars and has **Check now** (at most every 10 minutes).
- At 70% of either limit, a warning appears on the living-room dashboard.
- Data transfer, function calls and Vercel bandwidth aren't visible from inside the database. They're far below their limits at two users; the Supabase and Vercel dashboards show them under **Usage**.

## Google Calendar

`supabase/functions/calendar` handles everything that touches Google, so the Google secrets live only in Supabase:

- **Connect:** Settings → Calendars → Connect. It uses the `calendar` scope with offline access. The refresh token is encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and the app can never read it (no column grant).
- **Sync:** incremental, using Google's `syncToken`, with a full re-check weekly. `pg_cron` runs it every 15 minutes, and the app asks for a sync when it opens. Events are cached in `calendar_event_cache` and reach both phones through Realtime.
- **Two-way:** events added or deleted in the Office panel are written to Google straight away (to your calendar, Prerna's, or "Us").
- **"Us" calendar:** created in the account of whoever presses the button and shared with the other person as an editor.
- **Milestones:** yearly, editable in Settings. The four from the spec are filled in automatically. Reminders go out 14, 7 and 1 days before at 9 am, sent by `notify`; birthday reminders only go to the other person. Gift ideas are hidden from the person they're for (RLS).

Google Cloud needs the Calendar API turned on, the `.../auth/calendar` scope, and this redirect URI on the web client: `https://<project-ref>.supabase.co/functions/v1/calendar/callback`.

## Recipes

- **Recipe box** (Kitchen): search by title, tag or ingredient; sort by newest, rating or time. Each recipe has both your 1–5 ratings and notes, a servings scaler, and "add to the shopping list", which skips anything already on the list.
- **Imports** (`supabase/functions/recipes`):
  - Website links use the page's schema.org JSON-LD first, with no AI. Gemini is the fallback.
  - Pasted Instagram captions go to Gemini, or to the rule-based reader if no key is set.
  - Up to 4 screenshots of a post (caption or on-screen ingredients) are read by Gemini. They're shrunk on the phone, and not stored unless you choose one as the recipe photo.
  - Gemini never invents amounts: missing ones stay blank, and the review screen highlights anything uncertain before you save.
  - The limit is 20 imports a day and 60 a month.
  - Instagram is never downloaded from. Paste the caption; the link is kept as the source.
- **Photos** are compressed in the browser to WebP (at most 1600 px, about 200 KB) and stored in the private `recipe-photos` bucket, one folder per household. Imported photos are copied in, never linked from the original site.
- **Sharing on Android:** Share → Veedu opens the importer (PWA share target). On iPhone, use the importer's **Paste** button.
- Parsing lives in `supabase/functions/_shared/recipe.ts` and is unit-tested in `tests/unit/recipe-parse.test.ts`.

## Dates and trips

- **Bedroom: date ideas.**
  - Ideas move from wishlist to planned to done. Filter by budget (Free to $$$$) and time needed.
  - **Surprise me** draws one from the uruli.
  - **Schedule** adds the date to the Us calendar, or to your own if Us isn't set up. The event is removed if you unplan it. Dates not on Google still show in the app calendar.
  - **We did it** saves a memory with a photo and a note. Each of you rates it 1–5, and only you can change your own rating.
  - The petti lamp glows when a date is planned this week (Mon–Sun, Toronto time).
- **Backyard: trips.** Planning a trip is one screen: name, place, dates, the **vibe** (City, Beach, Cottage, Event: weddings, parties, conferences), how you're getting there (drive / fly / train) and optional extras (swimming, hiking, a dressy night, photo shoot, laundry there). Each trip is one page:
  - **Next:** the one or two things still to do (book a place to stay, add flights, pack when you leave in 3 days…)
  - **Weather:** the forecast for the destination from Open-Meteo (free, no key) once the trip is 16 days away; before that, packing goes by the season
  - **Packing, made for you:** a list each and a shared list, worked out from the length, vibe, transport, extras and weather (e.g. 4 days at a cottage: nightwear 2, 1 dressy + 3 cozy outfits, underwear 5). Each item says why (ⓘ). − / + change quantities; items with a quantity are packed one at a time (2/5). Each person picks their outfit wording once (Confident & Cozy, Cute & Comfy, Dressy & Casual). Changing the trip updates the suggestions but never what you changed by hand
  - **It learns, per person and per vibe:** after a change, "Remember for cottage trips?"; after the trip, a 30-second check-in (what you didn't use, what you wished you'd brought). Stored in `packing_profiles`
  - **Plan in plain words:** "Sat 7pm dinner at The Kitchen" goes to the right day and time (you can change the day before adding)
  - bookings with confirmation numbers (tap to copy), cost and an attached ticket (PDF up to 5 MB, or a photo). On Android, **Share → Veedu** from your email or a booking app attaches the ticket to a trip
  - a budget: planned against bookings plus money spent there, and who paid
  - **Do this trip again:** copies the place, vibe, plan (moved to the new dates) and your own packing items
- **Someday:** trip ideas without dates; **Plan it** turns one into a trip.
- **Trips elsewhere in the app:** they appear on the calendar as all-day spans and in the living-room strip when 30 days away or less. The boat lantern lights up from 30 days before a trip until it ends.
- **Files:** photos and attachments live in the private `household-files` bucket, one folder per household. Links are signed and expire after an hour.
- **Tests:** the pure helpers are in `src/lib/trips.ts`, `src/lib/packing.ts` (the packing rules), `src/lib/planText.ts` and `src/lib/weather.ts` (unit-tested). Access rules are checked in `tests/db/dates_trips.test.sql` and `tests/db/trips_v2.test.sql`.

## Coat closet vault

- **What's inside:**
  - Wi-Fi
  - contacts
  - lease and insurance, whose renewal dates appear on the calendar and in the dashboard strip, and ring the brass bell on the closet door within 30 days
  - appliances, with a manual as a link or a PDF up to 5 MB
  - shared accounts
- **Unlocking:**
  - A passkey (fingerprint or face) or your own 6-digit PIN. Each person has their own.
  - Setting up the vault, or resetting a forgotten PIN, needs a fresh Google sign-in from the last 15 minutes.
  - The PIN pauses after 5 wrong tries (15 minutes), after 10 (1 hour), and from 15 onwards (24 hours). Tries are counted atomically in the database.
  - It locks itself after 5 minutes without vault activity (30 minutes at most), and the Lock button locks it at once. The unlock token and the decrypted items live only in the page's memory.
- **Encryption** (`supabase/functions/vault`):
  - Each item's details are sealed with AES-256-GCM using a fresh data key, with the item id as associated data. That data key is wrapped by `VAULT_MASTER_KEY`, which exists only in the function's secrets.
  - The database holds ciphertext and wrapped keys in `vault_secrets`, a table app users can't read at all. Only the label, section and renewal date are readable (`vault_items`), so the dashboard works while locked.
  - PINs are hashed with PBKDF2 over a pepper derived from the master key, so a database copy alone can't be brute-forced.
  - Attachments go to the private `vault-files` bucket, which has no user access. They are uploaded through one-time signed links and opened with 60-second links.
  - Nothing is logged. The data export includes labels and dates only.
- **Limits:** this protects against a leaked database or backup. Someone who controls the Supabase account can still read the vault, because the key is there, so don't store bank passwords. If `VAULT_MASTER_KEY` is lost, the vault can't be read: keep a copy in your password manager (see `docs/RESTORE.md`).
- **Tests:** `tests/unit/vault.test.ts` covers encryption, tampering, PINs and validation. `tests/db/vault.test.sql` checks that app users can't reach the secret tables and covers the PIN pause.

## Copies for other couples

The same code runs as many copies: this repo's original (veeduos) plus one per couple, each on **the
couple's own free accounts** (Supabase, Vercel, Google Cloud, optional Gemini).
- **Settings:** each copy's settings are in `instances/<slug>.json` (web address, Supabase project, time zone, city). Its secrets live in the GitHub environment `couple-<slug>`.
- **Keys:** `scripts/new-couple.mjs` generates each copy's keys and uploads its secrets.
- **Deploying:** **Actions → Couples** deploys a copy: database migrations, sign-in settings, functions, Vercel settings and the web app.
- **Keep-alive and backups:** the same workflow keeps every copy awake and backs each one up weekly.
- **Defaults:** without settings, a build behaves exactly like the original (Toronto, veeduos).
- **Releases:** go to the original first; run the Couples deploy once it has worked for a few days.

The whole process is a Claude skill: `.claude/skills/veedu-new-couple/`. Ask Claude to "set up Veedu for a new couple". It covers the first conversation with the couple, setting up their accounts click by click, the first deploy, checks, onboarding, handover and agreement templates, updates, backups and troubleshooting, plus how Veedu was built. See also `instances/README.md`.

## Everyday shortcuts

- **Quick add (+):** the round button at the bottom right of the house fans out into Grocery, Task and Note. Each takes one line and saves straight to the list, the office or the notes board (same duplicate rules as the shopping list). It's hidden while a room's panel is open, since each room has its own add box.
- **"I'm at the store"** (kitchen):
  - Pick the store and your partner gets a push ("Harsh is at No Frills, anything to add?") plus a banner in the kitchen.
  - Anything they add while you shop is pushed to you, so your phone can stay in your pocket.
  - A visit ends with **Done shopping** or after 2 hours. It's in `store_visits`; database triggers wake `notify` straight away.
- **Staples** (kitchen): the list already counts how often each item is added. Once something has been bought three or more times at least two days apart, Veedu knows its usual gap. When that gap has passed, the item shows under **Probably running low**, with **Add all**. The logic is in `src/lib/staples.ts`, unit-tested.
- **When are we both free** (bedroom, when scheduling a date):
  - Suggests up to six slots in the next two weeks: weekday evenings 6–10:30 pm, weekend days 10 am–10:30 pm.
  - Avoids both calendars' timed events with half an hour either side, other planned dates and trip days. All-day events don't block.
  - Fits the date's length: a "weekend" needs Saturday and Sunday both clear.
  - If one calendar isn't connected, it says so. The logic is in `src/lib/freeTime.ts`.
- **High and medium tasks remind until done:**
  - **High:** listed first, with ❗, in the 8 am digest, plus one more notification at 6 pm (sent until 9 pm, then skipped). Starts on the due day, or straight away if there's no due date.
  - **Fading:** after 7 days of nudges, a high task drops to the digest only.
  - **Medium:** a line in the digest every day until done.
  - **Who:** only the task's owner gets these: the assignee, otherwise its creator.
  - **Tidy and switchable:** one notification lists all your high tasks, and each replaces the last. Settings → Notifications has its own switch for the 6 pm nudge. If you've turned the digest off, you get the 8 am nudge on its own.
  - The rules are `nagState` and `planNudges` in `supabase/functions/notify/logic.ts`. `task_nudge_log` makes sure each nudge goes out once.
- **Morning digest:**
  - At 8 am Toronto, `notify` sends each person one push about their own day: their calendar events and the Us calendar, chores and tasks due today or overdue, and tonight's date.
  - It adds what's coming up: birthdays today, trips in the next 14 days, renewals in the next 7.
  - Nothing is sent on an empty day. A digest held up by quiet hours is dropped after 11 am, and `digest_log` makes sure it goes out once.
  - Settings → Notifications has switches for the digest and the store alerts.

## Reminders (push)

`supabase/functions/notify` is a Supabase Edge Function that sends:

- chore reminders at the due time (6 pm Toronto on the day) to whoever's turn it is
- task reminders at the due time, or 9 am Toronto for date-only tasks
- a notification to the other person when a note is posted

`pg_cron` calls it every 5 minutes, and a trigger calls it straight after a note is posted. Each reminder is claimed in the database before it's sent, so nothing goes out twice. Quiet hours hold reminders until they end, and each person can switch the three kinds off in Settings. The rules live in `logic.ts` and are unit-tested in `tests/unit/reminders.test.ts`.

The **Deploy Supabase functions** workflow deploys all four functions and their secrets whenever `supabase/functions/` changes on `main`. You can also run it by hand from the Actions tab.

## Accounts

- **Sign-in:** Google, through Supabase Auth. `src/proxy.ts` refreshes the session and sends signed-out visitors to `/signin`.
- **Household:** exactly two people. The first person creates it at `/onboarding`; Settings → Household makes a single-use invite link (48 h) for the second person.
- **Database:** `supabase/migrations/`. Every table has row-level security limited to your own household; invites, joining and leaving go through checked database functions.
- **Notifications:** Web Push with VAPID keys. `public/sw.js` shows them; Settings → Notifications turns them on per device and sends a test. iPhone needs Veedu added to the Home Screen first (iOS 16.4+); the app shows a guide.
- **Export:** Settings → Your data downloads everything as JSON. The vault's encrypted details are left out; only its labels and dates are included.
- **Privacy:** vault, notes and calendar data are never sent to an AI provider. Gemini only ever sees recipe text and screenshots you import.

## Logo

`docs/brand/veedu-logo-1024.png` (cream background) and `docs/brand/veedu-logo-transparent-1024.png` are renders of the 3D house. To re-render them and the app icons after changing the house:

```bash
NEXT_PUBLIC_DEV_PAGES=1 npm run build && npm start -- -p 3100
```

Then, in a second terminal:

```bash
node scripts/render-logo.cjs
```

## Time zones

All times are stored in UTC and displayed in America/Toronto (`src/lib/time.ts`, with daylight-saving tests).
