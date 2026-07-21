# CLAUDE.md — Rotary Club of Discovery Bay Admin App

Standing context for Claude Code. Read this first every session. The **code in
this repo is the source of truth**; this file is orientation, not a spec.

## What this is
Internal admin web app for the Rotary Club of Discovery Bay. Manages members,
NGOs/organisations & donations, "Rotary Friends" contacts, and annual membership
fees/invoicing. Small user base (club admins + treasurer), low traffic.

## Current status / resume from here (2026-07-15)
- **WhatsApp integration deferred, placeholder UI removed (2026-07-15).**
  User asked to pick up Epic 8's WhatsApp block (Stories 8.4/8.5/8.6). Story
  8.5 requires an actual provider decision (Twilio vs Meta WhatsApp Business
  API) — a real paid external service needing business verification, not
  something to pick unilaterally. Asked the user; Twilio isn't free (no free
  production tier, only a Sandbox with no real-recipient messaging) and needs
  Meta business verification either way — user chose to hold off entirely and
  **removed the fake "manual mark sent via WhatsApp" placeholders** that
  existed before any real integration:
  - `MemberApplication.whatsapp_sent_at` column dropped (migration
    `9a35449ad456`), `/member-applications/{id}/send` no longer takes a
    `channel` — always sends email now. The "Sent via WhatsApp" checkbox in
    the New Member Application modal is gone.
  - `FeeInvoiceSendRequest`/`FeeInvoiceSendResult.channel` removed —
    `POST /fee-runs/{year}/send` always sends email. Fee Run's "Sent via
    WhatsApp" checkbox/column and `MemberFeeUpdate.last_channel`'s
    `"whatsapp"` option are gone (Fee Tracking's Channel select is now
    Mail/Manual only).
  - **Deliberately NOT touched**: the Postgres `fee_channel` enum still has
    `'whatsapp'` as an allowed value (removing an enum value needs the
    harder rename→create→cast→drop migration pattern — not worth the risk
    for an already-inert value; any historical rows with
    `last_channel='whatsapp'` just can't be set that way again via the API).
    The **Rotary Friends `whatsapp` contact field is untouched** — it's a
    real phone-number data column, not a send feature, and the user
    explicitly said to keep it.
  - Stories 8.4/8.5/8.6 stay in ClickUp as backlog/on-hold — revisit once
    there's budget/appetite confirmed for a real provider.

## Previous status (2026-07-14)
- **Everything below marked "not committed/pushed" or "migrations not run
  against dev" has since been resolved, explicitly requested by the user
  2026-07-14**: all outstanding work (remaining Epic 8 backlog items 8.3/
  8.13/8.23/8.28/8.29/8.31, all of Epic 15, and Epic 14 Story 14.1) was
  committed in 4 grouped commits, `main` was fast-forwarded to include
  everything already-committed-but-unmerged too (Epics 5, 7, 9, 10, 11, 12),
  and pushed to `origin/main`. CI was **not** triggered (it's
  `workflow_dispatch`-only, doesn't run automatically). The dev DB was also
  brought fully up to migration head that same session (see the Epic 15
  entry below for the dinner-forecast-upload bug that prompted it). The
  historical entries below still describe what was true *at the time they
  were written* — read them for design/deviation context, not current
  commit state.
- **Epics 1, 2, 2b, 3, 4, 5, 7 are complete.** Epic 8 items are worked
  piecemeal from the backlog as requested (several already done — see
  ClickUp for current state, not this file).
- **Epic 8 Story 8.3 done this session** (new-member application PDF +
  send), **scoped down with the user first**: only `honorific`,
  `company_name`, `position`, `proposer_name` were added — `spouse_name`/
  `spouse_phone` were explicitly dropped from both the schema and the
  generated PDF. New `honorifics` lookup table (migration `d3f8b2a7c1e9`,
  mirrors `member_titles` exactly, admin-role-only tier — new "Honorifics"
  admin tab) with a Gender→Honorific **convenience default only** (Male/
  Female pre-fills Mr./Ms. the first time, never overrides an explicit
  choice, Dr./Prof./Miss/Mrs. stay freely selectable). "New Member
  Application" button on Members Directory generates a fillable AcroForm
  PDF (`app/core/member_application_pdf.py`, `reportlab`'s low-level
  Canvas/`acroForm` API — new territory, `statistics_report.py`'s platypus
  flowables don't support form fields) pre-filled with Name/Email/Phone,
  page 2 has the 3 club rules **reconstructed from the story's own summary**
  (the actual source docx wasn't available — flag if wording needs to match
  it exactly). Email send reuses the existing Resend attachment mechanism;
  **WhatsApp send is a manual "mark sent" checkbox only** (no real API —
  matches the existing fee-invoice `last_channel="whatsapp"` convention,
  since WhatsApp integration itself is still deferred to Epic 8's WhatsApp
  block). Verified live against the real dev DB (migration + reseed run
  with the user's go-ahead): Honorifics admin CRUD, the member form's new
  fields, the Gender-default behavior, and the full application generate→
  download→email/WhatsApp-mark flow (confirmed via `strings` that the
  AcroForm fields actually contain the prefilled values). Test artifacts
  cleaned up afterward. New backend + frontend tests added, not run (per
  the rule below). **Still not committed or pushed.**
- **Epic 8 Story 8.23 done this session** (PPT annual template support),
  **scoped to Members Statistics only** — 8.23 depends on Story 8.13
  (Simplified/Integral choice), which hadn't been started, and 8.13 itself
  only fully makes sense once NGO/Friends/Fees statistics pages get real
  PDF/PPT generation (Story 8.32 — still placeholders there). Agreed this
  narrower scope with the user rather than pulling in 8.13+8.32 wholesale.
  New Admin → PPT Template tab (`admin.ppt_template` app_function, same
  write tier as NGO Classifications — Secretary/President/President Elect;
  migration `c9e1a4f7d3b8`) lets those roles upload/replace/delete a
  `.pptx`, one per rotary year, stored at
  `uploads/ppt-templates/{year}.pptx` (deterministic filename, Replace
  overwrites in place). Members Statistics' Generate Report row gained a
  Simplified/Integral content selector and a "Use annual club template"
  checkbox (disabled with a tooltip when no template exists or format is
  PDF; template doesn't apply to PDF). Integral adds a detail section of
  tables restating each of the 6 charts' underlying figures — **8.13 wasn't
  originally scoped for Members**, so this is this story's own
  interpretation of "detail section" for that page, reusing existing data
  (no new queries). Template injection opens the uploaded `.pptx` via
  `Presentation(template_path)` and scales the from-scratch layout by the
  ratio of the template's actual slide width to the app's 13.333in design
  width, so content fits regardless of the uploaded template's own
  dimensions. Verified live against the real dev DB: uploaded a real
  `.pptx`, confirmed the read-path, then hit all 6 format×content×template
  combinations directly — all 200 OK with correct PPTX slide counts (1
  Simplified, 7 Integral, same with/without template). Migration +
  `seed_permission_matrix.py` **have been run against the real dev DB**
  (with the user's explicit go-ahead) — confirmed. Test artifact from the
  live-verification upload was deleted afterward. New backend + frontend
  tests added, not run (per the testing rule below). **Still not committed
  or pushed** — only do so when explicitly asked.
- **Epic 8 Stories 8.28, 8.29, 8.31 done this session** (branch
  `epic-11-ngo-classification` — not yet moved to its own branch; still
  uncommitted). 8.28: Fees module header-row label/selector alignment fixed
  via a new `.fee-controls-row` class (scoped to Fees only, doesn't touch
  the shared `.email-controls-row` used by Members/Friends/Attendance).
  Fee Settings' "Add a year" control moved into that same row alongside the
  Rotary year selector, with a default-prefilled next year and a live
  `→ 2027–2028` range preview next to the input. 8.29: Fee Tracking's
  Amount Paid now accepts 0 (fee-exempt members); added inline-editable
  **Invoice Sent** checkbox and **Channel** (Mail/WhatsApp/Manual) select to
  the tracking row — selecting Manual auto-checks Invoice Sent. **Member
  scoping fixed**: Fee Run + Fee Tracking previously built their member list
  from `Member.status=="active"` (today's status) regardless of which
  rotary year was selected — now both use a new `active_in_rotary_year`
  query param on `GET /members` (join_date/leave_date based, migration-free,
  just a new filter), so past years correctly include members who've since
  left and exclude members who joined later. This was also why past years
  looked broken for fee run/tracking — same bug, not a separate access
  restriction. Honorary exclusion (already correct in fee run generation
  since 8.14) is now also applied in Fee Tracking's member fetch.
  **Deliberate deviation, flagged in ClickUp**: the channel enum stayed
  `email`/`whatsapp`/`manual` in the DB (not renamed to `mail` per the
  story's literal wording) to avoid breaking the existing Fee Run send-invoice
  flow which already uses `email` — UI labels still show "Mail". Migration
  `b4d7e1f9a3c6` (adds `'manual'` to the `fee_channel` Postgres enum) **has
  been run against the real dev DB** (confirmed via a live PATCH selecting
  Manual and it persisting). 8.31: Fees Statistics revamped — old
  price-tier bar chart removed; added an Average Fee card
  (`total_collected / active non-honorary member count`, same date-scoping
  as 8.29) and two new full-history charts (Amount Collected, Paying
  Members split Paid/Zero) via a new `GET /member-fees/statistics/history`
  endpoint, independent of the page's year selector. All three backend +
  frontend changes verified live against the real dev DB/app; new backend
  tests added but **not run** (per the testing rule below — only the
  epic's `x.99` story runs the full suite). **Still not committed or
  pushed** — only do so when explicitly asked.
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
- **Epic 15 (Dinner Forecast & Event Planning) is implemented** (Stories
  15.1-15.3, branch `epic-15-dinner-forecast`, branched off
  `epic-11-ngo-classification`). **Two deliberate deviations from the
  literal ClickUp spec, agreed with the user first, each flagged as a
  ClickUp comment on its story:** (1) 15.3's spec assumed attendance used a
  free-text event name and asked for a new `dinner_event_id` FK — wrong,
  Epic 10 already links `AttendanceRecord.event_id` to a structured
  `AttendanceEvent`. The user confirmed "dinner forecast event" and
  "attendance event" are the same concept, so **no new table/FK was
  added** — `AttendanceEvent` gained the new planning fields instead
  (`location`, `speaker_name`, `ngo_organisation_id` FK → organisations
  `ON DELETE SET NULL`, `topics_description`, `deleted_at` soft-delete).
  Creating an event via the new Dinner Forecast page does **not** seed
  attendance records (unlike the old direct-create flow); a new
  `POST /attendance/events/{id}/start` does that instead, called from the
  Attendance page's "New Event" button, now a picker
  (`AttendanceStartEventModal`) over unstarted Dinner Forecast events
  instead of a free-form create form. The old `POST /attendance/events`
  create endpoint and its edit modal (`AttendanceEventFormModal`, still
  used by the Sheet page's own "Edit" action) were left untouched — no
  existing behavior/tests broken. (2) 15.2's PDF header wants both a Rotary
  International logo and the Club logo side-by-side — only the club logo
  (`backend/app/assets/rotary-logo.png`) exists anywhere in this repo. The
  report code (`app/core/dinner_forecast_report.py`) renders both if
  present (`INTL_LOGO_PATH` → `backend/app/assets/rotary-international-
  logo.png`) and silently renders just the club logo otherwise — user said
  they can supply the second file later, drop it at that path and it
  appears with no code change. Also per explicit user answer (not a spec
  deviation): all "searchable dropdown" ACs (NGO/event pickers) built as
  plain native `<select>`, matching this app's existing convention (no
  combobox component exists anywhere). New `attendance.forecast`
  permission key added under the existing "Dinner" menu (same board tier
  as `attendance.sheet`/`attendance.history`: read for everyone, write for
  President/President Elect/Secretary) — migrations `a7c2e5f1b9d4`
  (fields) and `b9f4d7a2c6e1` (app_function), plus the matching
  `seed_permission_matrix.py` entry. New backend + frontend tests added,
  **not run** (per the testing rule below — Story 15.99 was created in
  ClickUp as the epic's test & fix story and is the one place that
  happens). **Migrations not run against the dev DB yet. Not committed or
  pushed** — only do so when explicitly asked.
- **Next up per the recommended sequence:** work Story 15.99 (test & fix)
  when asked, then ask the user about committing/pushing Epics 11/15, then
  Epic 6 (Production Deployment, the last unstarted item in the original
  build-order).
- **Epic 14 (Event Management) started — Story 14.1 only** (branch
  `epic-14-event-management`, branched off `epic-15-dinner-forecast`). This
  is a large 13-story epic (gala/fundraiser event management: guests,
  tables, auction/lucky draw items, costs, sponsors, run-down, summary
  reports); explicitly told to do Story 14.1 (data model) and stop, one
  story per session going forward due to its size. 11 new tables (`events`,
  `event_setup`, `event_table_mapping`, `event_guests`, `event_items`,
  `event_lucky_draw_config`, `event_costs`, `event_sponsors`,
  `event_rundown`, `event_cost_categories`, `event_sponsor_categories`),
  migration `d8e4a1c6f3b9`. Several deliberate deviations from the literal
  spec flagged as a ClickUp comment on 14.1 (rotary_year as Integer not a
  "YYYY-YYYY" string, oc_chair_member_id nullable, event_guests.table_number
  is a plain int not a formal composite FK — a composite FK with
  ON DELETE SET NULL would've nulled event_id too, event_rundown.time is a
  string not a Time column, category columns on costs/sponsors are plain
  strings not FKs, lot_ref auto-generation deferred to Story 14.6, default
  cost/sponsor categories are unspecified-by-the-story placeholders to
  review, total_cost computed application-side not via DB trigger).
  Migration validated by running upgrade → downgrade → upgrade against the
  isolated `rotary_admin_test` DB (not the dev DB) — round-trips cleanly.
  **Not run against the dev DB, not committed/pushed.** Stories 14.2-14.12 +
  14.99 (API/UI/reports/permissions/test&fix) are all still to do — each is
  its own session given the size.
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
   **Default: never run the full backend/frontend test suites on your own
   initiative** — not between stories, not right after finishing a story to
   "check it works," not for any reason, unless (1) I explicitly ask, or
   (2) you are working the epic's dedicated `x.99` "test & fix" story, whose
   whole job is to run the full backend + frontend suites together and fix
   whatever the batch run turns up.
   **When I ask you to work through several stories in one batch** (e.g.
   "implement 14.6 to 14.11"), the default narrows rather than disappears:
   run only the **new test file(s) for the story you just finished** before
   moving to the next one (fast, scoped, catches obvious breakage early) —
   do **not** run the full backend/frontend suites between stories in that
   batch. Run the full suites once at the end of the batch/epic, same as the
   `x.99` story would. If I ask you to run the full suite after every story
   in a given session, that's a one-off override for that session only —
   revert to this default afterward unless told otherwise.
   **This restraint is about test suites only, not database scripts.**
   Migrations (`alembic upgrade head`) and idempotent seed scripts (e.g.
   `scripts/seed_permission_matrix.py`) for the epic/story currently being
   worked should be run against the **dev** database proactively, as soon as
   they're written, without waiting to be asked — a story isn't actually
   usable in dev until its migration + seed have been applied there (e.g.
   Story 14.12's nav entry was invisible until the dev DB was migrated and
   reseeded). Still never run these against prod without being asked, and
   still never run migrations/seeds against the **test** DB manually (the
   test suite's own fixtures handle that in isolation).
   Likewise, **never commit or push to GitHub unless I explicitly ask** —
   see "Branching & commits" below.
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

## Member email specifics — easy to get wrong
- `/members/email` (`MembersEmail.jsx`) only ever targets **active** members —
  past members are excluded entirely, not just filtered by default. The
  member list is fetched with `listMembers({ status: "active" })`, and the
  recipient picker has no All/Active/Past quick filter (removed — there's
  nothing left to filter by, since past members are never in the list).
- "Select all" on that page therefore always means "select all active
  members with an email on file" — there's no separate "select all
  regardless of status" concept.
- Friends of Rotary email (`RotaryFriendsEmail.jsx`) is unaffected by this —
  it has no member status concept; its quick filters are still tag-based.

## Workflow when implementing a story (important)
Implement the story, write its tests, then **STOP and wait**. Specifically:
- **Only run the tests for the story/change you just made** — the specific
  new/touched test file(s), backend or frontend. That's it, then move on.
- **Never run the full backend or frontend suite on your own initiative** —
  not between stories, not "just to check nothing else broke." Full-suite
  runs only happen when (1) I explicitly ask, or (2) you're working the
  epic's dedicated `x.99` test & fix story.
- **Add a final "test & fix" story at the end of every epic's story list**
  (create it in ClickUp if it doesn't already exist) whose job is: run the
  full backend + frontend suites together, fix whatever breaks, and confirm
  the epic is actually green before it's considered done.
- **Do not run the full CI test suite automatically** — CI no longer runs
  tests on its own anyway (see `.github/workflows/ci.yml`); only trigger it
  manually when I ask.
- **Do not commit or `git push` automatically** — see "Branching & commits"
  below; both only happen when I explicitly ask.
No CI runs, no full-suite test runs, no commits, and no pushes happen on
your initiative — I decide when each of those happens. Scoped tests for the
story you're currently on are the one exception.

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
