# CLAUDE.md — Rotary Club of Discovery Bay Admin App

Standing context for Claude Code. Read this first every session. The **code in
this repo is the source of truth**; this file is orientation, not a spec.

## What this is
Internal admin web app for the Rotary Club of Discovery Bay. Manages members,
NGOs/organisations & donations, "Rotary Friends" contacts, and annual membership
fees/invoicing. Small user base (club admins + treasurer), low traffic.

## Current status / resume from here (2026-07-06)
- **Epics 1, 2, 2b, 3 are complete.** **Epic 4 (Rotary Friends) is complete**:
  4.1-4.4 and 4.6-4.8 built; 4.5 (WhatsApp) was reassigned to Story 8.5.
- **Next up per the recommended sequence: Epic 5 (Annual Fees & Invoicing)**,
  unless told otherwise at the start of the next session.
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
   to run the full backend + frontend suites together, fix whatever the batch
   run turns up, and only then is the epic considered ready to push. Likewise,
   **never `git push` or push to GitHub unless I explicitly ask** — that still
   only happens once I request it, normally right after that epic's test &
   fix story.
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

**WhatsApp:** do NOT implement any WhatsApp feature until the core site
(Epics 1-5, 7) is functionally complete and I explicitly say to start Epic 8's
WhatsApp block. Everywhere the app "sends," email is the only real channel for
now; treat WhatsApp as a placeholder until then.

Recommended sequence: 1 → 2 → 2b → 3 → 4 → 5 → 7 → 6 (deploy). Epic 8 items
(incl. all WhatsApp) come last, only when asked.

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
- **Do not `git push` / push to GitHub automatically** — only push when I ask,
  normally once the epic's test & fix story is complete.
No CI runs, no test runs, and no pushes happen on your initiative — I decide
when to run tests/CI and when to push.

## Branching & commits (keeps rollback easy)
- **At the start of each epic, create a dedicated git branch** for that epic
  (e.g. `epic-2b-members-improvement`) and do all of that epic's work on it.
- **Commit locally at the end of each story** with a clear message referencing
  the story (e.g. `Story 2b.2: members card grid view`). Also commit mid-story
  if I ask, or at a sensible checkpoint before a risky/large change — small,
  labelled commits make it easy to roll back to a known-good point.
- These are **local commits only** — remember the push rule above: do NOT push
  the branch to GitHub until I explicitly ask.
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
