-- name: CreateProductUom :one
INSERT INTO product_uoms (tenant_id, product_id, uom, factor_to_base)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListProductUoms :many
SELECT * FROM product_uoms
WHERE tenant_id = $1 AND product_id = $2
ORDER BY uom;

-- name: DeleteProductUom :one
DELETE FROM product_uoms
WHERE tenant_id = $1 AND product_id = $2 AND id = $3
RETURNING id;
