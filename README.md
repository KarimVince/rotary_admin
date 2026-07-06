# Rotary Admin

Admin app for managing Rotary club members, organisations/donations, Rotary friends, and annual fees.

See [ARCHITECTURE.md](ARCHITECTURE.md) for API versioning, CORS config, error shape, and mobile-readiness assumptions.

## Project structure

- `backend/` — FastAPI + SQLAlchemy + Alembic, Python 3, Postgres
- `frontend/` — React + Vite

## Local setup

### Backend

```bash
cd backend
python3 -m venv venv
venv/bin/pip install -r requirements.txt
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, etc.
venv/bin/alembic upgrade head
venv/bin/python -m app.db.seed   # creates default member titles + admin user
venv/bin/uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev   # http://localhost:5173
```

## Auth

All auth is via a Bearer JWT in the `Authorization` header — there's no cookie-based session, so the same mechanism works for the web frontend and any future mobile client without backend changes.

- `POST /api/v1/auth/login` — `{email, password}` → `{access_token, refresh_token, token_type}`. Access tokens expire after 30 minutes.
- `GET /api/v1/auth/me` — returns the current user, requires `Authorization: Bearer <access_token>`.
- `POST /api/v1/auth/refresh` — `{refresh_token}` → new token pair. Refresh tokens are opaque (not JWTs), stored hashed in the `auth_tokens` table, and single-use: each refresh rotates in a new refresh token and invalidates the old one.
- There's no public self-registration endpoint — users are created by an Admin.
- Route protection dependencies (`app/api/deps.py`): `require_admin`, `require_treasurer_or_admin`, `require_user`, or the generic `require_role(*roles)`.

### User management (Admin only)

- `POST /api/v1/users` — admin creates a user directly with a temporary password (no invite-email flow yet), sets their role.
- `GET /api/v1/users` — list all users.
- `PATCH /api/v1/users/{id}` — partial update of `role` and/or `is_active`.
- All three routes require the `admin` role (`app/api/users.py` applies `require_admin` at the router level).
- Frontend: `/admin/users` (linked from the dashboard for admins) — create-user form plus a table to toggle active/inactive and change role inline.

### Admin CRUD page pattern

`.admin-form` and `.admin-table` (`App.css`) are the standard, deliberately compact/dense styling for admin-style CRUD pages — smaller font size (13px vs. the 16px body default) and tighter input/button/cell padding than a normal form. `UserManagement.jsx` is the reference implementation. **Reuse these classes for future CRUD pages** (Members, Organisations, Rotary Friends, Fees) rather than inventing new spacing per page.

## Dashboard shell

- `GET /api/v1/dashboard/summary` — any authenticated user; returns real counts (`active_members`, `organisations_supported`, `rotary_friends`) plus `donations_this_year` (sum of donation amounts bucketed into the current Rotary year via `rotary_year(date.today())`), all queried straight from the DB. Genuinely 0 until data exists — not hardcoded stubs.
- `components/AppLayout.jsx` is the shared post-login shell (header with the club branding + logout, sidebar nav) wrapping every authenticated route via a layout route in `App.jsx`. The NGOs & Donations section is now live (Organisations + Statistics sub-nav); Friends of Rotary is still a greyed-out, unclickable placeholder until its epic is built; "Manage users" only appears for admins.
- Theme: light, Rotary blue (`--rotary-blue: #17458f`) and white, card-based (`index.css` / `App.css`).
- `components/BrandHeader.jsx` renders the club logo + "Rotary Club of Discovery Bay Database" title, shared by the login page and the app shell header. Swapping the logo image later is a one-file replacement (`src/assets/rotary-logo.png`) — no code change needed.

**Frontend** (`frontend/src`): `context/AuthContext.jsx` + `hooks/useAuth.js` expose `user`, `isAuthenticated`, `login()`, `logout()`. The access token is kept in memory only (`api/client.js`, never persisted) to limit XSS exposure; the refresh token is kept in `localStorage` under `rotaryadmin.refresh_token` since something has to survive a page reload without cookies. On load, `AuthProvider` silently redeems a stored refresh token to restore the session. `components/ProtectedRoute.jsx` guards routes (e.g. `/dashboard`) and redirects to `/login` when unauthenticated.

## Members management (Epic 2)

- `POST/GET/PATCH/DELETE /api/v1/members` — CRUD with filters (`status`, `title_id`, `join_year`, `nationality`, `classification`) on the list endpoint. Reads are available to any authenticated role. `POST`/`DELETE` are admin-only. `PATCH` is admin-only **or** a `user`-role account whose `users.member_id` matches the member being edited (self-service editing of their own linked record) — anyone else gets 403. `DELETE` is a soft delete (`status='past'`, backfills `leave_date`). `date_of_birth`/`address`/`rotarian_id` are stripped from responses for non-admin readers (`MemberReadLimited` vs `MemberRead` in `app/schemas/member.py`). `rotarian_id` (official RI membership number) is nullable but unique — creating/updating a member with one already in use returns 409. `nationality` is validated against the fixed list in `app/core/countries.py` (mirrored in `frontend/src/data/countries.js`) on **write** only — existing rows with legacy free-text values still read fine; a one-off Alembic data migration (`d15d83a56300`) normalized common aliases (`USA`→`United States`, `UK`→`United Kingdom`, etc.) and printed any unmapped values for manual review. `status` is `active`/`honorary`/`past` (Postgres enum extended via migration `2d9f948c9362`, added in its own autocommit block per the usual "ADD VALUE inside a transaction" ENUM rule).
- `POST/GET/PATCH/DELETE /api/v1/member-titles` — same admin-write/any-read split; `DELETE` soft-deactivates (`is_active=false`) rather than removing the row, since past members may still reference it. `GET` defaults to active-only; pass `include_inactive=true` for the management view.
- `GET /api/v1/members/statistics` — chart data (join-year cohort, nationality/gender/age/tenure distributions, joins-vs-leaves growth by Rotary year) plus 8 headline stat-card figures (`total_members`, `honorary_members`, `new_members_this_rotary_year`, `countries_represented`, `women_count`, `men_count`, `average_age`, `average_tenure_as_rotarian`) — the headline figures are scoped to Active + Honorary members only (Past excluded from all of them, not just hidden from its own card); the underlying charts are intentionally left unscoped. Computed in Python over the full member set rather than SQL aggregates — fine at single-club scale, easier to read and test. `compute_members_statistics()` in `app/api/members.py` is factored out so the report export below can reuse the exact same numbers.
- `POST /api/v1/members/statistics/report?format=pdf|pptx` — any authenticated role; generates and streams a downloadable report (`Content-Disposition: attachment`, filename dated e.g. `members-statistics-report-2026-07-05.pdf`) built server-side from the same stats as the live page — charts are re-rendered via `matplotlib` (`app/core/statistics_report.py`), not screenshotted from the frontend, so the export is accurate regardless of the caller's browser. Both formats are condensed onto a single page/slide: heading (club name + logo + generation date), the 8 stat cards, then all 6 charts in a compact grid — PDF via `reportlab` (2-column chart table), PPTX via `python-pptx` (widescreen 13.33×7.5in single slide, 3-column chart grid) so it drops straight into a board presentation without rework. The club logo is duplicated at `backend/app/assets/rotary-logo.png` (kept in sync with `frontend/src/assets/rotary-logo.png`) so report generation doesn't depend on the frontend source tree being present on the backend host.
- `POST /api/v1/members/email` + `GET /api/v1/members/email-log` — bulk email via [Resend](https://resend.com); admin-only. We deliberately send **one HTTP call per member** (Resend's `to` field does accept an array, but per-recipient calls keep failures isolated) with a per-recipient try/except — a few bad addresses don't sink the whole batch. Every attempt is logged to `email_log` with an aggregate `status` (`sent` / `partial_failure` / `failed` / `no_recipients`).
- `POST /api/v1/members/email/attachments` — admin-only, uploads one file (size-capped via `MAX_EMAIL_ATTACHMENT_BYTES`, default 10MB) and returns `{filename, url}`. Resend's attachments accept a `path` field pointing at a publicly-accessible URL — it fetches the file itself rather than accepting raw bytes — so the URL must be reachable from the internet (`PUBLIC_BASE_URL` setting). Front-load one or more of these before calling `/members/email` with an `attachments` array; `email_log.has_attachments` records whether a send included any.
- `POST /api/v1/members/photo` — admin-only member photo upload (jpeg/png/webp/gif, 5MB cap), same static-file pattern (`/static/...`) as email attachments.
- Frontend: `/members` (list/search/filter/add/edit, admin controls conditionally rendered), `/members/statistics` (recharts), `/members/email` (admin-only: compose → confirm recipient count → send, plus the log table). All three reuse the `.admin-form`/`.admin-table` pattern.

## NGOs & Donations (Epic 3)

- `POST/GET/PATCH/DELETE /api/v1/organisations` — supported NGOs/organisations. Any authenticated role can read; writes are admin-only. `GET /api/v1/organisations?search=` does a case-insensitive `ILIKE` match on **name or country**. `DELETE` is a hard delete — its donations go with it via `ON DELETE CASCADE` on `donations.organisation_id` (contrast with the soft-delete used for members/titles; organisations carry no historical-reference constraint). Fields: `name`, `description`, `contact_name`, `contact_email`, `contact_phone`, `country`, `first_supported_year`.
- `POST/GET /api/v1/organisations/{id}/donations`, `PATCH/DELETE /api/v1/donations/{id}`, `GET /api/v1/donations?rotary_year=` — donation records, admin-write/any-read. Each donation's `rotary_year` is **auto-computed** from `donation_date` via `app/core/rotary_year.py` (`rotary_year(d)` = `d.year` if month ≥ 7 else `d.year-1`; the Rotary year runs 1 Jul → 30 Jun, labelled by its start year) but can be **overridden** by passing `rotary_year` explicitly on create. On `PATCH`, moving `donation_date` re-derives `rotary_year` unless the caller also passes an explicit `rotary_year` in the same request. `amount` is `Numeric(12,2)` in the DB but typed `float` in the read schema so it serialises as a JSON number for direct charting. `created_by` is stamped from the authenticated admin. The frontend mirror of the helper lives in `frontend/src/utils/rotaryYear.js` (kept in sync by hand, like `countries`).
- `GET /api/v1/donations/statistics` — any authenticated role; aggregates for charting, all shaped as `{label, value}` arrays: `total_by_rotary_year`, `total_by_organisation` (ordered by total desc), `organisations_by_rotary_year` (distinct-org count per year), plus `grand_total` and `currency`. Aggregated in SQL (`func.sum`/`func.count(distinct)`), unlike the members stats which are computed in Python — donations can grow unbounded over the years so the DB does the work.
- Frontend: `/ngos` (organisations table + search + admin add/edit modal), `/ngos/:id` (org detail — info, all-years total, and donation history split into a highlighted **current Rotary year** section vs. past years, with an admin add/edit/delete form whose Rotary-year field is auto-filled read-only from the date), `/ngos/statistics` (recharts: total-per-year bar, year-over-year line, top-orgs bar, plus a Rotary-year selector that summarises a chosen year from `/donations?rotary_year=`). Dashboard gains a live "Donations this rotary year" card.

## Running tests

Every story from Epic 2 onward ships with its own unit + integration tests as part of "done" — not as a follow-up.

### Everything

```bash
make test
```

Runs the backend and frontend suites back to back. Also available as `make test-backend` / `make test-frontend`.

### Backend only (pytest)

```bash
cd backend
venv/bin/pytest                  # full suite, with coverage report (fails under 70%)
venv/bin/pytest -m unit          # unit tests only (no DB)
venv/bin/pytest -m integration   # integration tests only (real test DB + API)
venv/bin/pytest tests/unit/test_rotary_year.py   # single file
venv/bin/pytest tests/unit/test_rotary_year.py::test_rotary_year_boundaries   # single test
```

Also available via `make test-unit` / `make test-integration` from the repo root.

Backend tests run against a dedicated **`rotary_admin_test`** database (never the dev DB). It's created automatically on first run and migrated to `head` via Alembic once per test session. Each individual test runs inside a transaction that's rolled back afterward, so tests never leak state into each other — no manual cleanup needed.

Available fixtures (see `backend/tests/conftest.py`):
- `client` — unauthenticated `TestClient`
- `admin_client` / `treasurer_client` / `user_client` — each its own independent `TestClient` pre-authenticated as a freshly created user of that role. Independent instances matter: a test can safely request two of these together (e.g. `admin_client` to set something up, `user_client` to prove it's forbidden) without one's auth header clobbering the other's.
- `make_user` / `make_member` / `make_organisation` / `make_rotary_friend` — factory fixtures for the core entities

### Frontend only (Vitest)

```bash
cd frontend
npm run test          # single run (used in CI)
npm run test:watch    # watch mode for local dev
```

Component tests use MSW (`src/test/mocks`) to mock API calls instead of hitting a real backend — add new mock handlers there as new endpoints are consumed by the UI.

## Continuous Integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and every pull request:

- **backend** job: spins up a Postgres service container, runs Alembic migrations, runs `pytest` with coverage (fails if coverage drops below 70%)
- **frontend** job: runs `npm run test`

Either job failing blocks the workflow (shown as a failing check on the PR). Click into the failing job in the "Checks" tab of the PR (or the "Actions" tab of the repo) to see which test failed and why — pytest/vitest output points directly at the failing test name and assertion.
