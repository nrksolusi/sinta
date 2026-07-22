-- Base identity and tenancy schema (PLAN.md section 3, ADR-0004, ADR-0005, ADR-0009).
-- PKs are UUIDv7 (native in Postgres 18). Timestamps are timestamptz *_at.
--
-- RLS note: identity tables (users, tenants, memberships, sessions) are
-- user-scoped, not tenant-scoped - auth flows run before a tenant is selected.
-- Tenant-scoped RLS (app.tenant_id) starts with the first tenant-owned domain
-- tables in M1 (warehouses, products, ...). Membership rows are additionally
-- protected by a policy that applies once a tenant context is set.

-- +goose Up

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    email text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    name text NOT NULL,
    legal_name text NOT NULL DEFAULT '',
    -- ADR-0002: chosen at onboarding, switchable only at fiscal year boundary
    costing_method text NOT NULL DEFAULT 'weighted_average'
        CHECK (costing_method IN ('weighted_average', 'fifo')),
    fiscal_year_start_month int NOT NULL DEFAULT 1
        CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
    -- D14: manual activation flag, no billing code
    active boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'warehouse', 'sales', 'viewer')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, tenant_id)
);

CREATE INDEX memberships_tenant_id_idx ON memberships (tenant_id);

-- Warehouse scoping arrives with the warehouses table in M1; this join table
-- is created then (membership_warehouses) so it can carry a real FK.

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    active_tenant_id uuid REFERENCES tenants (id) ON DELETE SET NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- RLS backstop on memberships: with no tenant context (auth flows) all of a
-- user's rows are reachable via app-level user_id scoping; once app.tenant_id
-- is set, only the active tenant's rows are visible.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON memberships
    USING (
        current_setting('app.tenant_id', true) IS NULL
        OR current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

-- The application connects as a dedicated non-superuser role so RLS applies
-- (superusers and table owners with BYPASSRLS would silently skip policies).
-- The role is created without a password; each environment sets its own via
-- ALTER ROLE out-of-band (never hardcoded in migrations).
-- +goose StatementBegin
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'sinta_app') THEN
        CREATE ROLE sinta_app LOGIN;
    END IF;
END
$$;
-- +goose StatementEnd

GRANT USAGE ON SCHEMA public TO sinta_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sinta_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sinta_app;

-- +goose Down

DROP POLICY IF EXISTS memberships_tenant_isolation ON memberships;

DROP TABLE sessions;
DROP TABLE memberships;
DROP TABLE tenants;
DROP TABLE users;

-- The sinta_app role is intentionally kept: other databases or a re-run of the
-- up migration may depend on it, and DROP ROLE fails while grants exist.
