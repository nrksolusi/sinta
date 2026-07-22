-- name: CreateProduct :one
INSERT INTO products (tenant_id, sku, name, base_uom, is_batch_tracked, barcode)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetProduct :one
SELECT * FROM products
WHERE tenant_id = $1 AND id = $2;

-- name: ListProducts :many
SELECT * FROM products
WHERE tenant_id = $1
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY sku;

-- name: UpdateProduct :one
UPDATE products
SET name = $3,
    base_uom = $4,
    is_batch_tracked = $5,
    barcode = $6,
    status = $7,
    updated_at = now()
WHERE tenant_id = $1 AND id = $2
RETURNING *;
