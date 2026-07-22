# Shared-schema multi-tenancy with tenant_id and Postgres RLS

**Status:** Accepted - implemented.

All tenants share one Postgres schema; every tenant-owned row carries
`tenant_id`, application middleware scopes every query, and row-level security
policies (keyed on `current_setting('app.tenant_id')`) act as a backstop. We
chose this over schema-per-tenant or database-per-tenant because the target is
many small SME tenants: migrations run once, pooling stays simple, and
cross-tenant operations remain cheap.

## Consequences

- RLS is defense in depth, not the primary mechanism - the app must still scope
  every query, and a missing policy on a new table is a security bug.
- Per-tenant restore is a filtered export, not a database restore; acceptable at
  SME price points.
- Moving a large tenant to dedicated infrastructure later is a data migration,
  not a config change.
