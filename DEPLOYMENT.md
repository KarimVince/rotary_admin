# Deployment guide (Epic 6 — Production Deployment)

Target stack: **Neon or Supabase** (Postgres) + **Render** (backend web
service + frontend static site), wired via `render.yaml` in the repo root.
Estimated cost: **$0/month** on free tiers (see the "Known limitations"
section for what that trades off).

Each step below says who does it: **(you)** — needs a human in a browser
with your accounts, or a decision only you can make — or **(Claude)** —
code/config already committed, or something Claude can run for you once you
hand over a connection string in chat.

---

## 6.1 — Provision production PostgreSQL

**(you)**

1. Create an account at [neon.tech](https://neon.tech) or
   [supabase.com](https://supabase.com) (Neon is the simpler pick for just a
   Postgres database — Supabase brings a lot of extra product you won't use
   here).
2. Create a new project. Pick a region close to Hong Kong/Discovery Bay if
   offered (Neon: Singapore `ap-southeast-1` is closest).
3. Copy the connection string it gives you. It looks like:
   ```
   postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
   ```
   Convert it to the driver form this app expects by inserting `+psycopg2`
   after `postgresql`:
   ```
   postgresql+psycopg2://<user>:<password>@<host>/<dbname>?sslmode=require
   ```
   This full string is your `DATABASE_URL` for Story 6.3 — **paste it
   somewhere private (password manager), never into a chat message or a
   committed file.**
4. `pgcrypto` doesn't need a manual step — the very first Alembic migration
   (`9e5155cc288c`) runs `CREATE EXTENSION IF NOT EXISTS pgcrypto`, and both
   Neon and Supabase allow that as a non-superuser. It'll be enabled
   automatically the moment Story 6.2's migrations run.
5. Backups: Neon's free tier keeps ~24h of point-in-time restore history
   automatically, no setup needed. Supabase's free tier does daily backups
   for 7 days. Note which you picked in case you ever need to restore.

**Done when:** you have a `DATABASE_URL` saved somewhere private.

---

## 6.2 — Run production DB migrations & seed script

**(Claude, once you share the connection string in chat)**

Tell Claude the `DATABASE_URL` from 6.1 (in chat is fine for this one value —
it's not being written to any file Claude creates) and ask it to run:

```bash
cd backend
DATABASE_URL="<your prod connection string>" alembic upgrade head
DATABASE_URL="<your prod connection string>" ADMIN_EMAIL="<real admin email>" \
  ADMIN_PASSWORD="<strong password>" python -m app.db.seed
DATABASE_URL="<your prod connection string>" python scripts/seed_permission_matrix.py
```

**Deviation from the literal story** (flagged per project convention): the
story doesn't mention `seed_permission_matrix.py`, but Epic 12's permission
matrix gates every non-admin module — without it, board-position members
(Treasurer, Secretary, etc.) would see nothing until someone runs it. The
seeded `ADMIN_EMAIL` user always gets full access regardless (`role="admin"`
bypasses the matrix entirely — see `app/core/access_control.py`), so this
isn't a blocker for your first login, just for anyone else's access before
board positions are assigned.

`python -m app.db.seed` runs three idempotent steps: `member_titles` (5
rows), the Admin user (from `ADMIN_EMAIL`/`ADMIN_PASSWORD`), and
`seed_users_from_active_members` — a no-op on a fresh DB since there are no
members yet. Nothing else. No dev fixtures, no test data.

**Done when:** you can query the prod DB and see 5 rows in `member_titles`
and exactly 1 row in `users`.

---

## 6.3 — Deploy backend (Render) & configure secrets

**(you, using the render.yaml Claude committed)**

1. Push this repo to GitHub if it isn't already (it is — `main` is current).
2. In the [Render dashboard](https://dashboard.render.com): **New → Blueprint**,
   connect your GitHub account, pick this repo. Render reads `render.yaml`
   at the repo root and proposes two services: `rotary-admin-backend`
   (Python web service) and `rotary-admin-frontend` (static site).
3. Before confirming, Render will prompt you for every env var marked
   `sync: false` in `render.yaml`. Fill in the backend ones now (frontend's
   `VITE_API_BASE_URL` comes in Story 6.4, after the backend has a URL):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | from Story 6.1 |
   | `JWT_SECRET` | a long random string, **different from your dev `.env`** — generate one with `openssl rand -hex 32` |
   | `RESEND_API_KEY` | from your Resend account (see Story 6.5 note on domain verification) |
   | `RESEND_FROM_EMAIL` | leave as `onboarding@resend.dev` for now if your domain isn't verified yet (see 6.5), otherwise your verified domain's address |
   | `ADMIN_EMAIL` / `ADMIN_PASSWORD` | must match what you used in 6.2's seed step |
   | `MEMBER_SEED_PASSWORD` | any strong shared temp password — members change it after first login |
   | `CORS_ALLOWED_ORIGINS` | leave blank for now, come back and set it after Story 6.4 gives you the frontend URL |
   | `PUBLIC_BASE_URL` | Render tells you the service URL right after creation, e.g. `https://rotary-admin-backend.onrender.com` — you can set this once, right after first deploy |
   | `FRONTEND_BASE_URL` | same story as `CORS_ALLOWED_ORIGINS` — fill in after 6.4 |

4. Deploy. The `startCommand` in `render.yaml` runs `alembic upgrade head`
   before starting the server every time — this is a safety net if 6.2 was
   somehow skipped, and makes future schema changes deploy automatically.
5. Confirm the health check:
   ```bash
   curl https://rotary-admin-backend.onrender.com/api/v1/health
   # {"status":"ok"}
   ```
6. Confirm login works before wiring up the frontend:
   ```bash
   curl -X POST https://rotary-admin-backend.onrender.com/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}'
   # should return an access_token
   ```

**Done when:** both curl calls above succeed.

---

## 6.4 — Deploy frontend (Render static site) & connect to backend

**(you)**

1. The frontend service was already created alongside the backend in the
   Blueprint step above (6.3). Set its one env var:

   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://rotary-admin-backend.onrender.com/api/v1` (your actual backend URL from 6.3 + `/api/v1`) |

2. Deploy. Render builds with `npm ci && npm run build` and serves `dist/`.
3. Go back to the **backend** service's env vars and fill in the two you
   deferred in 6.3:
   - `CORS_ALLOWED_ORIGINS` = the frontend's URL, e.g.
     `https://rotary-admin-frontend.onrender.com`
   - `FRONTEND_BASE_URL` = same URL
   Save — Render redeploys the backend automatically on env var changes.
4. Open the frontend URL in a browser, confirm the login page loads with no
   CORS errors in the console.

**Done when:** you can load the login page at the frontend's public URL.

---

## 6.5 — Domain & HTTPS setup

**(you — decision + external purchase, Claude cannot buy a domain for you)**

Two options:

- **Free**: skip this story, keep the `*.onrender.com` URLs. HTTPS is
  already automatic on Render (Let's Encrypt), so the "HTTPS" half of this
  story's acceptance criteria is already satisfied either way.
- **Custom domain** (~€10-15/year): buy one (Namecheap, Google Domains'
  successor Squarespace Domains, etc.), then in Render: service → Settings →
  Custom Domains → add it, and add the CNAME/A record Render shows you at
  your registrar.

**While you're touching domains, resolve the standing Resend blocker**
(tracked separately in ClickUp Story 8.2, but it blocks Story 6.7's email
sign-off): verify a domain you control in the
[Resend dashboard](https://resend.com/domains) → Domains → Add Domain, add
the DNS records it gives you, wait for verification, then set
`RESEND_FROM_EMAIL` on the backend service to an address on that domain
(e.g. `no-reply@yourdomain.org`). Until this is done, real emails only land
in the Resend account owner's own inbox (sandbox sender), which will make
Story 6.7's "confirm invoice email actually arrives" fail for anyone else.

**Done when:** the app is reachable over HTTPS with no browser warnings
(true by default on Render even without a custom domain).

---

## 6.6 — CI/CD: auto-deploy on merge, gated by tests

**(Claude committed the workflow; you add two repo secrets)**

`.github/workflows/deploy.yml` runs the full backend + frontend test suites
on every push to `main`, and only if both pass, triggers a deploy via each
Render service's Deploy Hook. `render.yaml` sets `autoDeploy: false` on both
services specifically so Render never deploys a push on its own — only this
gated workflow does.

1. In Render, for **each** service (`rotary-admin-backend` and
   `rotary-admin-frontend`): Settings → Deploy Hook → copy the URL.
2. In GitHub: repo → Settings → Secrets and variables → Actions → New
   repository secret. Add:
   - `RENDER_BACKEND_DEPLOY_HOOK_URL`
   - `RENDER_FRONTEND_DEPLOY_HOOK_URL`
3. To verify the gate works: push a commit with a deliberately failing test,
   confirm the Actions run goes red and no deploy hook fires, then revert it.

### Rollback procedure

Render keeps every previous deploy. To roll back:
1. Render dashboard → the affected service → **Events** (or **Deploys**) tab.
2. Find the last known-good deploy → **Rollback to this deploy** (or
   redeploy it manually).
3. Do this for both services if the bad release touched both — they don't
   roll back together automatically.
4. If the bad release included a migration, `alembic downgrade -1` may also
   be needed against the prod DB (run manually — the app doesn't downgrade
   automatically on rollback). Check what the migration actually did before
   downgrading; some are additive-only and safe to leave even after a code
   rollback.

**Done when:** a deliberately failing test blocks the deploy step in the
Actions run, and you've confirmed how to roll back in the Render dashboard.

---

## 6.7 — Final production validation & sign-off

**(you, with Claude able to help verify via curl/API calls on request)**

Walk through every module against the **live production URL** — not
localhost:

- Auth: log in as the seeded Admin.
- Members: create, edit, confirm in statistics.
- Organisations & Donations: create an org, log a donation, confirm it shows
  in that org's history and donation statistics.
- Rotary Friends: create a friend, confirm CSV export.
- Fees: set `fee_settings` for the current rotary year, generate a fee run,
  confirm the invoice email actually arrives (needs 6.5's Resend domain
  verification done first, or it'll only land in the Resend account owner's
  inbox).
- Role check: log in as a non-admin `user`, confirm admin-only actions are
  blocked.
- Cold-start check: Render's free tier sleeps a web service after 15 minutes
  of inactivity — the first request after that takes ~30-60s to wake up.
  Decide if that's acceptable for club use, or worth Render's paid tier
  (~$7/month) to avoid.
- Clean up any test data created during this pass.
- Get a board member to do login → one CRUD action → logout on the live
  site before calling this done.

---

## Known limitations to decide on before real club data goes in

- **Ephemeral file storage**: member photos, PPT templates, generated
  member-application PDFs, and email attachments are stored on local disk
  (`UPLOAD_DIR=uploads`) and served via `/static`. Render's free/starter web
  services have an **ephemeral filesystem** — every deploy or restart wipes
  this directory. This isn't one of Epic 6's stories, so it's out of scope
  here, but it means: a member's uploaded photo will disappear the next time
  you deploy a change, until this is fixed. Options if this matters before
  real use: Render's paid persistent disk add-on, or migrating storage to
  Supabase Storage / Cloudflare R2 (bigger change, not started).
- **Resend sandbox sender**: see Story 6.5's note above — real invoice/member
  emails won't reach real recipients until a domain is verified in Resend.
