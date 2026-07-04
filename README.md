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

- `GET /api/v1/dashboard/summary` — any authenticated user; returns real counts (`active_members`, `organisations_supported`, `rotary_friends`) queried straight from the DB. These are genuinely 0 until Epics 2-4 add data — not hardcoded stubs.
- `components/AppLayout.jsx` is the shared post-login shell (header with the club branding + logout, sidebar nav) wrapping every authenticated route via a layout route in `App.jsx`. Members / NGOs & Donations / Friends of Rotary are shown as greyed-out, unclickable placeholders until their epics are built; "Manage users" only appears for admins.
- Theme: light, Rotary blue (`--rotary-blue: #17458f`) and white, card-based (`index.css` / `App.css`).
- `components/BrandHeader.jsx` renders the club logo + "Rotary Club of Discovery Bay Database" title, shared by the login page and the app shell header. Swapping the logo image later is a one-file replacement (`src/assets/rotary-logo.png`) — no code change needed.

**Frontend** (`frontend/src`): `context/AuthContext.jsx` + `hooks/useAuth.js` expose `user`, `isAuthenticated`, `login()`, `logout()`. The access token is kept in memory only (`api/client.js`, never persisted) to limit XSS exposure; the refresh token is kept in `localStorage` under `rotaryadmin.refresh_token` since something has to survive a page reload without cookies. On load, `AuthProvider` silently redeems a stored refresh token to restore the session. `components/ProtectedRoute.jsx` guards routes (e.g. `/dashboard`) and redirects to `/login` when unauthenticated.

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
- `admin_client` / `treasurer_client` / `user_client` — `TestClient` pre-authenticated as a freshly created user of that role, for one-line permission tests
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
