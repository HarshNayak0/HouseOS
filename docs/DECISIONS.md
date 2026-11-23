# Decisions log

Short log of choices and why. Newest first. "Proposed" entries are waiting for approval in `docs/PLAN.md`.

| Date | Decision | Why |
|---|---|---|
| 2026-11-23 | *Proposed:* store encrypted backups as workflow artifacts, not a git branch | A backup branch grows the repo forever; artifacts expire on their own |
| 2026-11-23 | *Proposed:* vault uses server-side AES-256-GCM envelope encryption, master key only in Vercel and Supabase secrets | Free, protects against DB leaks and backups; limits documented in PLAN §6 |
| 2026-11-23 | *Proposed:* add `calendar_sources`, `item_frequency`, `scheduled_notifications` and other tables beyond the spec minimum | See PLAN §3 |
| 2026-11-23 | *Proposed:* merge static geometry and instance repeated props when porting the prototype | Hits the draw-call and ≥30 fps budget on phones |
| 2026-11-23 | Kit imported: `SPEC.md`, `CLAUDE.md`, `reference/veedu-prototype.html`; partner is Prerna Nair | Starting point |
