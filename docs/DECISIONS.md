# Decisions log

Short log of choices and why. Newest first.

| Date | Decision | Why |
|---|---|---|
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
