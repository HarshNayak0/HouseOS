# Couples' copies

Each `<slug>.json` here is one couple's copy of Veedu, running on that couple's own free accounts.
Files starting with `_` are examples and are never deployed. Secrets are not here: they live in the
GitHub environment `couple-<slug>` (uploaded by `scripts/new-couple.mjs --upload`).

| Field | Meaning |
|---|---|
| `slug` | Lowercase name, same as the file name and the GitHub environment `couple-<slug>` |
| `couple` | Their names, for your own reference |
| `appUrl` | The web address, exactly as Vercel serves it (no trailing slash) |
| `supabaseProjectRef` | The 20-letter id in their Supabase project's URL |
| `timeZone` | IANA zone everything is shown in, e.g. `Asia/Kolkata` (times are stored in UTC) |
| `city`, `lat`, `lng` | Shown in labels ("Kochi time"), and where sunset is computed for evening mode |
| `previewOriginRegex` | Optional: regex for preview deployments allowed to call the functions (usually empty) |
| `enabled` | Whether "all" deploys, keep-alive and backups include this copy |

The full process (talking to the couple, creating their accounts, first deploy, onboarding, handover,
updates, backups, troubleshooting) is the Claude skill in `.claude/skills/veedu-new-couple/`. Ask Claude
to "set up Veedu for a new couple", or read its `SKILL.md`.

Quick reference:

```bash
node scripts/new-couple.mjs --slug asha-rohan --couple "Asha & Rohan" --app-url https://asha-rohan-veedu.vercel.app \
  --project-ref abcdefghijklmnopqrst --tz Asia/Kolkata --city Kochi --lat 9.9312 --lng 76.2673
node scripts/new-couple.mjs --slug asha-rohan --check
node scripts/new-couple.mjs --slug asha-rohan --upload
```

Then set `"enabled": true`, push, and run **Actions → Couples → deploy**.
