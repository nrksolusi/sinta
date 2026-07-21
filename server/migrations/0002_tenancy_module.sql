-- Tenancy module: warehouses (first tenant-owned domain table, pulled forward
-- from M1 for the onboarding wizard) and invitations (shareable invite links).
-- Tenant isolation follows the memberships pattern: rows are visible with no
-- tenant context (invite lookup/accept run pre-context) or a matching one.

-- +goose Up

CREATE TABLE warehouses (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY warehouses_tenant_isolation ON warehouses
    USING (
        current_setting('app.tenant_id', true) IS NULL
        OR current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

CREATE TABLE invitations (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'warehouse', 'sales', 'viewer')),
    token text NOT NULL UNIQUE,
    created_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY invitations_tenant_isolation ON invitations
    USING (
        current_setting('app.tenant_id', true) IS NULL
        OR current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON warehouses, invitations TO sinta_app;

-- +goose Down

DROP TABLE invitations;
DROP TABLE warehouses;
