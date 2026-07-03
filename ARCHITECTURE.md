# Architecture

## API versioning

All backend routes live under `/api/v1/...`. This costs nothing today and means a
future breaking change to an endpoint's shape can be introduced under `/api/v2/...`
without touching or breaking `/api/v1` clients that are already shipped — e.g. a
mobile app sitting in app store review, or a cached web build a user hasn't
refreshed yet.

## Transport-agnostic, JSON-only API

The backend is a pure JSON API (FastAPI) with no server-rendered HTML anywhere in
the API layer — no Jinja2 templates, no `HTMLResponse`. The only client today is
the React SPA (`frontend/`), but nothing about the API assumes a browser. **A
future mobile client (React Native, Flutter, or native iOS/Android) is expected to
consume `/api/v1` directly, using the same Bearer JWT auth as the web app** (see
the [Auth section](README.md#auth) of the README) — no cookies, no server-side
session state, no backend changes required.

## CORS

Allowed CORS origins are read from the `CORS_ALLOWED_ORIGINS` env var
(comma-separated), not hardcoded — see `app/core/config.py` and
`backend/.env.example`. Adding a new frontend origin later (a staging domain, a
mobile app's embedded web view, etc.) is a config change, not a code change.

## Error shape

Every error response — whether raised explicitly (`HTTPException`), a Pydantic
validation failure, or an unhandled server error — returns JSON with a `detail`
key: `{"detail": "..."}` for explicit/unhandled errors, `{"detail": [...]}` for
Pydantic validation errors (FastAPI's default). Without intervention, an
*unhandled* exception is the one case Starlette returns as plain text instead of
JSON by default; `app/core/exception_handlers.py` registers a catch-all handler so
even that case returns the same `{"detail": "..."}` shape. Any future client — web
or mobile — can therefore parse errors uniformly across the whole API.
