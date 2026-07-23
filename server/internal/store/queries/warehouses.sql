-- CreateWarehouse lives in tenants.sql (used by onboarding); the list/get/update
-- queries below round out warehouse management for the catalog track.

-- name: ListWarehouses :many
SELECT * FROM warehouses
WHERE tenant_id = $1
  AND (sqlc.narg('q')::text IS NULL
       OR name ILIKE '%' || sqlc.narg('q') || '%'
       OR code ILIKE '%' || sqlc.narg('q') || '%')
ORDER BY
  CASE WHEN sqlc.narg('q')::text IS NOT NULL
       THEN -GREATEST(similarity(name, sqlc.narg('q')::text), similarity(code, sqlc.narg('q')::text))
  END NULLS LAST,
  code;

-- name: GetWarehouse :one
SELECT * FROM warehouses
WHERE tenant_id = $1 AND id = $2;

-- name: UpdateWarehouse :one
UPDATE warehouses
SET code = $3,
    name = $4,
    updated_at = now()
WHERE tenant_id = $1 AND id = $2
RETURNING *;
