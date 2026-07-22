-- name: CreateTenant :one
INSERT INTO tenants (name, legal_name, costing_method, fiscal_year_start_month, active, created_by)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CountTenantsCreatedBy :one
SELECT count(*) FROM tenants
WHERE created_by = $1;

-- name: GetTenant :one
SELECT * FROM tenants
WHERE id = $1;

-- name: UpdateTenant :one
UPDATE tenants
SET name = $2,
    legal_name = $3,
    fiscal_year_start_month = $4,
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateMembership :one
INSERT INTO memberships (user_id, tenant_id, role)
VALUES ($1, $2, $3)
RETURNING *;

-- name: CreateWarehouse :one
INSERT INTO warehouses (tenant_id, code, name)
VALUES ($1, $2, $3)
RETURNING *;
