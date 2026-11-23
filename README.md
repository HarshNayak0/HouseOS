# Veedu · വീട്

A shared household app for Harsh and Prerna, navigated as a 3D model of a traditional Kerala home. Each room is a feature: the kitchen holds the shopping list and recipes, the office the calendar and tasks, and so on.

- Spec: [`SPEC.md`](SPEC.md) · Plan: [`docs/PLAN.md`](docs/PLAN.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) · Restore a backup: [`docs/RESTORE.md`](docs/RESTORE.md)
- 3D prototype (source of truth for the house): [`reference/veedu-prototype.html`](reference/veedu-prototype.html)

**Status:** phase 0 (setup) done. Next: phase 1, the 3D house.

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

### 3. Environment variables

See [`.env.example`](.env.example) for the full list and which phase needs each one. Values go in **Vercel → Project → Settings → Environment Variables** (and `.env.local` if you run the app on your own computer). Never commit real values.

### 4. GitHub Secrets (for the scheduled workflows)

**GitHub → repo → Settings → Secrets and variables → Actions → New repository secret.** Added in phase 2:

| Secret | Used by | Where to get it |
|---|---|---|
| `SUPABASE_URL` | keep-alive | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | keep-alive | Supabase → Project Settings → API → anon/public key |
| `SUPABASE_DB_URL` | backup | Supabase → **Connect** → **Session pooler** connection string (with your DB password filled in) |
| `BACKUP_PASSPHRASE` | backup | A long random passphrase you also save in your password manager |

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

## Time zones

All times are stored in UTC and displayed in America/Toronto (`src/lib/time.ts`, with daylight-saving tests).
