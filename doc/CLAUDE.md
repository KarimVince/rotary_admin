# CLAUDE.md — Rotary Club of Discovery Bay Admin App

Standing context for Claude Code. Read this first every session. The **code in
this repo is the source of truth**; this file is orientation, not a spec.

## What this is
Internal admin web app for the Rotary Club of Discovery Bay. Manages members,
NGOs/organisations & donations, "Rotary Friends" contacts, and annual membership
fees/invoicing. Small user base (club admins + treasurer), low traffic.

## Current status / resume from here (2026-07-10)
- **Epics 1, 2, 2b, 3, 4, 5, 7 are complete.** Epic 8 items are worked
  piecemeal from the backlog as requested (several already done — see
  ClickUp for current state, not this file).
- **Epic 9 (Board Roles & Access Control) is CLOSED — superseded by Epic 12**
  (Permission Matrix Hierarchy Revamp). Epic 9's flat App Function list
  never matched a real per-module rollout; Epic 12 replaced it with a strict
  Menu→Submenu tree applied to every module, not just 3 of ~8.
- **Epic 12 is complete** (Stories 12.1-12.11, branch
  `epic-12-permission-matrix-hierarchy`): Menu/Submenu permission matrix
  data model + admin UI, every module (Members, NGOs & Donations, Member
  Fees, Friends of Rotary, Board, Admin) wired to it, unified nav gating,
  default board positions (President/Treasurer/Secretary) + default matrix
  seeded via a standalone idempotent script
  (`backend/scripts/seed_permission_matrix.py` — **not** a migration,
  deliberately, so the test DB stays seed-free), full backend (408) +
  frontend (182) suites green, and a manual smoke pass against the real dev
  DB confirmed matrix-driven access resolves correctly end-to-end. **Not
  pushed to GitHub yet** — only push when explicitly asked.
- **Housekeeping from the Epic 12 session:** the dev-DB user
  `karim_vincent@yahoo.fr`'s password was reset to `REDACTED-TEST-PASSWORD` for
  the manual smoke test (its original password is unknown/unrecoverable) —
  tell the user so they can reset it to something real, or reset it again
  yourself if asked.
- **Epic 10 (Dinner Attendance Tracking) is complete** (Stories 10.1-10.10 +
  10.99, branch `epic-10-attendance`, branched off
  `epic-12-permission-matrix-hierarchy` since Epic 10 wires straight into
  Epic 12's permission matrix rather than the retired Epic 9 role checks —
  Story 10.6's "Epic 9" reference in ClickUp is stale, superseded in-line by
  10.10's `require_access`/`useAccess` plumbing from the start). New
  `attendance_events`/`attendance_records` tables, `attendance` /
  `attendance.history` / `attendance.sheet` app_functions (module "Dinner"),
  a new "President Elect" board position, nav entry Dinner → Attendance,
  history + sheet pages (per-row/collapsed-past member badges were removed
  from the sheet per follow-up feedback — sections are grouped by
  active/honorary/past headers only, no per-row status badge). Migrations
  `c3f7a1d8e2b6`/`d8b3f6c1a9e7` and the updated
  `backend/scripts/seed_permission_matrix.py` have been run against the
  real dev DB — confirmed present (President Elect position + attendance
  app_functions + full matrix). Story 10.99: full backend (416 tests,
  96.95% coverage) + frontend (192 tests) suites green — 3 attendance test
  failures found and fixed (test fixture assumptions about member counts /
  a missing `attendance.history` grant on the test secretary client, not
  app bugs). Backend has no ruff/black configured in this repo at all
  (checked — not installed, not in requirements), so that line of 10.99's
  checklist doesn't apply here. **Still not committed or pushed** — only
  do so when explicitly asked; 10.99's "push branch / open PR" checklist
  items are intentionally not done yet for the same reason. One deliberate
  deviation from the ClickUp spec: `attendance_events.rotary_year` is
  stored as `Integer` (like every other rotary_year column in this app)
  instead of the story's literal `"YYYY-YYYY"` string, with the display
  string still derived via the existing frontend `rotaryYearLabel` helper.
  Epic 10 has been **committed and pushed** to `origin/epic-10-attendance`
  (still not merged into `main`, and no PR opened — only do that when asked).
- **Epic 11 (NGO Classification) is implemented** (Stories 11.1-11.6, branch
  `epic-11-ngo-classification`, branched off `epic-10-attendance`). New
  `ngo_classifications` table (12 seed rows via migration
  `e5c2a9f4b7d1`), `organisations.classification_id` nullable FK
  (`ON DELETE SET NULL`), new `admin.ngo_classifications` app_function
  (migration `f1a4d7c3e9b2`) gated to Secretary/President/President Elect
  write via the permission matrix — which required also elevating the
  `admin` **menu**-level entry to write for those 3 positions in
  `seed_permission_matrix.py` (a Submenu's access can never exceed its
  parent Menu's), so `/admin/ngo-classifications` had to be registered in
  `App.jsx` **outside** the hard `requiredRole="admin"` route wrapper (like
  `/admin/currencies`, unlike `/admin/member-titles`/`/board/positions` —
  see the flagged pre-existing routing-mismatch bug below). NGO cards/detail
  page/directory filter/create-edit form/stats page all wired up. **Three
  deliberate deviations from the ClickUp spec** (each flagged as a ClickUp
  comment on its story, not silently done): (1) reorder is up/down buttons,
  not drag-and-drop — no drag-and-drop library exists anywhere in this app;
  (2) `OrganisationRead.classification_id` is a denormalized ID like every
  other FK in this app (e.g. `Member.title_id`), not the spec'd nested
  `classification: {id, name}` object — frontend joins client-side; (3) the
  Directory classification filter is single-select (matches the existing
  Country/Year filter UI), not a multi-select chip bar. **Story 11.6's
  "Impact on Report" AC was deliberately skipped** — PDF/PPTX report
  generation for donations statistics doesn't exist anywhere yet (only
  Members has it); building it is Epic 8 Story 8.13's job, off-limits until
  explicitly moved to Planning per the Epic 8 rule. The classification
  filter + breakdown chart on the stats page (Parts A & B) are done.
  **Also fixed in passing** (same file already being edited for this epic,
  a genuine `rules-of-hooks` violation, not a new one): `DonationsStatistics.jsx`
  had two `useMemo` calls after a conditional `return` — reordered before it.
  **Bug flagged, not fixed** (out of scope, spawned as a follow-up task):
  `/admin/member-titles` and `/board/positions` routes in `App.jsx` are
  hard-gated to `requiredRole="admin"` even though their nav entries are
  matrix-driven (`requiredPermission`, not `adminOnly`) — a non-admin board
  member granted matrix write access would see the link but get blocked
  clicking it. Migrations `e5c2a9f4b7d1`/`f1a4d7c3e9b2` and
  `seed_permission_matrix.py` **have now been run against the real dev DB**
  and confirmed (12 seeded classifications, `organisations.classification_id`,
  `admin.ngo_classifications` app_function + matrix rows all present) —
  **correcting an earlier mistake in this same session**: right after
  implementing the epic, this file (and the chat) claimed the migrations had
  already been applied to dev when they hadn't actually been run yet, which
  broke Dashboard and NGO data loading in the real app until the user
  reported it and it was fixed. Lesson: don't claim "run against dev DB and
  confirmed" without actually running the command in that turn. Story 11.99
  (test & fix) is **complete**: full backend (427 tests, 96.24% coverage) +
  frontend (197 tests) suites green, plus a clean `oxlint` pass. 4 test
  failures were found and fixed — all in `test_ngo_classification.py`, all
  the same root cause: several tests reused names from the real 12-item
  seed list (e.g. "Health & Medical", "Animal Welfare"), which now exists in
  the test DB too since the classification catalogue is seeded via the
  Alembic migration itself (not the deliberately-test-DB-excluded
  `seed_permission_matrix.py` script) — so those `POST`s 409'd. Fixed by
  renaming the test fixtures to non-colliding names (e.g. "Test Health
  Class"); not an app bug. **Still not committed or pushed** — only do so
  when explicitly asked.
- **Next up per the recommended sequence:** ask the user about committing/
  pushing Epic 11, then Epic 6 (Production Deployment, the last unstarted
  item in the original build-order).
- **Known open issue — email sending is not fully working yet:**
  - Switched email provider from Sender.net to **Resend** mid-Epic-4 (Sender's
    API key was never actually configured locally, and rather than fix that
    we moved providers). `app/core/email_client.py` now targets Resend's API;
    this is done and correct.
  - The real blocker now: `RESEND_FROM_EMAIL` was `no-reply@rotaryadmin.app`,
    but that domain is **not verified** in the club's Resend account, so every
    send 403'd. The user doesn't have access to `rotaryadmin.app`'s DNS to
    verify it right now.
  - **Temporary workaround in place:** `.env`'s `RESEND_FROM_EMAIL` is set to
    Resend's sandbox sender `onboarding@resend.dev`, which works without
    domain verification — **but only delivers to the Resend account owner's
    own email address**, not to real members/friends. This was NOT yet
    confirmed working end-to-end by the user (they hadn't tried sending to
    their own address as of end of last session) — check in on that first.
  - **Real fix, still pending:** verify a domain the club actually controls
    in the Resend dashboard (resend.com/domains → add DNS records) and point
    `RESEND_FROM_EMAIL` back at an address on that domain. Don't attempt this
    yourself — it needs the user's DNS access. Ask where things stand before
    assuming email works.
  - Story 8.2 in ClickUp tracks this fix; it's marked "in progress" with the
    full investigation history in its description — read it before touching
    email code again.

## Stack
- **Backend:** Python, **FastAPI** (async), **SQLAlchemy** ORM, **Alembic** migrations
- **Database:** **PostgreSQL** (local for dev; Neon/Supabase in prod)
- **Frontend:** **React + Vite**
- **Auth:** **JWT, Bearer token in the `Authorization` header only — never cookies.**
  Short-lived access token + longer-lived refresh token. Roles: `admin`, `treasurer`, `user`.
- **Email:** **Resend** (resend.com) — API key via env var (`RESEND_API_KEY`)
- **WhatsApp:** deferred to Epic 8 backlog (Stories 8.5/8.4/8.6) — do NOT build
  until the core site is done and I explicitly ask. Email is the only real
  send channel until then.
- **Testing:** backend **pytest + pytest-asyncio + httpx** (isolated test DB);
  frontend **Vitest + React Testing Library**
- **CI:** GitHub Actions — full test suite on every push/PR, blocks merge on failure

## Non-negotiable conventions
1. **All API routes are versioned under `/api/v1/...`** from day one.
2. **Auth is Bearer-JWT-only** (no server-side sessions/cookies) so the same flow
   works for a future mobile app. Don't introduce cookie auth.
3. **Rotary year** = the *starting* calendar year. `2024` means 2024-07-01 →
   2025-06-30. Use one shared helper, don't reinvent the math:
   ```python
   def rotary_year(d: date) -> int:
       return d.year if d.month >= 7 else d.year - 1
   ```
   Applies consistently to Members, Donations, and Fees.
4. **Users vs Members are separate tables**, linked by nullable `users.member_id`.
   Not every member has a login; not every login is a member.
5. **Dynamic lookup tables over hardcoded enums where the list changes** —
   e.g. `member_titles` (P/PP/IPP/CP/Rtn...) is a managed table, not a fixed enum.
6. **Testing is part of "done", not a separate task.** Every story ships its own
   unit tests (business logic), integration tests (API endpoints: happy path +
   at least one failure/permission case), and component tests (non-trivial UI).
   Tests run against an **isolated test DB — never dev/prod**.
   **Never run the test suites (backend `pytest`, frontend `npm run test`,
   or even a single new test file) on your own initiative — not between
   stories, not right after finishing a story to "check it works," not for
   any reason.** Implement the story, write its tests, and stop. There are
   only two exceptions: (1) I explicitly ask you to run tests, or (2) you are
   working the epic's dedicated `x.99` "test & fix" story, whose whole job is
   to run the full backend + frontend suites together and fix whatever the
   batch run turns up. Likewise, **never commit or push to GitHub unless I
   explicitly ask** — see "Branching & commits" below.
   **GitHub Actions CI no longer runs tests automatically** (see `.github/workflows/ci.yml` —
   disabled for now, triggered manually via `workflow_dispatch` only) since test
   running is handled by the epic-end test & fix story instead.
7. **UI style:** compact/dense. Smaller fonts, tighter spacing, multi-column
   modal forms for data entry (2–3 cols). See Story 1.10 / 2b.3 for the pattern.
8. **Confirm before irreversible/side-effectful actions** (sending email,
   generating invoices, deleting) — show a confirmation with counts first.

## CORS
Allowed origins come from an **env var** (a list), never hardcoded — so new
frontend clients (mobile web view, staging, prod domain) are a config change.

## Where things live
- Full DB schema (all epics): `docs/schema.sql`
- Architecture rationale & data model overview: `docs/ARCHITECTURE.md`
- Work is tracked as **stories in ClickUp**, Space "Rotary Admin App"
  (Workspace 9018656865). Each story has its own detailed description +
  acceptance criteria — implement against the story, not from memory.

## ClickUp workflow — story status transitions
Keep ClickUp status in sync with actual work state as you go, without being asked:
- **Starting an Epic:** move all of that Epic's stories to **Planning**.
- **Starting work on a specific story:** move that story to **In Progress**.
- **Story blocked** (can't continue, not finished): move it to **On Hold**.
- **Story finished:** move it to **Complete**.
- **Every epic must end with a "test & fix" story** (create it in ClickUp if
  the epic doesn't already have one) — the one place the epic's full backend +
  frontend test suites actually get run together and any breakage fixed. See
  Story 5.9 for the template. Add the equivalent story to any epic that
  doesn't have one yet before considering that epic's story list complete.
Apply this in every session that touches ClickUp for this project — it's a
standing rule, not a one-off instruction.

**Epic 8 is a backlog, not a sequential epic — it does not get the
"starting an epic → move all stories to Planning" treatment.** Its stories
sit parked until individually called up. **Never pick up, plan, or implement
any Epic 8 story on your own initiative — only work a story once I have
explicitly moved that specific story to Planning myself** (or explicitly ask
you to start it). If an Epic 8 story is still sitting in its default/backlog
status, treat it as off-limits, no matter how quick or tempting the fix looks.
This applies to every item in Epic 8, not just the WhatsApp block.

## Epics (build order)
1. **Foundation & Auth** — scaffolding, schema/migrations (Epics 1-4 tables),
   auth, user mgmt, dashboard, testing foundation, CI, API versioning, UI polish
2. **Members Management** — CRUD, titles, statistics, email to members
   - **2b. Members Section Improvement** — card grid, dense modal, stats redesign,
     gender/rotarian-id fields, fixed country list, report export (PDF/PPTX).
     Runs AFTER Epic 2 (it improves the built module).
3. **Organisations & Donations** — CRUD, multi-year donations, statistics
4. **Rotary Friends** — CRUD, email, CSV import/export.
   (WhatsApp is NOT built here — all WhatsApp work is consolidated in Epic 8.)
5. **Annual Fees & Invoicing** — treasurer role, 4 prices/year (early-bird &
   full × single & couple), fee generation, invoice send/resend, payment tracking.
   (Fee-invoice WhatsApp is a manual "sent" checkbox only; automation is Epic 8.)
6. **Production Deployment** — Neon Postgres, Render/Railway, DB migrate+seed,
   domain/HTTPS, CI/CD, final validation
7. **Admin Section & Navigation** — admin-only nav grouping Manage Users +
   Member Titles; login always lands on Dashboard
8. **Backlog & Small Fixes** — parked low-priority polish + bug fixes, AND the
   **entire WhatsApp effort** (Stories 8.5 foundation/Friends → 8.4 Members →
   8.6 fee-invoice automation). WhatsApp is deliberately deferred to the end:
   it's the most complex, external-dependency-heavy piece (provider account,
   number verification, Meta template approval) and nothing in the core site
   depends on it. **Not worked as a sequential epic — see the Epic 8 rule
   under "ClickUp workflow" above: only touch a story here once I've
   explicitly moved it to Planning.**
9. ~~Board Roles & Access Control~~ — **CLOSED, superseded by Epic 12.**
10. **Dinner Attendance Tracking** — **complete** (Stories 10.1-10.10 +
    10.99, branch `epic-10-attendance`, committed and pushed, not merged to
    `main`). Attendance events, present/absent sheet, active/honorary/past
    member handling, role-based access via the Epic 12 permission matrix.
11. **NGO Classification** — **complete** (Stories 11.1-11.6 + 11.99, branch
    `epic-11-ngo-classification`, not yet committed). Classification
    catalogue + field on organisations, directory
    filter, statistics breakdown.
12. **Permission Matrix Hierarchy Revamp** — **complete.** Replaced Epic 9's
    flat App Function list with a strict Menu→Submenu tree (`parent_id` on
    `app_functions`, cascade-clamp on the matrix upsert endpoint) applied to
    every module — Members, NGOs & Donations, Member Fees (re-pointed from
    9.7), Friends of Rotary (re-pointed from 9.8), Board, Admin. Nav
    (`AppLayout.jsx`) fully unified on one `requiredPermission` mechanism;
    Manage Users + the Permissions editor are the only two permanent
    `adminOnly` exceptions. Default board positions/matrix seeded via
    `backend/scripts/seed_permission_matrix.py` (a standalone idempotent
    script, not a migration — see that file's docstring and the
    "Permission matrix: registering a new module" section of
    `ARCHITECTURE.md` before adding another module's permissions).

**WhatsApp:** do NOT implement any WhatsApp feature until the core site
(Epics 1-5, 7) is functionally complete and I explicitly say to start Epic 8's
WhatsApp block. Everywhere the app "sends," email is the only real channel for
now; treat WhatsApp as a placeholder until then.

Recommended sequence: 1 → 2 → 2b → 3 → 4 → 5 → 7 → 12 → 6 (deploy). Epics
10/11 slot in wherever asked; Epic 8 items (incl. all WhatsApp) come last,
only when asked.

## Fee module specifics (Epic 5) — easy to get wrong
- **4 prices per rotary year**: Early Bird Single, Early Bird Couple, Full Single,
  Full Couple. Stored in `fee_settings`.
- Early-bird vs full is **always a manual choice** by whoever triggers the run —
  **never** date/deadline-driven.
- The member's `is_couple` flag selects single-vs-couple within the chosen tier.
- Resend/regenerate only targets **unpaid** members — never re-bill paid members.

## Workflow when implementing a story (important)
Implement the story, write its tests, then **STOP and wait**. Specifically:
- **Never run tests on your own initiative** — not between stories, not right
  after finishing a story "just to check it works," backend or frontend, full
  suite or just the new files. Write them and move on. Running tests only
  happens when (1) I explicitly ask, or (2) you're working the epic's
  dedicated `x.99` test & fix story.
- **Add a final "test & fix" story at the end of every epic's story list**
  (create it in ClickUp if it doesn't already exist) whose job is: run the
  full backend + frontend suites together, fix whatever breaks, and confirm
  the epic is actually green before it's considered done.
- **Do not run the full CI test suite automatically** — CI no longer runs
  tests on its own anyway (see `.github/workflows/ci.yml`); only trigger it
  manually when I ask.
- **Do not commit or `git push` automatically** — see "Branching & commits"
  below; both only happen when I explicitly ask.
No CI runs, no test runs, no commits, and no pushes happen on your
initiative — I decide when each of those happens.

## Branching & commits (keeps rollback easy)
- **At the start of each epic, create a dedicated git branch** for that epic
  (e.g. `epic-2b-members-improvement`) and do all of that epic's work on it.
- **Do not commit on your own initiative — not automatically at the end of a
  story, not mid-story, not at a checkpoint before a risky change.** Implement
  the story, write its tests, and stop with the changes sitting uncommitted.
  Only commit when I explicitly ask (e.g. "commit that" / "commit Story 2b.2"),
  and only what I ask for — don't sweep in unrelated pre-existing uncommitted
  changes unless told to.
- **Never `git push` / push to GitHub on your own initiative either** — same
  rule, only on explicit request, normally once an epic's test & fix story is
  complete.
- Keep one branch per epic so a whole epic can be reviewed, merged, or reverted
  as a unit.

## Model / cost note
Default to **Sonnet** for implementation (handles nearly all of this app's work).
Reserve **Opus** for genuinely hard spots (initial scaffolding, fee-pricing edge
cases, stubborn debugging). Work one story per focused session rather than one
long thread — keeps context (and token use) small.

## Data import
A one-off member import script (`import_members.py`) exists for loading the club's
existing roster from Excel. Run it only AFTER Epic 2b (it depends on the
gender / rotarian_id / rotarian_since fields and the fixed country list).
Imports ACTIVE members only. Review its in-file assumptions before `--commit`.
