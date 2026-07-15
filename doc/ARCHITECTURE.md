# Rotary Club of Discovery Bay — Admin App: Architecture Summary

## Decision
Built with a **custom, owned stack** (not Lovable/no-code) via **Claude Code**, to keep full control over the codebase and avoid vendor lock-in on the underlying platform.

## Stack

| Layer | Choice |
|---|---|
| Backend | Python — **FastAPI** (async), **SQLAlchemy** ORM, **Alembic** migrations |
| Database | **PostgreSQL** (local for dev; hosted on Neon or Supabase later) |
| Frontend | **React + Vite** |
| Auth | **JWT (Bearer token in Authorization header only — no cookies)**, short-lived access token + longer-lived refresh token, roles: `admin`, `treasurer`, `user` |
| Email | **Resend** (resend.com) — API key via env var |
| WhatsApp | Deferred to backlog (Story 4.5) — Twilio or Meta WhatsApp Business API, evaluated later |
| Testing | **pytest** + **pytest-asyncio** + **httpx** (backend, isolated test DB) / **Vitest** + **React Testing Library** (frontend) |
| CI | GitHub Actions (or equivalent) — runs full test suite on every push/PR, blocks merge on failure |
| Hosting (future) | Render or Railway (app) + Neon (Postgres) — minimal-cost setup, ~$0-7/month |

## Key architectural decisions

1. **API-first, fully decoupled** — FastAPI backend and React frontend are separate; the API is a pure JSON API (no server-rendered HTML). This means:
   - A future **mobile app** (React Native, Flutter, or native) can consume the same API with no backend rework — just a new client.
   - All routes are versioned under **`/api/v1/...`** from day one.
   - CORS allowed origins are configurable via env var (not hardcoded), so adding new frontend clients later is a config change.

2. **Auth is Bearer-JWT-only** — no server-side sessions or cookies, so the exact same login/token flow will work for a future mobile app.

3. **Users vs Members are separate tables, optionally linked** — `users.member_id` is a nullable FK to `members`. Not every club member needs a login; not every login (e.g. external admin) needs to be a club member.

4. **Rotary year convention** — stored as the *starting* calendar year (e.g. `2024` = July 1 2024 → June 30 2025), computed via a small helper function, used consistently across Members, Donations, and Fees.

5. **Dynamic lookup tables over hardcoded enums where the list will change** — e.g. `member_titles` (President, Past President, Rotarian, etc.) is a managed table, not a fixed enum, since titles vary by club/year.

6. **Testing is a standing convention, not a bolt-on epic** — a testing foundation (Story 1.7) and CI pipeline (Story 1.8) are built early in Epic 1; every story from Epic 2 onward is expected to ship its own unit/integration/component tests as part of "done."

## Core data model (high level)

- `member_titles` — dynamic title lookup (code + label)
- `members` — club roster (status, title, join/leave dates, DOB, nationality, address, classification, couple flag)
- `users` — login accounts (role: admin/treasurer/user), optionally linked to a member
- `organisations` — NGOs the club supports
- `donations` — per-organisation, per-rotary-year donation records
- `rotary_friends` — guests/prospects/contacts (email and/or WhatsApp)
- `email_log` — shared send log across Members, Rotary Friends, and Fees modules
- `fee_settings` — per-rotary-year pricing: Early Bird Single/Couple, Full Single/Couple (4 prices; early-bird-vs-full is always a manual choice, never date-driven)
- `member_fees` — per-member, per-rotary-year invoice/payment record

## Project structure in ClickUp

**Space:** Rotary Admin App (Workspace 9018656865)

| Epic | Folder | Scope |
|---|---|---|
| 1 | Project Foundation & Auth | Scaffolding, schema/migrations (Epics 1-4 only), auth, user management, landing/dashboard, testing foundation, CI, API versioning/mobile-readiness, UI polish |
| 2 | Members Management | Members CRUD, titles, statistics, email to members |
| 3 | NGOs & Donations Tracking | Organisations CRUD, multi-year donations, statistics |
| 4 | Friends of Rotary | Rotary Friends CRUD, email, WhatsApp (backlog), CSV import/export |
| 5 | Annual Fees & Invoicing | Treasurer role, fee settings (4 prices/year), fee generation, invoice send/resend (email only — the placeholder manual WhatsApp checkbox was removed 2026-07-15, see CLAUDE.md), payment tracking |

Recommended build order: **Epic 1 → Epic 2 → Epic 3 → Epic 4 → Epic 5** (Epic 4's email reuses Epic 2's Resend integration; Epic 5 depends on Members' couple flag and the shared email_log/Resend setup).

## Reference files
- `schema.sql` — full consolidated database schema (all epics), also embedded directly in ClickUp Story 1.2 (Epics 1-4 scope) and Story 5.1 (Epic 5 scope)

## Permission matrix: registering a new module (Epic 12)

Access control (Epic 9, restructured by Epic 12) is a strict two-level
**Menu → Submenu** tree of `app_functions` rows, each with a `no_access` /
`read` / `write` level per Board Position or the fallback "Default User"
row, enforced by `require_access()` (backend) / `useAccess()` (frontend).
When a new module or nav item is added, register it the same way every time:

1. **Add `app_functions` rows in a migration** — one Menu row (`parent_id
   IS NULL`) per new sidebar section, one Submenu row (`parent_id` = the
   Menu's id) per literal sidebar item under it. Follow the existing
   `key` convention: `module` (menu) / `module.page` (submenu), e.g.
   `attendance`, `attendance.events`.
2. **Seed sane defaults in the same migration** — a Default User row
   (`board_position_id IS NULL, is_default_user = true`) and one row per
   named Board Position, for every new function key. A Submenu's seeded
   level must never exceed its Menu's seeded level for the same column
   (enforced at write-time by the matrix upsert endpoint, but get it right
   at seed time too).
3. **Gate the backend endpoints** with `require_access(KEY, "read"|"write")`
   from `app.api.deps` — never hand-roll a role check for a new module.
4. **Gate the frontend page** with `useAccess(key)` from
   `hooks/useAccess.js`, and add the section/items to `NAV_ITEMS` in
   `AppLayout.jsx` with `requiredPermission` — one `useAccess()` call per
   key, added to the `permissionChecks` map in the same component.
5. **The only permanent exceptions** are Manage Users and the Permissions
   matrix editor itself — hardcoded `adminOnly`/`require_admin`, never
   matrix rows. Don't add a third exception without updating this doc.

This is what Story 9.9's original seed drifted out of sync on (it never
matched what Epic 9 actually shipped) — Story 12.10 replaced it and this
section exists so the next module doesn't repeat that mistake.
