-- ============================================================
-- Rotary Club Admin App — Consolidated Database Schema
-- PostgreSQL
-- Covers Epics 1-5:
--   1. Foundation & Auth
--   2. Members Management (+ Titles)
--   3. Organisations & Donations
--   4. Rotary Friends
--   5. Annual Fees & Invoicing
--
-- Rotary year convention: stored as the STARTING calendar year.
-- e.g. rotary_year = 2024 means the period 2024-07-01 -> 2025-06-30.
-- Compute in application code, e.g. (Python):
--   def rotary_year(d: date) -> int:
--       return d.year if d.month >= 7 else d.year - 1
-- ============================================================

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role       AS ENUM ('admin', 'treasurer', 'user');
CREATE TYPE member_status   AS ENUM ('active', 'past');
CREATE TYPE fee_price_type  AS ENUM ('early_bird', 'full');
CREATE TYPE fee_channel     AS ENUM ('email', 'whatsapp', 'both');

-- ============================================================
-- EPIC 2 — Member Titles (dynamic lookup, created before members
-- so the FK can be declared inline)
-- ============================================================

CREATE TABLE member_titles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(10) UNIQUE NOT NULL,      -- 'P', 'PP', 'IPP', 'CP', 'Rtn'
    label       VARCHAR(100) NOT NULL,             -- 'President', 'Past President', ...
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- EPIC 2 — Members (club roster)
-- ============================================================

CREATE TABLE members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE,
    phone           VARCHAR(30),
    status          member_status NOT NULL DEFAULT 'active',
    title_id        UUID REFERENCES member_titles(id),   -- nullable
    join_date       DATE NOT NULL,
    leave_date      DATE,
    profession      VARCHAR(150),
    classification  VARCHAR(150),      -- Rotary "classification" (occupational category)
    date_of_birth   DATE,
    nationality     VARCHAR(100),      -- country of origin / nationality
    address         TEXT,
    is_couple       BOOLEAN NOT NULL DEFAULT FALSE,   -- used by Epic 5 fee pricing
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_members_dates CHECK (leave_date IS NULL OR leave_date >= join_date)
);

CREATE INDEX idx_members_status         ON members(status);
CREATE INDEX idx_members_title          ON members(title_id);
CREATE INDEX idx_members_nationality    ON members(nationality);
CREATE INDEX idx_members_classification ON members(classification);

-- ============================================================
-- EPIC 1 — Auth / Users (login accounts, separate from members
-- but optionally linked to one)
-- ============================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    role            user_role NOT NULL DEFAULT 'user',
    member_id       UUID REFERENCES members(id) ON DELETE SET NULL,  -- nullable link
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_member ON users(member_id);

CREATE TABLE auth_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) UNIQUE NOT NULL,
    purpose     VARCHAR(50) NOT NULL,   -- 'password_reset', 'invite', etc.
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Now that users exists, attach the FK for donations.created_by etc. later.

-- ============================================================
-- EPIC 3 — Organisations & Donations
-- ============================================================

CREATE TABLE organisations (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(255) NOT NULL,
    description           TEXT,
    contact_name          VARCHAR(150),
    contact_email         VARCHAR(255),
    contact_phone         VARCHAR(30),
    country               VARCHAR(100),
    first_supported_year  INT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE donations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    rotary_year     INT NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    currency        VARCHAR(3) NOT NULL DEFAULT 'HKD',
    donation_date   DATE NOT NULL,
    notes           TEXT,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organisation_id, rotary_year, donation_date, amount)
);

CREATE INDEX idx_donations_org_year ON donations(organisation_id, rotary_year);

-- ============================================================
-- EPIC 4 — Rotary Friends
-- ============================================================

CREATE TABLE rotary_friends (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name  VARCHAR(100) NOT NULL,
    last_name   VARCHAR(100) NOT NULL,
    email       VARCHAR(255),
    whatsapp    VARCHAR(30),        -- E.164 format, e.g. +33612345678
    tags        VARCHAR(255),       -- comma-separated for v1
    source      VARCHAR(150),       -- how we met them
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_rotary_friends_contact CHECK (email IS NOT NULL OR whatsapp IS NOT NULL)
);

CREATE INDEX idx_rotary_friends_email ON rotary_friends(email);

-- ============================================================
-- Email log (shared by Members, Rotary Friends, and Fees modules)
-- ============================================================

CREATE TABLE email_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_by         UUID REFERENCES users(id),
    subject         VARCHAR(255) NOT NULL,
    source_module   VARCHAR(20) NOT NULL,   -- 'members' | 'rotary_friends' | 'member_fees'
    recipient_group VARCHAR(50) NOT NULL,
    recipient_count INT NOT NULL DEFAULT 0,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          VARCHAR(50) NOT NULL DEFAULT 'sent'
);

-- ============================================================
-- EPIC 5 — Annual Fees & Invoicing
-- ============================================================

-- One row per rotary year: the 4 configurable prices.
-- Early-bird vs full is always a MANUAL choice made by whoever
-- triggers a fee run (Admin or Treasurer) — never date-driven.
CREATE TABLE fee_settings (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rotary_year             INT UNIQUE NOT NULL,
    early_bird_single_price NUMERIC(10,2) NOT NULL CHECK (early_bird_single_price > 0),
    early_bird_couple_price NUMERIC(10,2) NOT NULL CHECK (early_bird_couple_price > 0),
    full_single_price       NUMERIC(10,2) NOT NULL CHECK (full_single_price > 0),
    full_couple_price       NUMERIC(10,2) NOT NULL CHECK (full_couple_price > 0),
    currency                VARCHAR(3) NOT NULL DEFAULT 'EUR',
    created_by              UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per member per rotary year: the actual invoice/payment record.
CREATE TABLE member_fees (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id             UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    rotary_year           INT NOT NULL,
    price_type            fee_price_type NOT NULL,   -- early_bird | full — chosen manually every run
    is_couple_at_billing  BOOLEAN NOT NULL,           -- snapshot of members.is_couple at generation time
    amount_due            NUMERIC(10,2) NOT NULL,     -- resolved from fee_settings via (price_type, is_couple_at_billing)
    is_paid               BOOLEAN NOT NULL DEFAULT FALSE,
    paid_date             DATE,
    invoice_sent_at       TIMESTAMPTZ,
    invoice_send_count    INT NOT NULL DEFAULT 0,
    last_channel          fee_channel,
    notes                 TEXT,
    created_by            UUID REFERENCES users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, rotary_year)
);

CREATE INDEX idx_member_fees_year ON member_fees(rotary_year);
CREATE INDEX idx_member_fees_paid ON member_fees(is_paid);

-- ============================================================
-- SEED DATA (recommended defaults — adjust to your club)
-- ============================================================

INSERT INTO member_titles (code, label, sort_order) VALUES
    ('Rtn', 'Rotarian',                     0),
    ('P',   'President',                    1),
    ('PP',  'Past President',               2),
    ('IPP', 'Immediate Past President',     3),
    ('CP',  'Charter President',            4);

-- Admin user should be created via application seed script (needs
-- password hashing), not plain SQL. See Story 1.2 acceptance criteria.
