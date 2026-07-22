-- name: CreatePartner :one
INSERT INTO partners (tenant_id, code, name, is_supplier, is_customer)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetPartner :one
SELECT * FROM partners
WHERE tenant_id = $1 AND id = $2;

-- name: ListPartners :many
SELECT * FROM partners
WHERE tenant_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (NOT sqlc.arg('only_supplier')::boolean OR is_supplier)
  AND (NOT sqlc.arg('only_customer')::boolean OR is_customer)
ORDER BY name;

-- name: UpdatePartner :one
UPDATE partners
SET code = $3,
    name = $4,
    is_supplier = $5,
    is_customer = $6,
    status = $7,
    updated_at = now()
WHERE tenant_id = $1 AND id = $2
RETURNING *;
