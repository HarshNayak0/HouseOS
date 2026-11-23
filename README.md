# Veedu · വീട്

A shared household app for Harsh and Prerna, navigated as a 3D model of a traditional Kerala home. Each room is a feature: the kitchen holds the shopping list and recipes, the office the calendar and tasks, and so on.

- Spec: [`SPEC.md`](SPEC.md) · Plan: [`docs/PLAN.md`](docs/PLAN.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Restore a backup: [`docs/RESTORE.md`](docs/RESTORE.md)
- 3D prototype (source of truth for the house): [`reference/veedu-prototype.html`](reference/veedu-prototype.html)

**Live:** https://veeduos.vercel.app

**Status:** phase 5 (living-room dashboard) done. Next: phase 6, recipes.

**Running cost:** $0/month. Everything runs on free tiers; see the cost table in `docs/PLAN.md` §4.

---

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · Zod · Vitest · Playwright. Coming in later phases: React Three Fiber (3D), Supabase (database, auth, realtime, storage, cron), TanStack Query, Framer Motion, Web Push.

Hosting: Vercel Hobby (free `*.vercel.app` domain). Background jobs: Supabase `pg_cron` + Edge Functions. Heavy jobs (recipe video processing, backups): GitHub Actions.

## Set up from zero

### 1. Accounts (all free)

| Account | Needed from | Notes |
|---|---|---|
| GitHub | phase 0 | This repo, private. Also runs CI, backups and keep-alive. |
| Vercel (Hobby) | phase 0 | Sign up **with GitHub**. Hosts the app. |
| Supabase | phase 2 | Database, sign-in, realtime, file storage. |
| Google Cloud | phase 2 | Google sign-in and Calendar API. |
| Google AI Studio | phase 6 | Gemini free tier, for turning recipe text into a recipe card. |
| Groq | phase 6 | Free speech-to-text for recipe videos. |

### 2. Deploy to Vercel

1. Go to vercel.com → **Add New… → Project**.
2. Find **HouseOS** in the list of GitHub repos → **Import**. If it's missing, click **Adjust GitHub App Permissions** and give Vercel access to this repo.
3. Leave every setting at its default (Framework: Next.js) → **Deploy**.
4. Every push to `main` now deploys to production, and every other branch gets its own preview URL.

### 3. Supabase and Google sign-in (phase 2)

1. **Supabase project:** supabase.com → New project (Free, region Canada Central). Save the database password in a password manager.
2. **Database:** SQL Editor → run each file in `supabase/migrations/` in name order (oldest first).
3. **Google OAuth client:** Google Cloud console → new project → Google Auth Platform → External app, **published (In production)** → Web client with origin `https://veeduos.vercel.app` and redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
4. **Supabase Auth:** Providers → Google → paste the client ID and secret. URL Configuration → Site URL `https://veeduos.vercel.app`; Redirect URLs `https://veeduos.vercel.app/**`, `https://*-harsh-s-vercel.vercel.app/**`, `http://localhost:3000/**`.
5. **Vercel env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` + your email), then redeploy.

New VAPID keys can be generated with `npx web-push generate-vapid-keys`. Changing them means everyone has to turn notifications on again.

Until the Supabase variables are set, the app runs without accounts (this is also how CI runs).

### 4. Environment variables

See [`.env.example`](.env.example) for the full list and which phase needs each one. Values go in **Vercel → Project → Settings → Environment Variables** (and `.env.local` if you run the app on your own computer). Never commit real values.

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
| **CI** | every push / PR (not docs-only) | lint, typecheck, unit tests, build, Playwright |
| **Supabase keep-alive** | every 3 days | runs a tiny query so the free project never pauses |
| **Weekly backup** | Sundays | encrypted database dump kept 56 days; see [`docs/RESTORE.md`](docs/RESTORE.md) |

## Project layout

```
src/app/        routes (pages + API)
src/lib/        shared helpers: env (Zod-validated), time (UTC ↔ Toronto)
tests/unit/     Vitest
tests/e2e/      Playwright
supabase/       migrations and (later) Edge Functions
.github/        workflows
docs/           plan, decisions, restore guide
reference/      the original 3D prototype
```

The full planned structure is in `docs/PLAN.md` §2.

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

Routes: `/` (house) and `/living`, `/kitchen`, `/bedroom`, `/office`, `/wash`, `/closet`, `/backyard` open the house inside with that room's panel. `/settings` has the 3D / 2D choice.

**2D floor plan:** used automatically when the device has no WebGL or prefers reduced motion, offered when the 3D view runs below ~28 fps, and selectable in Settings.

**Performance check:** add `?debug=1` to the URL, then run `__veedu.info()` in the browser console for draw calls and triangles.

## Google Calendar

`supabase/functions/calendar` handles everything that touches Google, so the Google secrets live only in Supabase:

- **Connect:** Settings → Calendars → Connect. It uses the `calendar` scope with offline access. The refresh token is encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and the app can never read it (no column grant).
- **Sync:** incremental, using Google's `syncToken`, with a full re-check weekly. `pg_cron` runs it every 15 minutes, and the app asks for a sync when it opens. Events are cached in `calendar_event_cache` and reach both phones through Realtime.
- **Two-way:** events added or deleted in the Office panel are written to Google straight away (to your calendar, Prerna's, or "Us").
- **"Us" calendar:** created in the account of whoever presses the button and shared with the other person as an editor.
- **Milestones:** yearly, editable in Settings. The four from the spec are filled in automatically. Reminders go out 14, 7 and 1 days before at 9 am, sent by `notify`; birthday reminders only go to the other person. Gift ideas are hidden from the person they're for (RLS).

Google Cloud needs the Calendar API turned on, the `.../auth/calendar` scope, and this redirect URI on the web client: `https://<project-ref>.supabase.co/functions/v1/calendar/callback`.

## Reminders (push)

`supabase/functions/notify` is a Supabase Edge Function that sends:

- chore reminders at the due time (6 pm Toronto on the day) to whoever's turn it is
- task reminders at the due time, or 9 am Toronto for date-only tasks
- a notification to the other person when a note is posted

`pg_cron` calls it every 5 minutes, and a trigger calls it straight after a note is posted. Each reminder is claimed in the database before it's sent, so nothing goes out twice. Quiet hours hold reminders until they end, and each person can switch the three kinds off in Settings. The rules live in `logic.ts` and are unit-tested in `tests/unit/reminders.test.ts`.

The **Deploy Supabase functions** workflow deploys the function and its VAPID secrets whenever `supabase/functions/` changes on `main`. You can also run it by hand from the Actions tab.

## Accounts

- **Sign-in:** Google, through Supabase Auth. `src/proxy.ts` refreshes the session and sends signed-out visitors to `/signin`.
- **Household:** exactly two people. The first person creates it at `/onboarding`; Settings → Household makes a single-use invite link (48 h) for the second person.
- **Database:** `supabase/migrations/`. Every table has row-level security limited to your own household; invites, joining and leaving go through checked database functions.
- **Notifications:** Web Push with VAPID keys. `public/sw.js` shows them; Settings → Notifications turns them on per device and sends a test. iPhone needs Veedu added to the Home Screen first (iOS 16.4+); the app shows a guide.
- **Export:** Settings → Your data downloads everything as JSON.

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
