-- Remember each user's last active tenant so login can restore it instead of
-- starting sessions tenant-less. Cleared automatically if the tenant goes away.

-- +goose Up

ALTER TABLE users
    ADD COLUMN last_active_tenant_id uuid REFERENCES tenants (id) ON DELETE SET NULL;

-- +goose Down

ALTER TABLE users
    DROP COLUMN last_active_tenant_id;
