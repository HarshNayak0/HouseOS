# Running couples' copies

Contents: Releasing updates · Database changes · Keep-alive and backups · Restoring a couple · Rotating
keys · Removing a couple · Actions minutes · Troubleshooting

---

## Releasing updates

1. Change the code once, on a branch. Run the checks: `npm run lint && npm run typecheck && npm test &&
   npm run test:db && npm run build && npm run test:e2e`.
2. Merge to `main`. The **original copy** (veeduos) updates first: Vercel deploys the web app from Git,
   and `deploy-functions.yml` redeploys the functions when `supabase/functions/` changed.
3. Use it for a few days. Then **Actions → Couples → Run workflow → couple: `all`, action: `deploy`**.
   `max-parallel: 2` and `fail-fast: false` mean one broken copy doesn't stop the rest; re-run just that
   couple after fixing.
4. Tell couples what changed if it's visible (a short message; they don't need release notes).

Rolling back: revert the commit on `main`, then run the Couples deploy again (database migrations don't
roll back — write them so they never need to: additive changes only).

## Database changes

- **Couples' copies**: `supabase db push` applies any migration not yet recorded in the copy's
  `supabase_migrations.schema_migrations`. Nothing to do by hand.
- **The original copy**: its early migrations were pasted into the SQL editor, so it has no migration
  history. Keep giving its owner each new file to run in **SQL Editor → New query** (if the
  "Potential issues" box appears, **Run without RLS**: our files switch RLS on themselves). Optionally,
  switch it to `db push` once: `supabase migration repair --status applied <each version> --db-url …`,
  then pushes work there too.
- Write every new migration to be safe to run twice (`create table if not exists`, `drop policy if exists`
  before `create policy`, `create or replace function`, guard `alter publication … add table` with a
  `pg_publication_tables` check). The SQL editor keeps whatever ran before an error, so a re-run must not
  fail on what already exists.
- Every table with a `deleted_at` column must be emptied by `purge_trash()` or listed with a reason in
  `tests/db/trash.test.sql` — the test fails otherwise.

## Keep-alive and backups

- Keep-alive: Couples workflow, every 3 days (09:29 UTC), calls `rpc/ping` with the copy's publishable key.
  If a copy ever pauses anyway (Supabase emails the couple), they click **Restore** in the dashboard.
- Backups: every Sunday (08:11 UTC) — roles, schema and data dumped, encrypted with the couple's
  `BACKUP_PASSPHRASE`, kept 56 days as workflow artifacts named `veedu-backup-<slug>-<date>`. Photos and
  PDFs in Storage are not in the dump.
- Run either by hand: Couples → Run workflow → couple, action `keep-alive` / `backup`.

## Restoring a couple

`docs/RESTORE.md` has the full steps; per couple: download `veedu-backup-<slug>-<date>`, decrypt with
their passphrase, restore into their (new or reset) Supabase project with `psql`, update
`supabaseProjectRef` and the secrets if the project changed, add the two Google redirect URIs for the new
ref, then run the Couples deploy. Keep the **same** `VAULT_MASTER_KEY` or the vault can't be read.

## Rotating keys

- VAPID keys: changing them means both partners must turn notifications on again. Only if leaked.
- `TOKEN_ENCRYPTION_KEY`: changing it breaks stored Google tokens — they reconnect calendars in Settings.
- `VAULT_MASTER_KEY`: **never** change it once the vault has items.
- Supabase / Vercel tokens: generate a new one in their account, update the GitHub environment secret
  (`gh secret set NAME --env couple-<slug>`), revoke the old one.

## Removing a couple

Set `"enabled": false` (stops scheduled keep-alive/backups; the app keeps running until Supabase pauses
it), or delete `instances/<slug>.json` and the `couple-<slug>` environment (Settings → Environments).
Their accounts and data stay theirs; give them the latest backup if they want it.

## Actions minutes (private repo: 2,000 free minutes/month, shared by every copy)

| Job | Minutes each | Per month |
|---|---|---|
| CI on a push to main | ~1.5 | depends on how often you push |
| Couples deploy, per couple | ~4–6 | per release × couples |
| Keep-alive, per couple | <1 | ~10 |
| Backup, per couple | ~1–2 | ~6 |

With 5 couples and 4 releases a month: ~100 deploy + ~80 keep-alive/backup minutes, plus CI. If minutes
get tight, release less often, or make the repo public (unlimited minutes) only after checking nothing
private is in it — the secrets live in GitHub environments, not the code.

## Troubleshooting (things that actually happened)

| Symptom | Cause | Fix |
|---|---|---|
| `Error 400: redirect_uri_mismatch` at Google sign-in | The client is missing `https://<ref>.supabase.co/auth/v1/callback` (or the calendar one) | Google Cloud → Clients → add both redirect URIs, Save, wait ~5 min |
| "Google hasn't verified this app" | Expected for a two-person unverified app | **Advanced → Go to Veedu** |
| "Access blocked: doesn't comply with OAuth 2.0 policy" | Usually the redirect mismatch above (tap *error details*); sometimes sign-in inside another app's browser | Fix the URIs; open the address in Safari/Chrome directly |
| SQL editor: `relation … already exists` | The file was run twice (or partly) | Re-run an idempotent version; for couples this can't happen (`db push` tracks history) |
| Page cropped at top/right on iPhone after typing | Safari auto-zoom on fields under 16 px (fixed: fields are 16 px on touch screens) | Pinch out / reopen; if it returns, a new field skipped the global rule |
| "Couldn't turn on notifications" / push service error | VAPID public key in Vercel doesn't match the functions' key, or iPhone not using the home-screen app | Re-run the Couples deploy (it writes both from the same secret); on iPhone, Add to Home Screen first |
| Calendar: "isn't set up" | Google secrets missing from the functions | Check `GOOGLE_CLIENT_ID/SECRET` and `TOKEN_ENCRYPTION_KEY` in the environment, redeploy |
| Calendar connect fails after consent | Calendar callback redirect URI missing | Add `…/functions/v1/calendar/callback` |
| Vault: "isn't set up yet" | `VAULT_MASTER_KEY` missing | Add it to the environment (from the couple's password manager), redeploy |
| Vault: "sign in again first" when setting a PIN | By design: setting up or resetting a PIN needs a Google sign-in in the last 15 minutes | Tap **Sign in again** |
| Recipe screenshot "too large" / "couldn't read" on iPhone | Safari can't make WebP (fixed: falls back to JPEG); Gemini busy (503) | Retry; check `GEMINI_API_KEY` exists |
| Reminders/digest never arrive but the test notification works | `app_config.functions_url` not set yet (scheduled pings do nothing) | Re-run the deploy (its "Functions start" step calls `notify`, which records the address) |
| Couples deploy: Vercel 403/404 | Wrong `VERCEL_PROJECT_ID` / `VERCEL_ORG_ID`, or token from another account | Re-read them with the curl commands in `accounts.md` |
| Couples deploy: auth settings 401 | `SUPABASE_ACCESS_TOKEN` expired or from another account | New token in the couple's Supabase account |
| Health check warning after deploy | `appUrl` differs from the Vercel production domain (name taken → suffix) | Make `appUrl` and the Google origin match the real domain |
| Function deploy: "Data limit exceeded" from a registry, then retries | Temporary rate limit pulling the bundler image | Ignore if it finishes; otherwise re-run |
