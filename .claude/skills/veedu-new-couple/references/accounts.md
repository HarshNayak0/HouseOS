# Setting up a couple's accounts

All free, all owned by the couple (signed up with one partner's email). You drive; they click and type
passwords. Collect every value into `.couples/<slug>.env` (created by `scripts/new-couple.mjs`), never
into chat. Order matters only in that Google Cloud needs the Supabase project ref, and the Vercel name
must match the `appUrl` you chose.

Contents: 1. Supabase · 2. Google Cloud (sign-in + Calendar) · 3. Vercel · 4. Gemini (optional) ·
5. VAPID subject · 6. Check and upload

---

## 1. Supabase (database, sign-in, files, functions)

1. supabase.com → **Start your project** → sign up (GitHub or email; use the couple's).
2. **New project**: organisation = theirs, name `veedu`, a strong database password (into their password
   manager), region nearest them (Toronto → *Canada (Central)*, India → *South Asia (Mumbai)*), plan **Free**.
3. When it's ready, the address bar shows `supabase.com/dashboard/project/<ref>` — the 20-letter
   **project ref** goes in `instances/<slug>.json` (`--project-ref`).
4. **SUPABASE_ANON_KEY**: Project Settings → **API Keys** → the **publishable** key (`sb_publishable_…`).
5. **SUPABASE_DB_URL**: the **Connect** button (top of the dashboard) → **Session pooler** → copy the URI
   and replace `[YOUR-PASSWORD]` with the database password. (Session pooler, not direct: GitHub's runners
   need IPv4.)
6. **SUPABASE_ACCESS_TOKEN**: avatar (top right) → **Account preferences** → **Access Tokens** →
   **Generate new token**, name `veedu-deploy`. It lets the Couples workflow apply migrations, set sign-in
   settings, function secrets and deploy functions in *their* account.

Nothing else to click: the Couples workflow creates the tables, storage buckets, scheduled jobs and sign-in
settings itself.

## 2. Google Cloud (Google sign-in and Calendar)

Use the Google account that will own the project (usually one partner's).

1. console.cloud.google.com → project picker → **New project**, name `Veedu`.
2. **APIs & Services → Library** → search **Google Calendar API** → **Enable**.
3. **Google Auth Platform** (left menu; "OAuth consent screen" in older UIs) → **Get started**:
   - App name `Veedu`, support email = theirs. Audience **External**. Contact email = theirs. Agree → Create.
   - **Branding**: app logo optional (`docs/brand/veedu-logo-1024.png`); home page = the `appUrl`;
     privacy policy `appUrl/privacy`; terms `appUrl/terms`; authorised domain `vercel.app` is not allowed
     as a top-level authorised domain on some accounts — if refused, leave it blank (fine for an
     unverified two-person app).
   - **Data access** → Add scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`,
     `.../auth/calendar`.
   - **Audience** → **Publish app** → confirm (status *In production*). Don't submit for verification:
     with two users the "unverified app" screen is acceptable, and verification needs a domain they own.
4. **Clients** → **Create client** → *Web application*, name `Veedu web`:
   - Authorised JavaScript origins: the `appUrl` (e.g. `https://asha-rohan-veedu.vercel.app`).
   - Authorised redirect URIs — **both** (a missing one is the classic `Error 400: redirect_uri_mismatch`):
     - `https://<ref>.supabase.co/auth/v1/callback` (sign-in)
     - `https://<ref>.supabase.co/functions/v1/calendar/callback` (calendar connection)
   - Create → copy **Client ID** → `GOOGLE_CLIENT_ID`, **Client secret** → `GOOGLE_CLIENT_SECRET`.

The Couples workflow turns on Supabase's Google provider with these and sets the site URL and redirect
allow-list; no Supabase clicking needed. Changes on Google's side can take a few minutes to apply.

## 3. Vercel (the web app)

1. vercel.com → **Sign Up** → Hobby → continue with **email** (the couple's; they don't need GitHub).
2. **VERCEL_TOKEN**: avatar → **Account Settings** → **Tokens** → Create, name `veedu-deploy`, scope their
   personal account, no expiry (or a long one; note it in the handover).
3. Create an empty project named after the address you chose (no Git connection — the Couples workflow
   deploys with the CLI). With the token in the shell as `VERCEL_TOKEN` (never paste it into chat):

   ```bash
   curl -sS -X POST https://api.vercel.com/v11/projects \
     -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
     -d '{"name":"asha-rohan-veedu","framework":"nextjs"}' | node -e 'process.stdin.on("data",d=>{const j=JSON.parse(d);console.log(j.error?j.error.message:"VERCEL_PROJECT_ID="+j.id)})'
   curl -sS https://api.vercel.com/v2/user -H "Authorization: Bearer $VERCEL_TOKEN" \
     | node -e 'process.stdin.on("data",d=>console.log("VERCEL_ORG_ID="+JSON.parse(d).user.id))'
   ```

   Put both printed values in `.couples/<slug>.env`. (Dashboard alternative: the project's
   Settings → General shows the Project ID; for a personal account the org id is the user id.)
4. The production address is `https://<project-name>.vercel.app`. If that name was taken, Vercel adds a
   suffix — check the project's **Domains** after the first deploy and make `appUrl` (and the Google
   origin) match exactly.

Hobby is for non-commercial use: it's the couple's personal app on their own account, which fits. You
being paid for setup is a service you provide, not hosting you resell.

## 4. Gemini (optional — recipe imports from captions, websites without recipe data, screenshots)

aistudio.google.com → sign in (any of their Google accounts) → **Get API key** → **Create API key** →
choose the `Veedu` Google Cloud project → copy → `GEMINI_API_KEY`. Free tier; Google may use free-tier
prompts to improve its products, which is why only recipe content is ever sent. Without a key, pasted
captions are read by simple rules and screenshots can't be imported.

## 5. VAPID subject (push notifications)

`VAPID_SUBJECT=mailto:<an email of theirs>` — push services contact this address if the app misbehaves.
The VAPID key pair itself is generated by the script.

## 6. Check and upload

```bash
node scripts/new-couple.mjs --slug <slug> --check    # every line ✓
gh auth status || gh auth login                       # once per machine
node scripts/new-couple.mjs --slug <slug> --upload
```

Then set `"enabled": true` in `instances/<slug>.json`, commit, push, and run **Actions → Couples → deploy**.
