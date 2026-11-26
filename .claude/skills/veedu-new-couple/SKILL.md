---
name: veedu-new-couple
description: Build, deliver and look after a couple's own copy of Veedu (the 3D Kerala-house household app in this repo) — from the first conversation with the couple, through creating their free Supabase / Vercel / Google Cloud / Gemini accounts, generating keys with scripts/new-couple.mjs, the GitHub environment and the Couples workflow, to checking it works, onboarding both partners, handing over, and ongoing care (releasing updates, keep-alive, backups, restores, fixes). Use this whenever the user wants to set up Veedu for another couple, friends or family, add or deploy a "couple"/"instance"/"copy", roll an update out to couples, help a couple who can't sign in or get notifications, restore a couple's backup, price or hand over a copy, or asks how Veedu was built — even if they don't say "skill" or "instance".
---

# A couple's own copy of Veedu

Veedu is one codebase deployed many times: the original copy (Harsh and Prerna's, veeduos.vercel.app) plus one copy per couple. Each copy runs on **the couple's own free accounts**, which is what keeps it at $0/month, keeps their data out of your hands, and avoids Google's app verification (two users per Google project is fine unverified). You hold the code and the deploy pipeline; they own everything that stores their data.

This skill is the runbook. Work through the stages in order for a new couple; jump to the relevant stage for an existing one. The person you're helping is usually the app's owner (comfortable with GitHub and the Supabase dashboard, not a career developer). For anything only they or the couple can do — creating accounts, clicking through consoles, pasting secrets — give numbered click-by-click steps and wait for them, rather than guessing. Never ask anyone to paste a secret into chat: secrets go into `.couples/<slug>.env` (git-ignored) and from there into GitHub with the script.

**Pieces you'll use**

| Piece | What it is |
|---|---|
| `instances/<slug>.json` | The copy's settings (committed): web address, Supabase project, time zone, city and coordinates, `enabled`. See `instances/_example.json`. |
| `scripts/new-couple.mjs` | Creates the settings file and `.couples/<slug>.env` with fresh keys; `--check` lists what's missing; `--upload` puts every secret into the GitHub environment `couple-<slug>`. |
| `.github/workflows/couples.yml` | **Actions → Couples**: `deploy` (database migrations, sign-in settings, functions, Vercel settings and the web app), plus automatic `keep-alive` every 3 days and an encrypted `backup` every Sunday. |
| `references/accounts.md` | Click-by-click account setup for the couple's Supabase, Google Cloud, Vercel and Gemini. Read it in stage 2. |
| `references/operations.md` | Releasing updates, keep-alive, backups and restores, the troubleshooting table, Actions-minute budget. Read it for stages 6–7 or whenever something breaks. |
| `references/how-veedu-was-built.md` | Architecture, the phase-by-phase build, conventions and gotchas. Read it before changing code or customising a house. |
| `assets/handover.md`, `assets/agreement.md` | Templates for the couple's handover note and a one-page service agreement. |

---

## Stage 1 — Talk to the couple (before touching anything)

Agree on these, and write the answers down (they become the settings file and the handover note):

1. **Who and where**: both names (they type these themselves at sign-up; you only need them for your notes), city and time zone (e.g. Kochi → `Asia/Kolkata`), and the city's latitude/longitude (for the automatic evening mode).
2. **The web address**: `https://<something>.vercel.app` — pick a name now (e.g. `asha-rohan-veedu`); it has to be free on Vercel. A custom domain is possible but costs money (theirs).
3. **Google accounts**: each partner signs in with Google. Which Google account will own the copy's Google Cloud project (usually one partner's)?
4. **Phones**: iPhone or Android. On iPhone, notifications only work after "Add to Home Screen", and passkeys need Safari or the home-screen app.
5. **What they expect**: the same rooms as the original (kitchen, office, wash area, bedroom, backyard, closet), the Kerala house, their own room labels and colours (they change these in Settings). A different house is bespoke 3D work (days) — see `how-veedu-was-built.md` § Customising.
6. **Money and care**: setup fee, optional retainer and what it covers (`assets/agreement.md`). Even for friends, put it in writing; it protects the friendship.
7. **Data**: their data lives in their accounts. Vault and calendar data never go to an AI; Gemini only sees recipes they import. The vault protects against a leaked database, not against someone who controls their Supabase account — tell them not to store bank passwords.

Pick a **slug**: lowercase, digits and dashes, e.g. `asha-rohan`. It names the settings file and the GitHub environment.

## Stage 2 — Create the couple's accounts

Follow `references/accounts.md`, sitting with the couple (or on a call) since the accounts are theirs. You'll come out with: a Supabase project (ref, publishable key, session-pooler URL, access token), a Google Cloud OAuth client (id, secret) with the Calendar API and **both** redirect URIs, a Vercel project with its id, org id and a token, and optionally a Gemini key. The most common mistake later is a missing redirect URI (`Error 400: redirect_uri_mismatch`) — double-check both.

## Stage 3 — Generate the copy's settings and keys

```bash
node scripts/new-couple.mjs --slug asha-rohan --couple "Asha & Rohan" \
  --app-url https://asha-rohan-veedu.vercel.app --project-ref <20-letter ref> \
  --tz Asia/Kolkata --city Kochi --lat 9.9312 --lng 76.2673
```

This writes `instances/asha-rohan.json` (with `"enabled": false`) and `.couples/asha-rohan.env` with freshly generated VAPID keys, token-encryption key, **vault master key** and **backup passphrase**, plus blanks with notes on where each remaining value comes from. Fill the blanks from stage 2 (the person types them into the file; you never see or echo them), then:

```bash
node scripts/new-couple.mjs --slug asha-rohan --check    # until everything shows ✓
node scripts/new-couple.mjs --slug asha-rohan --upload   # needs `gh auth login` first
```

`--upload` creates the GitHub environment `couple-asha-rohan` and sets each secret there. The vault master key and backup passphrase must also go into **the couple's** password manager now — if the vault key is lost or changed, their vault can't be read; without the passphrase, backups can't be restored.

## Stage 4 — First deploy

1. Set `"enabled": true` in `instances/<slug>.json`, commit and push (CI validates every settings file).
2. GitHub → **Actions → Couples → Run workflow**, couple: `<slug>`, action: `deploy`.
3. Watch the run. In order it: checks the secrets, applies all database migrations (`supabase db push`), configures Supabase sign-in (Google provider, site URL, redirect allow-list), sets the function secrets and deploys the four functions, calls them once (the `notify` call records the functions' address in the database so the scheduled pings work), writes the Vercel environment variables, then builds and deploys the web app and checks `/api/health`.
4. If a step fails, its error names the cause (a missing secret, a rejected token, a Vercel name mismatch). Fix and re-run; every step is safe to repeat. See the troubleshooting table in `references/operations.md`.

## Stage 5 — Check it works (you, before the couple)

On a phone and a computer, at the copy's address:

1. Sign in with Google. The "Google hasn't verified this app" screen is expected: **Advanced → Go to …**. A `redirect_uri_mismatch` means stage 2's redirect URIs are wrong.
2. Create the household (onboarding), then make an invite link — but don't keep the household: when the couple signs in, the first of them should create it. Simplest: test with one of the couple present, or use Settings → Leave household afterwards.
3. Settings → turn on notifications → **Send a test**. Settings → Calendars → Connect, and create the "Us" calendar (needs the partner's account in the household to share it).
4. Add a shopping item from the + button; tick it; check the 3D house shows the fridge badge.
5. Closet: set a PIN (needs a sign-in in the last 15 minutes — "Sign in again" does it), add a Wi-Fi entry, lock, unlock.
6. Settings → This device → Evening mode should say "Automatic, at <city> sunset" with a sensible sunset time. Free-plan usage should show tiny bars.

## Stage 6 — Onboard the couple

A 30–45 minute session with both partners and both phones works best:

1. Partner A signs in, creates the household, picks a colour; makes the invite link (Settings → Household) and sends it to partner B, who signs in through it.
2. On each phone: open the address, **Add to Home Screen** (iPhone: Share → Add to Home Screen; Android: menu → Install app), open it from the home screen, then Settings → Notifications → turn on → Send a test.
3. Each connects their Google Calendar (Settings → Calendars); one creates the "Us" calendar.
4. Each sets their own vault PIN and adds fingerprint/face (Closet → Your unlock methods).
5. Show the + button, "I'm at the store", the staples row, Surprise me, trips, and the 8 am morning summary (Settings → Notifications has switches for each kind).
6. Give them the filled-in `assets/handover.md` (accounts they own, where their keys are, what the retainer covers, how to reach you). Then delete `.couples/<slug>.env` from your machine or move it to your own password manager — the copies in GitHub's encrypted environment are what the pipeline uses.

## Stage 7 — Ongoing care (retainer)

Read `references/operations.md` for details. The rhythm:

- **Updates**: merge to `main` → the original copy (veeduos) updates first → after it has run fine for a few days, **Actions → Couples → all → deploy**. New database migrations apply automatically to couples' copies (tracked by `supabase db push`); the original copy still has its migrations pasted into the SQL editor by hand. Write migrations that are safe to run twice (`if not exists`, `drop … if exists`) — see the gotchas in `how-veedu-was-built.md`.
- **Automatic**: keep-alive every 3 days (free Supabase projects pause after 7 idle days) and an encrypted backup every Sunday, kept 56 days as workflow artifacts.
- **Watch**: each copy's Settings → Free-plan usage warns at 70% of the free database / storage. GitHub Actions minutes are shared by every copy (2,000/month on a private repo) — budget in `operations.md`.
- **Requests**: small fixes under the retainer; new features quoted separately, built once in the shared code and switched on by settings where possible (never fork the code per couple — every fork multiplies maintenance).

## Changing code for everyone

Every change lands in all copies, so: keep anything couple-specific in `instances/<slug>.json` → build-time `NEXT_PUBLIC_HOME_*` variables (`src/lib/instance.ts`) or function secrets (`HOME_TZ`, `APP_URL`, `PREVIEW_ORIGIN_REGEX`), never hard-coded. Run the full checks before merging: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:db`, `npm run build` then `npm run test:e2e`. `references/how-veedu-was-built.md` has the architecture and the house rules (UTC storage, home-time display, RLS on every table, soft delete, no secrets client-side, never send vault/notes/calendar data to an AI).
