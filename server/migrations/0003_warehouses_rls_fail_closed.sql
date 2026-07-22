-- Tighten the warehouses policy to fail-closed: tenant-owned domain tables
-- must be invisible without an explicit tenant context, so a handler that
-- forgets tenantTx surfaces immediately instead of leaking cross-tenant rows
-- (ADR-0004). Identity-adjacent tables (memberships, invitations) keep their
-- fail-open clause because login, invite lookup, and accept legitimately run
-- before a tenant context exists.

-- +goose Up

DROP POLICY warehouses_tenant_isolation ON warehouses;

CREATE POLICY warehouses_tenant_isolation ON warehouses
    USING (tenant_id::text = current_setting('app.tenant_id', true));

-- +goose Down

DROP POLICY warehouses_tenant_isolation ON warehouses;

CREATE POLICY warehouses_tenant_isolation ON warehouses
    USING (
        current_setting('app.tenant_id', true) IS NULL
        OR current_setting('app.tenant_id', true) = ''
        OR tenant_id::text = current_setting('app.tenant_id', true)
    );
