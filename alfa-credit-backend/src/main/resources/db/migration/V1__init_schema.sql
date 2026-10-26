-- V1: Initial schema for alfa-credit-backend

-- Companies table
CREATE TABLE companies
(
    id             VARCHAR(64) PRIMARY KEY,
    legal_form     VARCHAR(16)  NOT NULL,
    name           VARCHAR(255) NOT NULL,
    inn            VARCHAR(12)  NOT NULL,
    ogrn           VARCHAR(15)  NOT NULL,
    okved          VARCHAR(8)   NOT NULL,
    okved_name     VARCHAR(255) NOT NULL,
    registered_at  DATE         NOT NULL,
    employees      INTEGER,
    annual_revenue BIGINT,
    region         VARCHAR(128)
);

-- Users table
CREATE TABLE users
(
    id            VARCHAR(64) PRIMARY KEY,
    role          VARCHAR(16)  NOT NULL,
    login         VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    position      VARCHAR(255) NOT NULL,
    company_id    VARCHAR(64) REFERENCES companies (id)
);

-- Drafts table
CREATE TABLE drafts
(
    id         VARCHAR(128) PRIMARY KEY,
    user_id    VARCHAR(64) NOT NULL REFERENCES users (id),
    form_json  JSONB       NOT NULL,
    step       INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMP   NOT NULL,
    updated_at TIMESTAMP   NOT NULL
);

-- Draft prefilled fields (one row per field path)
CREATE TABLE draft_prefilled
(
    id         BIGSERIAL PRIMARY KEY,
    draft_id   VARCHAR(128) NOT NULL REFERENCES drafts (id) ON DELETE CASCADE,
    field_path VARCHAR(255) NOT NULL
);

-- Applications table
CREATE TABLE applications
(
    id              VARCHAR(64) PRIMARY KEY,
    number          VARCHAR(32) NOT NULL UNIQUE,
    user_id         VARCHAR(64) NOT NULL REFERENCES users (id),
    status          VARCHAR(32) NOT NULL,
    product         VARCHAR(32),
    amount          BIGINT,
    term_months     INTEGER,
    purpose         VARCHAR(32),
    form_json       JSONB,
    enrichment_json JSONB,
    scoring_json    JSONB,
    decision_json   JSONB,
    signing_json    JSONB,
    created_at      TIMESTAMP   NOT NULL,
    submitted_at    TIMESTAMP,
    updated_at      TIMESTAMP   NOT NULL
);

-- Application audit entries
CREATE TABLE application_audit
(
    id             VARCHAR(128) PRIMARY KEY,
    application_id VARCHAR(64)  NOT NULL REFERENCES applications (id),
    stage          VARCHAR(32)  NOT NULL,
    action         VARCHAR(128) NOT NULL,
    comment        TEXT,
    actor_type     VARCHAR(16),
    actor_name     VARCHAR(255),
    at             TIMESTAMP    NOT NULL
);

-- Indexes
CREATE INDEX idx_applications_user_id ON applications (user_id);
CREATE INDEX idx_applications_status ON applications (status);
CREATE INDEX idx_applications_updated_at ON applications (updated_at DESC);
CREATE INDEX idx_drafts_user_id ON drafts (user_id);
CREATE INDEX idx_audit_application_id ON application_audit (application_id);
CREATE INDEX idx_draft_prefilled_draft_id ON draft_prefilled (draft_id);
