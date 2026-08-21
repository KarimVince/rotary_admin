# CLAUDE.md — Rotary Club of Discovery Bay Admin App

Standing context for Claude Code. Read this first every session. The **code in
this repo is the source of truth**; this file is orientation, not a spec.

## What this is
Internal admin web app for the Rotary Club of Discovery Bay. Manages members,
NGOs/organisations & donations, "Rotary Friends" contacts, and annual membership
fees/invoicing. Small user base (club admins + treasurer), low traffic.

## Current status / resume from here (2026-08-20)
- **Story 16.33's PDF redesigned around a real reference template** (not
  yet committed — this happened after `73efea7`). Karim supplied the
  club's actual paper attendance sheet
  (`Attendance - 2026 Aug 18.pdf`, real member names + the club's FPS
  payment ID — **deliberately never committed to git**, gitignored via
  `/doc/Attendance*.pdf` and deleted from `doc/` once the layout was
  confirmed) and asked for the table to match it, fit on one page.
  `backend/app/core/attendance_sheet_report.py` rewritten:
  - **Flat, alphabetically-sorted, continuously-numbered roster** (active
    + honorary merged via a new `_combined_roster()` helper — no more
    separate section headers) with row-number / Last Name / First Name /
    two blank checkbox columns. Karim's exact call on the column count:
    *"have two check box, but use the template format"* — the real
    template shows only one combined checkmark column, but this app keeps
    both Attendance and Payment (matching the original story), just
    restyled to the template's plain-black-grid look instead of the
    app's usual soft blue-grey report style.
  - Static `PAYMENT:  CASH  ou  FPS ID: 108236613` note line under the
    title block — confirmed fixed text always, not sourced from
    event/fee data or a new admin setting.
  - Blank "Visiting Rotarians" (NAME/CLUB, 4 rows) and "Guests"
    (NAME/ROTARIAN, 5 rows) tables below the roster, matching the
    template — no data source for either, always empty.
  - **Verified one-page fit by actually rendering it**: generated a
    sample with the reference template's real 18-person roster,
    confirmed via the PDF's own `/Count` value it was 2 pages on the
    first pass, tightened padding/spacers/margins
    (`PAGE_MARGIN` 0.5in→0.4in, table cell padding 4-5pt→3pt, spacers
    0.2in→0.14in) until it rendered as 1 page with visible margin to
    spare — don't trust "should fit" math alone for this, re-render and
    check `/Count` (or view it) after any future spacing change here.
  - New unit tests for `_combined_roster()`'s merge+sort (including a
    case-insensitivity check) added to `test_attendance_sheet_report.py`;
    existing 23 scoped tests (unit + `test_attendance.py`) still green.
  - **Not committed/pushed yet** — ask before assuming this shipped.
- **Epic 16 Stories 16.33 and 16.34 implemented** (committed + pushed to
  `main`, commit `73efea7`). Answers to each story's own Open Questions,
  confirmed with Karim before dev:
  - **16.33 (Attendance/Payment PDF)**: attendee names pre-populate from
    the event's existing eligible roster (active + honorary — reuses
    `_build_sheet_response`, no duplicate query); the Attendance and
    Payment columns are **always blank**, never pre-filled from existing
    fee records, even when available (manual on-site marking only); single
    layout for every event type. New "Generate Attendance Sheet" button on
    the Attendance Sheet detail page (`/dinners/:eventId`), visible to
    Read-only users too. New `backend/app/core/attendance_sheet_report.py`
    (reportlab platypus, same header/logo pattern as
    `dinner_forecast_report.py`) + `GET /attendance/events/{id}/
    attendance-sheet-pdf`.
  - **16.34 (Login Audit Log)**: successful logins only (not failed
    attempts — a separate security-alerting concern); IP address captured,
    not device/user-agent; indefinite retention, no auto-purge (matches
    this app's existing convention — no data-retention automation exists
    anywhere else either); all three of the story's own suggested stats
    implemented (logins-over-time trend, most-active-users, last-login-
    per-user). New `connection_logs` table (migration `ec721acfb227`, **run
    against dev DB + re-seeded**), written from `POST /auth/login`. New
    `app/api/deps.py::get_client_ip()` — **this app had no reverse-proxy
    header handling anywhere before this** (Render's edge proxies straight
    to the container, no nginx/gunicorn in front), reads `X-Forwarded-For`
    first, falls back to `request.client.host` for local/dev. New Admin
    page `/admin/connection-log` gated by a new `admin.connection_log`
    permission-matrix key (same board tier as the rest of Admin — sensitive
    account-activity data). Charts use the app's existing `recharts`
    convention. **Deliberate choice**: the user-filter dropdown is built
    from the stats endpoint's own `last_login` list rather than calling the
    admin-role-only `GET /users`, since a Secretary/board member with
    matrix write here isn't necessarily `role="admin"` and would 403 on
    that endpoint.
  - Tests: 3 new + 3 unit (16.33), 6 new backend + 4 new frontend (16.34),
    plus 2 new AttendanceSheet.test.jsx cases. Full suites green — backend
    835/835 (96.4% coverage), frontend 459/459.
- **Epic 16 Story 16.32 second follow-up round** (same session): more
  spacing above the banner, a proper "Important Information" section
  header matching "Club overview"'s style, and more breathing room between
  title/text inside the box.
  - **Near-miss, caught before it shipped**: `SectionLabel.jsx` silently
    ignores its `className` prop — every caller across the app has been
    passing `mt-6` etc. that never applied. First instinct was to "fix"
    that so the new header's spacing would work, but `theme-minimal.css`
    has an explicit, already-verified comment right next to `.seclabel`
    explaining this is deliberate: `.seclabel`'s own `margin: 38px 0 15px`
    is the real spacing, and a paired `.seclabel + * { margin-top: 0
    !important }` rule compensates for the (inert) className elsewhere.
    Applying className there would have doubled every section gap
    app-wide. Reverted before running anything, left a comment on
    `SectionLabel.jsx` itself so this doesn't get "fixed" again. The actual
    ask — visible space above the banner, "same way as Club overview" — is
    already satisfied for free by giving Important Information its own
    `<SectionLabel className="mt-6">` (same dead-but-conventional prop as
    every other section here), since `.seclabel`'s own margin is what
    produces the gap, not the className.
  - `SectionLabel` is now nested **inside** the `importantInfo &&`
    conditional (not a separate always-rendered header) — so the header and
    banner still disappear together when there's no active message,
    preserving that AC.
  - Title/text spacing inside the box bumped from `pb-2`/`mt-2` to
    `pb-3`/`mt-3` (Dashboard banner only — the Admin page's own
    active-message/history boxes weren't touched this round, not asked for).
  - No test changes needed — existing banner/ordering tests still cover
    this; ran the full `Dashboard.test.jsx` (20 tests) to confirm nothing
    broke.
- **Epic 16 Story 16.32 first follow-up round, same session** (all
  explicitly requested by Karim after initial implementation):
  - **Manual deactivate**: new `POST /important-information/{id}/deactivate`
    (write-gated) archives the active message without replacing it — the
    Dashboard banner then just disappears until a new message is created or
    an archived one reactivated. New "Deactivate" button on the Admin
    page's active-message card.
  - **Real bug found via the DB-level guard while adding this**: the
    reactivate endpoint (and, defensively, create) could transiently stage
    two rows with `status='active'` in the same flush batch — Postgres
    checks the partial unique index immediately, not deferred, so this
    intermittently 500'd depending on statement-batching order. Fixed by
    calling `db.flush()` right after archiving the current active row,
    before activating the new one, in both endpoints — forces the archive
    UPDATE to land before the activate UPDATE/INSERT. Confirmed with 5
    repeated scoped test runs, not just one green run.
  - **Visual**: a thin divider line now separates title from text
    everywhere title+text are shown together (Dashboard banner, Admin
    page's active-message card, and history list rows) — a `border-b`
    under the title rather than a literal `<hr>`.
  - **Dashboard placement**: banner moved from "between Club Overview and
    Club Planning" to **above Club Overview** (first section on the page,
    right under the welcome header), with its own `mb-6` so there's clear
    space before Club Overview starts.
  - Tests: 3 new backend tests (deactivate happy path, already-archived
    400, non-write 403 — 13 total now) and 2 new frontend tests (deactivate
    button, banner-before-Club-overview ordering) added; all green.
- **Epic 16 Story 16.32 implemented** (Dashboard "Important Information"
  banner). Answers to the story's own Open Questions, confirmed with Karim
  before dev: **character caps** — Title 150, Text 2000 (enforced both
  client-side `maxLength` and server-side Pydantic `Field`); **plain text
  only** (no rich-text editor — matches every other free-text field in this
  app, e.g. Story 16.29's Minutes); **archiving is always manual**, no
  expiry-date field.
  - New `important_information_messages` table + `admin.important_information`
    app_function in one migration (`7c71ddab138e`, **run against dev DB,
    confirmed**), same write tier as NGO Classifications/PPT Template/Dinner
    Event Types (President/President Elect/Secretary write, everyone else
    no_access) — `seed_permission_matrix.py` updated and re-seeded.
    "Only one active message at a time" is enforced **both**
    application-side (creating/reactivating a message archives whatever was
    active) **and** at the DB level via a partial unique index on
    `status='active'` — belt-and-suspenders against a race, since no
    existing model in this repo had this "single active + archive history"
    shape to copy.
  - New `app/api/important_information.py`: `GET /important-information/active`
    is deliberately gated on just being logged in (`get_current_user`, no
    permission-matrix check) — every user who sees the Dashboard should see
    the banner; the matrix key only gates the management endpoints
    (list/create/reactivate/delete, all `require_access(..., "write")`,
    since the story's AC is explicit that only Write users can even reach
    the admin page — no separate read-only view exists for this feature).
    The active message can't be deleted directly (400) — it has to be
    replaced or reactivated-over first.
  - Frontend: `Dashboard.jsx` fetches the active message unconditionally
    (like the board strip's non-fatal fetches) and renders it as a
    self-contained amber warning banner (`--tone-amber-bg`/
    `--color-tone-amber-text`, same tokens as `AttendanceSheet.jsx`'s
    "hasn't taken place yet" notice) with **no separate `SectionLabel`
    header** — the AC requires the whole section including any header to
    disappear when there's no active message, so pairing a banner with an
    independently-conditioned header would risk exactly that bug. New
    `AdminImportantInformation.jsx` (`/admin/important-information`, new
    Admin nav entry) — active-message display, a create form that always
    archives the prior active message, and a history list with
    Reactivate/Delete per archived row.
  - Tests: new backend `test_important_information.py` (10 tests) and
    frontend `AdminImportantInformation.test.jsx` (7 tests), plus 3 new
    banner-specific cases added to the existing `Dashboard.test.jsx` (now
    19 tests, all still green — had to add a default "no active message"
    MSW handler to that file's `beforeEach` so the pre-existing tests,
    which don't know about the banner, keep passing). Scoped runs only.
  - **Not committed or pushed** — only do so when explicitly asked.
  - **ClickUp note**: the task tool's write API was rate-limited
    (~10 hours) right after this was finished — the story (86eynvpxx) is
    still sitting in "planning" in ClickUp, not moved to Complete yet.
    Move it manually or ask next session to retry.
- **Epic 16 Story 16.30 implemented** (self-service "Forgot password?" on
  the login page + an account settings popover in the top nav for
  self-service email/password changes). Flagged deviation + answers to the
  story's own Open Questions, confirmed with Karim before dev: **email
  provider is Resend, not Sender.net** (the story text is stale — this app
  switched mid-Epic-4, see the "Known open issue — email sending" entry
  below); **email change requires re-verification** via a confirmation link
  to the new address before it takes effect; **both a password change and
  an email change notify the OLD/previous email address**; **password
  complexity is 8-characters-minimum only** (matches the existing
  `UserCreate`/`PasswordResetConfirm` rule already in the codebase).
  - New `POST /auth/forgot-password` (public, always returns the same
    generic response regardless of whether the account exists —
    anti-enumeration, per the story's own AC). Reuses the
    `AuthToken(purpose="password_reset")` + `POST /auth/reset-password`
    confirm flow that **already existed** from the pre-existing
    admin-triggered "reset a user's password" feature (`app/api/users.py`)
    — no new token infra needed for the reset half.
  - The shared `/auth/reset-password` confirm endpoint now also sends a
    best-effort "your password was changed" notice — applies to both this
    new self-service flow and the admin-triggered one, since both land on
    the same confirm step.
  - New `app/api/account.py` (self-service, gated only on being logged in
    via `get_current_user` — deliberately **not** permission-matrix gated,
    since every user manages their own account regardless of module-level
    access): `PUT /account/password` (current-password-confirmed,
    invalidates other sessions' refresh tokens) and
    `POST /account/email/request` / `POST /account/email/confirm`. Email
    change uses a new nullable `payload` column added to the existing
    `auth_tokens` table (migration `43027c80c200`, **run against dev DB,
    confirmed**) to carry the pending new email until the confirmation link
    is clicked — the account's `email` column isn't touched until then.
  - Frontend: "Forgot password?" link on `Login.jsx` → new
    `ForgotPassword.jsx` (`/forgot-password`); new `ConfirmEmailChange.jsx`
    (`/confirm-email`) — deliberately requires a manual button click rather
    than auto-confirming on page load, since email-client link-prefetching
    could otherwise silently burn the single-use token before the user
    clicks it; new `AccountSettingsPopover.jsx` opened by clicking the
    existing avatar/name pill in `AppLayout.jsx`'s top nav (Email tab +
    Password tab, click-outside-to-close pattern copied from
    `SingleSelectDropdown.jsx` since no shared Popover primitive existed
    yet) — scoped strictly to `users` table login fields, no member-profile
    fields shown, per the story's explicit scope note.
  - Tests: backend `test_auth.py` (+7 tests) and new `test_account.py` (13
    tests), 30/30 passing. Frontend: new `ForgotPassword.test.jsx`,
    `ConfirmEmailChange.test.jsx`, `AccountSettingsPopover.test.jsx` (13
    tests); existing `Login.test.jsx`/`AppLayout.test.jsx`/
    `ResetPasswordConfirm.test.jsx` re-verified green (25 tests) — nothing
    broke. Scoped runs only.
  - **Not committed or pushed** — only do so when explicitly asked.
- **Epic 16 Story 16.29 implemented** (Dinner/Event Minutes: pasted text or
  an uploaded Word/PDF file against an `AttendanceEvent`, role-gated edit
  access). Confirmed with Karim before building: "Dinner/Event" here means
  `AttendanceEvent` (Epics 10/15/16 — Dinner Forecast/Attendance), **not**
  the separate Epic 14 `events` gala-management table — this Epic-16 story
  sequence lives entirely on the Attendance side. Answers to the story's own
  flagged Open Questions: **multiple minutes records per event allowed**
  (not a single 1:1 text-or-file record), **5MB file size limit**,
  **members-only visibility** (no Friends of Rotary access).
  - New `EventMinutes` model/table (`event_minutes`), FK to
    `attendance_events.id` (`ON DELETE CASCADE`), `minutes_type` Postgres
    enum (`text`/`file`, same convention as `EventGuest.payment_status`),
    audit fields (`created_by`/`created_at`, `last_updated_by`/
    `last_updated_at`). Migrations `fd6db30982d2` (table) and
    `90ae9a657259` (new `attendance.minutes` app_function) — **both run
    against dev DB, confirmed present**.
  - New permission-matrix key `attendance.minutes`, same board tier as the
    rest of the Dinner module (President/President Elect/Secretary write,
    everyone else read) — `seed_permission_matrix.py` updated and **re-run
    against dev DB, confirmed**.
  - File uploads reuse the Story 16.6 Supabase Storage pattern via a new
    **private** bucket, `EVENT_MINUTES_BUCKET` = `"event-minutes"` (needs
    creating in the Supabase dashboard, same manual step as the other two
    buckets — not yet done, since minutes are members-only and must go
    through an authenticated download endpoint rather than a public URL
    like member photos/NGO logos).
  - New `app/api/event_minutes.py`: list, create text, edit text, upload
    file, replace file, download file, delete — all under
    `/attendance/events/{event_id}/minutes...`, gated by
    `require_access("attendance.minutes", ...)`.
  - Frontend: new `EventMinutesSection.jsx`, self-gates on its own
    `useAccess("attendance.minutes")` call (hides entirely for No Access
    regardless of the parent page's own access level), embedded on
    `AttendanceSheet.jsx` (`/dinners/:eventId` — the real per-event detail
    page, not the `DinnerEvents.jsx` list page). Paste Text / Upload File
    toggle, empty state, edit/replace/delete for Write users, view/
    download-only for Read users, "Last edited by/at" shown per record.
  - Tests: `backend/tests/integration/test_event_minutes.py` (write/read/
    no-access, extension + size validation, replace-cleans-up-old-object,
    delete) and `frontend/src/components/EventMinutesSection.test.jsx` —
    scoped runs only (this story's own new test files), both green.
  - **Not committed or pushed** — only do so when explicitly asked.

## Previous status (2026-08-11)
- **UNRESOLVED — Event Lucky Draw `lot_ref` bug, mid-investigation, resume
  here first.** The Lucky Draw & Auction item list (Manage Project →
  Lucky Draw) has a reworked lot-ref numbering system (details below) that
  is fully correct and tested in isolation — 13 backend tests passing,
  including a chained Auction→LS→L→Auction round-trip that explicitly
  checks every group stays gapless at every step. But the user reports
  that in the real running app (`localhost:5173` frontend →
  `localhost:8000` backend, confirmed with them), changing an item's Type
  still leaves the *old* group with a missing number, and a full page
  reload does not fix it. Several rounds of fixes were applied (delete not
  recomputing — real bug, fixed; frontend uncontrolled-input staleness —
  real bug, fixed; a per-item pending-lock to stop double-click races —
  added) and the dev DB was manually re-normalized twice, but the report
  persisted after each fix. **The last thing done**: queried the dev DB
  directly (`SELECT item_type, count(*) FROM event_items GROUP BY
  item_type`) right before asking the user to reproduce live, planning to
  query again immediately after to catch the actual change in the act —
  but the user ended the session before that comparison happened. Baseline
  at that point: `auction=6, lucky_draw_on_stage=4, lucky_draw=51`
  (one event only). **Next session: ask the user to repeat the Auction →
  Lucky Draw On Stage move, then immediately run that same count query
  (and `SELECT item_type, lot_ref FROM event_items ORDER BY item_type,
  lot_ref` for detail) against
  `postgresql+psycopg2://admin:Axelle1970!@localhost:5432/rotary_admin`
  to see whether the counts actually change.** Twice now the counts were
  checked before/after a reported "it worked" and had not moved at all —
  worth seriously considering that the user's browser session isn't
  actually reaching this backend/DB (stale Vite build, wrong port, some
  caching layer) rather than this being a real numbering bug; that
  possibility was raised but never confirmed or ruled out. If the dev DB
  needs re-normalizing again (gaps reappear at the exact same historical
  spot — LS starting at 2, L starting at 2 — that's a strong tell it's
  not being freshly broken, just never actually changed), this is safe to
  re-run:
  ```python
  from sqlalchemy import create_engine
  from sqlalchemy.orm import Session
  from app.models import EventItem
  from app.api.event_item import _recompute_group
  engine = create_engine("postgresql+psycopg2://admin:Axelle1970!@localhost:5432/rotary_admin")
  with Session(engine) as db:
      event_ids = {row[0] for row in db.query(EventItem.event_id).distinct().all()}
      for event_id in event_ids:
          for group_key in ("auction", "lucky_draw_on_stage", "lucky_draw"):
              _recompute_group(db, event_id, group_key)
      db.commit()
  ```

- **Event Lucky Draw `lot_ref` fully reworked this session** (was:
  assigned once at creation via an insertion-order counter, 3 item types
  sharing only 2 letter sequences). Now, in `backend/app/api/event_item.py`:
  - Three fully independent sequences, one per `item_type`: `auction`→A,
    `lucky_draw_on_stage`→LS, `lucky_draw`→L (was L shared between the two
    lucky-draw types) — see `_GROUP_PREFIX`.
  - Defaults to value_hkd-descending position within its own sequence
    (highest value = #1), recomputed fresh on every create
    (`_recompute_group`).
  - Manually editable per item — typing a new number inserts the item
    there and shifts the rest of that sequence up by one
    (`_insert_and_shift`), marks `lot_ref_overridden=True` on just that
    item (new `EventItem.lot_ref_overridden` boolean column, migration
    `f3a9c7d2b5e1`, **run against dev DB, confirmed present**).
  - Any value_hkd change, item_type move, new item, or item deletion in a
    sequence fully re-syncs that whole sequence back to value order,
    clearing every override in it — confirmed this exact behavior with the
    user first (they explicitly chose "re-syncs to value order" over
    "stays pinned permanently" when asked).
  - List/report display order (`_sorted_items`) now follows the *current
    lot number*, not raw value_hkd — matters after an override, so the
    on-screen row order never contradicts the lot ref label next to it.
  - Frontend (`frontend/src/pages/EventLuckyDraw.jsx`): Lot Ref renders as
    a colored letter bubble (same color as the Type chip) + an editable
    number input next to it. The number input is `key={item.lot_ref}` so
    it remounts (and re-applies `defaultValue`) whenever the value changes
    for any reason — fixes a real bug where sibling rows renumbered
    server-side kept showing their stale number until a full page reload,
    because React doesn't re-apply `defaultValue` to an already-mounted
    uncontrolled input.
  - Type/Status/Ad Page went from plain text to click-to-cycle pills
    (`ToggleChip`), matching Payment Status's chip design, each with its
    own color set. Added a `withItemPending`/`pendingItemIds` guard so a
    fast double-click can't fire two overlapping PATCH requests for the
    same item (each PATCH recomputes a whole sequence from current DB
    state, so overlapping requests could in theory race).
  - **Real bug found and fixed**: `delete_item` never called
    `_recompute_group` at all — deleting an item permanently left a gap in
    its sequence. Now recomputes the item's group right after delete.
  - Tests: `backend/tests/integration/test_event_items.py`, 13 passing.
    **A `git checkout --` mistake reverted this file mid-session**,
    wiping that session's test additions — recovered by rewriting from
    conversation history. Worth a sanity read if anything there looks off.
  - **Not committed or pushed.** Spans `backend/app/api/event_item.py`,
    `app/models/event_item.py`, `app/schemas/event_item.py`, migration
    `f3a9c7d2b5e1` (**applied to dev DB**),
    `tests/integration/test_event_items.py`, and
    `frontend/src/pages/EventLuckyDraw.jsx`.

- **Minimal-theme card-format standardization pass, earlier this same
  session**: made every stat-card row across the app match Dashboard's
  "Club overview" card exactly — compact size, alternating blue/gold via
  a `.stat-duo-grid` CSS marker class (or `.stat-compact` where a card's
  tone needs to stay fixed/named instead of alternating by position, e.g.
  FinanceOperational's Revenue/Cost). New hooks added to
  `frontend/src/theme-minimal.css`. Touched: MembersStatistics,
  DonationsStatistics, OrganisationDetail, FinanceDonations,
  FinanceFundraising, FinanceOperational (also added a 3rd "Result" card =
  Revenue−Cost, and moved "Add entry" below the columns), EventSummary,
  DinnerEvents, MemberFees, RotaryFriendsStatistics, EventLuckyDraw,
  EventGuestList.
  - Fixed a real backend bug in passing: dinner attendance stats
    (`compute_attendance_stats` in `attendance_support.py`) counted
    past-dated Dinner Forecast events that were never actually *started*
    (no attendance taken), inflating "Total events" on the Dinner page's
    stat cards. Now only counts started events (has an `AttendanceRecord`
    row) — same check `start_attendance_for_event` itself uses, factored
    into a shared `started_event_ids()` helper (also deduped an identical
    private copy of this logic out of `dinner_forecast.py`).
  - Fixed a real CSS bug: `.app-content { flex: 1 }` had no `min-width: 0`,
    so a wide table (Member Fees Tracking's, 920px) could force the whole
    layout wider than the viewport and overlap the nav sidebar. Fixed
    app-wide in `App.css`, not page-specific.
  - Fixed a real contrast bug: `--color-brand-blue-light` is a pale tint
    in Classic but gets repurposed to a medium blue (the nav-rail fill
    color) under Minimal — two spots (Fee Run's price-tier pills, the
    "Couple" badge) still used it as a "light" background, reading as
    blue-on-blue under Minimal. Switched both to `--tone-blue-bg`
    (unaffected by either theme, same as every other badge in the app).
  - This batch (101 files) **was committed and pushed** to `origin/main`
    mid-session (commits `95c4ff3`, `16ae0a1` — check `git log` for the
    full message). Everything under "Event Lucky Draw" above, and
    everything below this bullet, is **still uncommitted**.

- **Event Guest List** (`frontend/src/pages/EventGuestList.jsx`), same
  session: summary cards reduced to the standard 2-color duo (was 3), a
  compact "Guests per table" + "Guests per contact Rotarian" breakdown
  table added below the cards (small text, hairline border, deliberately
  lightweight — not a big block). Payment Status/Early Bird/Table Number
  are all click-to-change (Table Number is a type-in field validated
  against the event's actual configured tables, not click-to-cycle —
  cycling was reported as bad UX with more than a couple of tables).
  Payment status's "Guest" label renamed to "Invited" everywhere (chip,
  filter, breakdown header) — the underlying value stays `"guest"`
  internally, only the display text changed. Fixed the same
  loadGuestData()-always-shows-a-loading-state issue as the App.css bug
  above, scoped to this page (added a `{ silent: true }` option), so row
  edits don't jump the page back to top. A "Set all to Early Bird" bulk
  button was added then removed the same session — the user clarified it
  was meant as a one-time action on the then-current list, not a
  permanent feature.

- **Manage Project → Sponsors**: report generation (format select +
  "Generate Report" button) hidden for now via a new `showReport` prop on
  the shared `EventCategoryEntryPage` component (default `true`) — Costs,
  which shares that component, keeps its report button unaffected. The
  Category filter is now the leftmost control since the report controls
  that used to precede it are gone.

- **Process note for next session**: mid-session the user corrected the
  default test-running behavior — stop re-running the full frontend suite
  after every small follow-up edit; lint + reasoning (or at most a scoped
  single-file test) while iterating, save a full-suite run for
  immediately before a push. Already reflected in the
  `feedback-test-scope` memory.

## Previous status (2026-07-15)
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
   run only the **test file(s) covering what you actually touched** — not
   between stories, and **not even once at the end of the batch/epic**.
   (2026-08-21 correction: an earlier version of this note said to run the
   full suite once at batch-end, "same as the `x.99` story would" — that's
   wrong; stay scoped to changed files at every point, batch end included.)
   Only the epic's dedicated `x.99` "test & fix" story — whose whole job is
   the full-suite run — or an explicit ask from me should ever trigger the
   full backend/frontend suites. If I ask you to run the full suite after
   every story in a given session, that's a one-off override for that
   session only — revert to this default afterward unless told otherwise.
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
9. **Don't open the browser preview / log in / click through the app to
   "verify" a change unless I explicitly ask for it.** This app requires a
   real login, and driving the browser (navigating panels, filling forms,
   resetting passwords, adding/deleting test rows to check styling) burns a
   lot of turns for a small UI tweak. Default to static verification instead:
   read the changed code back, run lint/typecheck, and reason about whether
   it satisfies the request. Only fire up the browser when I say "check it in
   the browser," "show me a screenshot," or similar — and even then, don't
   also reset user passwords or write/delete real data as a side effect
   without asking first.

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
