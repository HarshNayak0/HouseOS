# Veedu — build spec (v3)

A shared household web app for two people: me (Harsh) and my partner (Prerna Nair). The whole app is navigated as a **3D model of a traditional Kerala home**. Each room is a feature.

**A working 3D prototype already exists: `reference/veedu-prototype.html`.** It is one self-contained file using Three.js r128 and OrbitControls, with every texture drawn in code (no image files). Treat it as the **source of truth for the house**: layout, room sizes, materials, textures, camera views, the roof-lift transition, room labels, the in-scene indicators, and the look of the panels. Port it into the real app rather than redesigning it. Where this spec and the prototype disagree, follow the spec and tell me.

---

## 0. Ground rules

1. **$0 to set up and run.** Target $0/month, with a hard ceiling of about $2/month (occasional AI calls). Never add a paid service, paid domain, paid asset or paid font without asking me first. If something can't be done for free, stop and explain the trade-off.
2. **Plan first.** Before writing code, reply with:
   - your phase plan
   - folder structure
   - database schema (as a Mermaid ER diagram)
   - a **cost table**: each service, its free-tier limits, and our expected usage
   - a **prototype port plan**: what you'll reuse from `reference/veedu-prototype.html` as-is, and what you'll restructure
   - questions and risks

   Wait for my approval.
3. **One phase at a time.** Commit at the end of each phase (conventional commit messages), push to GitHub, then stop and tell me exactly how to test it on my phone and on desktop.
4. **Don't guess about external setup.** For every account or console step only I can do (Supabase, Google Cloud, Vercel, GitHub secrets, AI keys), give me numbered click-by-click instructions and wait for me to confirm before continuing.
5. **Keep the docs current.** Update `README.md` (setup and deploy from zero) and `docs/DECISIONS.md` (short log of choices and why) as you go.

---

## 1. Prerequisites — have me set these up in phase 0
- **Node.js LTS** and **git** installed; check versions
- A **private GitHub repo** for this project (also used for free GitHub Actions)
- Free accounts on:
  - **Supabase**
  - **Vercel** (Hobby, signed in with GitHub)
  - **Google Cloud** (for OAuth + Calendar API)
  - one free AI provider for recipe structuring (default: **Google AI Studio / Gemini free tier**)
  - one free transcription option (default: **Groq free tier**; fallback: whisper.cpp inside the GitHub Action)
- VAPID keys for Web Push (generate them for me)

---

## 2. Tech stack (all free tier)
- **App:** Next.js (App Router) + TypeScript strict
  - Tailwind with design tokens (section 6)
  - TanStack Query for data fetching
  - Zod for validation
  - Framer Motion for the 2D panels
- **3D:** React Three Fiber + @react-three/drei, on the current version of three.js.
  - Port the prototype's scene code into typed modules: `scene/house`, `scene/rooms`, `scene/materials`, `scene/textures`, `scene/props`, `scene/garden`, `scene/camera`, `scene/indicators`.
  - Keep the procedural `CanvasTexture` approach: zero asset downloads, $0.
  - Upgrade any r128 APIs that are now deprecated, e.g. `outputEncoding` / `sRGBEncoding` → `outputColorSpace` / `SRGBColorSpace`.
- **Backend:** Supabase free tier: Postgres + Row Level Security, Auth (Google), Realtime, Storage, `pg_cron`, Edge Functions
- **Hosting:** Vercel Hobby on the free `*.vercel.app` domain
- **Background jobs:** Supabase `pg_cron` + Edge Functions, used for reminders, recurring chores, calendar re-sync, cleanup. Don't use Vercel cron.
- **Media worker:** GitHub Actions (`repository_dispatch`) running `yt-dlp` + `ffmpeg` (see 4.4)
- **Push notifications:** Web Push with VAPID; no third-party service
- **Fonts:** Google Fonts only, self-hosted via `next/font`
- **Tests:** Vitest (logic), Playwright (key flows, including a 375px mobile viewport). Run both in GitHub Actions on every push.

---

## 3. The house (port from the prototype)

### 3.1 Layout (metres, front of house = +z)
The house is a **nalukettu** on a 0.45 m red-oxide plinth with 3.0 m walls. Rooms sit around a sunken open courtyard (nadumuttam). A pillared front verandah (poomukham) has charupadi bench seating.

| Room | Feature(s) | Footprint |
|---|---|---|
| Living room + courtyard hall (oonjal swing over the sunken courtyard) | Dashboard + notes board | living 4.5 × 5; hall 5.5 × 5; courtyard 2.6 × 2.6 |
| Kitchen (adukkala) | Shopping list + recipe box | 4 × 5 |
| Bedroom (kidappumuri) | Date ideas | 5.5 × 4 |
| Office / study | Calendar + tasks | 4.5 × 4 |
| Wash area | Chores | 4 × 4 |
| Coat closet (front-left, off the verandah) | Home info vault | 2.5 × 3 |
| Backyard (thodi): well, coconut palms, pond with a small kettuvallam boat | Trip planner | about 16 × 9 |

Keep the prototype's exact coordinates, furniture placement and wall openings.

**Malayalam labels** to keep: സ്വീകരണമുറി, അടുക്കള, കിടപ്പുമുറി, പഠനമുറി, തൊടി. Leave the wash area and coat closet labels in English for now. I'll confirm the Malayalam later, so make every room label editable in config.

### 3.2 Behaviour (already working in the prototype)
- **Exterior first:** the house opens on a 3/4 exterior view (tiered terracotta roof, carved mukhappu gable, verandah, palms, laterite compound wall).
- **Step inside:** the roof lifts away and fades, walls drop to 40% height (cutaway), and the camera flies to an overview.
- **Labels:** floating room labels in English with Malayalam beneath. Hover highlights the floor (desktop); tapping a room flies the camera in (~950 ms ease) and opens that room's **2D panel**.
- **Panel placement:** on desktop, the panel is on the right and the camera target is offset so the room stays visible. On mobile, it's a bottom sheet (~58% height) and the camera target is shifted so the room shows above the sheet.
- **Tap vs drag:** a pointer that moves less than 7 px counts as a tap. Orbit is damped, panning is off, polar angle is capped, and zoom is limited.
- **Evening mode:** dusk sky; nilavilakku, verandah lamps and the boat lantern glow. Make this **automatic**, based on real sunset in Toronto, with a manual override.

### 3.3 In-scene indicators (driven by real data)
- **Fridge badge:** count of unchecked shopping items
- **Laundry:** basket heap size reflects open chores; badge shows overdue chores
- **Nilavilakku in the living room:** flames brighten for 24 h after a new note from the *other* person
- **Boat lantern:** lit when a trip departs within 30 days
- **New:** a small brass bell on the closet door when a vault renewal date is within 30 days
- **New:** a soft glow on the bedroom petti (chest) when a date is planned this week
- Badges fade out while the roof is on

### 3.4 Routing and fallbacks
- **Routes:** `/` (house), `/living`, `/kitchen`, `/bedroom`, `/office`, `/wash`, `/closet`, `/backyard`, `/settings`. Deep links open the house already inside, with that room selected. Push notifications link to these routes.
- **2D floor-plan fallback:** a top-down nalukettu map with the same rooms, used when:
  - the user toggles it in settings
  - `prefers-reduced-motion` is set
  - WebGL is unavailable
  - the device is low-power (detect low frame rate over the first 3 s and offer to switch)

  The 2D map must be fully keyboard and screen-reader accessible.
- **Performance budget:**
  - **Frame rate:** 60 fps target, ≥30 fps on a mid-range phone
  - **Load:** 3D scene lazy-loaded; initial JS for the house route under ~350 KB gzipped
  - **Device pixel ratio:** capped at 2
  - **Shadows:** a single shadow map of 2048 px or smaller, dropped to 1024 px on mobile
  - **Draw calls:** instance or merge repeated geometry (palms, pillars, bench slats, books)
  - **Textures:** generate each one once and cache it
- **Not yet in the prototype — add:**
  - an opening in the roof above the nadumuttam (the inner roof slopes down into the courtyard, the signature feature)
  - a gentle camera "idle drift" on the exterior view
  - a loading screen that shows real progress

### 3.5 Settings (new; reached from a gear icon in the header, also routed at `/settings`)
Settings include:
- display names, and person colours (you / her / both)
- connected Google calendars
- notification preferences, with quiet hours
- milestones (add / edit)
- room label text
- 3D on/off, and evening mode auto/manual
- data export (JSON download of everything)
- invite or leave the household
- sign out

---

## 4. Features (the 2D panels)
**Shared rules:**
- Every list updates live between our two devices, with optimistic UI.
- Last write wins, with an "updated by Her just now" hint if a conflict is detected.
- Deletions are soft, with a 7-day undo/trash.
- Every list has a friendly empty state and a first-run example.

### 4.1 Living room — dashboard + notes board
- **Time-sensitive strip**, ranked:
  - overdue tasks and chores
  - items due within 48 h
  - milestones within 14 days, shown as a countdown
  - trip departures within 30 days, with packing %
  - vault renewals within 30 days
- **Today:** both calendars merged and colour-coded by person
- **Next 7 days:** a week strip
- **Pending:** tasks and chores
- **Notes board:**
  - sticky notes with text, colour, author, pin and optional expiry
  - pinned notes first; expired notes auto-archive
- **Small extras:**
  - "together for N days" counter (since 2025-10-18)
  - activity feed of the last 20 actions, pruned after 90 days

### 4.2 Kitchen — shopping list + recipe box
**Shopping list**
- Shared list grouped by store or category
- Quick add with frequent-item suggestions learned from history
- "Clear checked"
- Duplicate merging when adding from a recipe

**Recipe box**
- Each recipe has:
  - title, photo, ingredients (qty / unit / item) and steps
  - prep and cook time, servings
  - tags
  - each person's 1–5 rating, and notes
  - source URL and creator credit
- Search and filters; a servings scaler; "add ingredients to list"

**Website import**
- Parse `schema.org/Recipe` JSON-LD first; only use the LLM as a fallback

**Instagram import** (async job; status shown in the UI: queued → downloading → transcribing → reading on-screen text → structuring → ready for review)
1. The app triggers a **GitHub Actions** workflow with the URL + job ID.
2. The workflow uses `yt-dlp` to get the caption/metadata and download the video, then uses `ffmpeg` to extract the audio and ~12 frames.
3. Transcribe via the `Transcriber` interface (Groq free tier by default; whisper.cpp fallback).
4. Structure via the `LLMProvider` interface (Gemini free tier by default; optional Claude Haiku if I add a key, with a spend cap). Input is caption + transcript + frames.
   - The output must validate against a Zod recipe schema with a confidence score per field.
   - Never invent quantities: leave them blank and flag them.
5. **Download the thumbnail and store it** (compressed WebP) in Supabase Storage. Never hotlink Instagram CDN URLs; they expire.
6. Write the result back to Supabase with a service key held in GitHub Secrets. Delete the video and audio.
7. A **review screen** highlights low-confidence fields before saving.

**Fallbacks and limits**
- If a download fails (private post, IP block, Instagram changes), offer two alternatives:
  - paste the caption
  - upload the video from my phone

  Both use the same pipeline.
- Rate limit: 20 imports a day.

**Sharing from the phone**
- On Android: PWA Web Share Target.
- On iOS (no share target for PWAs): a paste flow with a clipboard-detect prompt.

**Privacy:** never send vault, notes or calendar data to any AI provider.

### 4.3 Bedroom — date ideas
- Each idea has: title, notes, link, location, tags, cost ($–$$$$), time needed, and who added it
- Status: wishlist → planned → done
- **"Surprise me"** draws a folded note from the brass uruli, with filters
- **Schedule** creates an event on the shared calendar
- **When done:** both ratings, a photo and a memory note, shown in a **memories timeline**

### 4.4 Office — calendar + tasks
**Google Calendar two-way sync** for both accounts
- OAuth with offline access; refresh tokens encrypted at rest
- Each person picks which of their calendars to show
- Incremental sync via `syncToken`, re-syncing every 10–15 min via `pg_cron` and when the app opens
- New events can go to my calendar, hers, or a shared "Us" Google calendar

**Important OAuth setting:** set the Google OAuth consent screen to **In production** (unverified is fine for personal use). In Testing mode, refresh tokens expire every 7 days.

**Calendar views**
- Day, week and month, colour-coded by person
- Tasks and chores with due dates also appear on the calendar

**Milestones** (recurring yearly; editable in settings). Seed these:
- Her birthday: **2001-09-01**
- First date: **2025-09-11**
- My birthday: **2001-09-14**
- Relationship anniversary: **2025-10-18**

Each milestone gets an auto label ("2nd anniversary", "turning 26"), reminders 14/7/1 days before, and attached gift ideas.

There's a **September planner** view, since three milestones fall within two weeks of each other.

**Tasks**
- Each task has: title, notes, due date and time, assignee (me / her / both), priority, subtasks, and visibility (personal or shared)

**Time zone:** America/Toronto for display; store UTC. Test daylight-saving edges.

### 4.5 Wash area — chores
- Recurrence uses RRULE
- Assignment: one person, or rotating
- Reminders, and a completion log (who and when)
- Completing a chore generates the next one
- A weekly "fairness" line: how many chores each person did

### 4.6 Coat closet — home info vault
**Sections**
- Wi-Fi
- Contacts
- Lease and insurance, whose renewal dates feed the calendar and dashboard
- Appliances (model, serial, warranty, and a manual as a link or a PDF up to 5 MB)
- Shared service accounts

**Security**
- Opening the vault needs a **re-unlock** by passkey/WebAuthn (Face ID or fingerprint), with a 6-digit PIN fallback. Auto-lock after 5 minutes.
- Sensitive fields are encrypted at rest:
  - envelope encryption with libsodium, or `pgcrypto` with a key held server-side
  - masked by default
  - never logged
  - copy-to-clipboard

### 4.7 Backyard — trip planner
- One page per trip: destination, dates and cover photo
- Day-by-day itinerary
- Bookings with confirmation numbers and attachments
- Shared packing list with per-person items and reusable templates
- Budget: planned vs spent
- Trips appear on the calendar automatically
- Departures appear in the dashboard's time-sensitive strip

---

## 5. Accounts, security, data
- **Household:** a single household with exactly 2 members.
  - The invite link expires after 48 h and is single-use.
  - Partner onboarding flow: accept invite → Google sign-in → pick a colour → optionally connect a calendar → enable notifications.
- **Database rules:**
  - Every table has RLS restricted to household members.
  - Every row has `household_id`, `created_by`, `created_at`, `updated_at`, `deleted_at`.
- **Push notifications:**
  - Per-person preferences and quiet hours (default 23:00–07:00).
  - **On iOS, Web Push only works after the PWA is added to the Home Screen (iOS 16.4+).** Detect this and show a one-time "Add to Home Screen" guide.
- **Backups:** Supabase free tier has no point-in-time recovery. Add a weekly GitHub Actions job that runs `pg_dump`, encrypts the dump with a passphrase from GitHub Secrets, and keeps the last 8 dumps as workflow artifacts or in a private backup branch. Document how to restore.
- **Keep-alive:** a GitHub Actions cron pings Supabase every 3 days so the free project never pauses.
- **Storage hygiene:**
  - Compress images in the browser to WebP (≤1600 px, ~200 KB) before upload.
  - Run a monthly job that reports database and storage usage against free limits and warns me in the app at 70%.
- **Security headers:** CSP, HSTS. Validate every input with Zod. No secrets client-side except public anon keys.

Propose the full schema. At minimum it needs:
- **Household:** households, members, invites, settings
- **Living room:** notes, activity_log
- **Kitchen:** shopping_items, recipes, recipe_ingredients, recipe_steps, recipe_import_jobs
- **Bedroom:** date_ideas, date_memories
- **Office:** calendar_accounts, calendar_event_cache, milestones, gift_ideas, tasks, subtasks
- **Wash area:** chores, chore_completions
- **Closet:** vault_items
- **Backyard:** trips, trip_days, trip_bookings, packing_items, packing_templates
- **Notifications:** push_subscriptions, notification_prefs

---

## 6. Design system: traditional Kerala home
Match the prototype's panels: cream paper surface, thin brass border, and a **kasavu**-style gold band across the top.

**Palette tokens**

| Token | Hex |
|---|---|
| Lime-plaster background | `#F6F1E7` |
| Panel surface | `#FBF8F2` |
| Rosewood ink (text) | `#3B2418` |
| Secondary text | `#7A6250` |
| Teak | `#7A4527` |
| Red-oxide (primary accent) | `#9C3B2A` |
| Terracotta | `#B8613D` |
| Brass | `#B8893B` |
| Leaf green (done states) | `#4F7A3A` |
| Urgent | `#8A2B22` |
| Person: me | teak |
| Person: her | lotus `#C98B8B` |
| Person: both | leaf |
| Evening mode background | `#1F1611`, with brass lamp-glow accents |

**Type**
- UI: Nunito Sans
- Headings: Fraunces
- Malayalam: Manjari

**Motion**
- Panels: 150–250 ms
- Camera: ~950 ms ease-in-out
- Respect reduced motion

**Rules**
- Use Kerala motifs sparingly and with purpose. Warm and calm, never kitsch.
- WCAG AA contrast. Tap targets ≥44 px. Visible focus rings in brass.

---

## 7. Phases
0. **Setup:** prerequisites, repo, CI (lint, typecheck, tests), env scaffolding, README skeleton, keep-alive and backup workflows
1. **House shell:** port the prototype into R3F modules. Include routing, labels, camera flights, the 2D floor-plan fallback, and the panel shell with placeholder content. Deploy to Vercel so I can open it on my phone.
2. **Auth and household:** Supabase schema + RLS, Google sign-in, invite and onboarding, settings page, PWA install, push subscription (with the iOS guide)
3. **Core lists:** shopping, tasks, chores (with RRULE), notes. All realtime, all wired to the 3D indicators.
4. **Calendar:** OAuth (production consent), sync jobs, merged views, milestones + reminders
5. **Dashboard:** time-sensitive strip, today, 7-day view, pending, activity feed
6. **Recipes:** manual recipes, JSON-LD import, the Instagram pipeline, review screen, share target
7. **Bedroom, backyard, closet:** date ideas + memories, trips + packing, vault (passkey + encryption)
8. **Polish:**
   - the roof opening over the nadumuttam, auto evening mode
   - performance pass on a real phone
   - accessibility audit, Playwright suite
   - usage monitor, final README

## 8. Definition of done (every phase)
- Typecheck, lint and tests pass in CI
- Works at 375 px and on desktop; tested on a real phone via the Vercel preview URL
- Realtime changes appear on the other device within about 1 s
- No secrets in code; `.env.example` is current
- The cost table is still accurate, and still within free limits
- README and DECISIONS are updated
