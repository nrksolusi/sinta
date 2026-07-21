DROP POLICY IF EXISTS memberships_tenant_isolation ON memberships;

DROP TABLE sessions;
DROP TABLE memberships;
DROP TABLE tenants;
DROP TABLE users;

-- The sinta_app role is intentionally kept: other databases or a re-run of the
-- up migration may depend on it, and DROP ROLE fails while grants exist.
