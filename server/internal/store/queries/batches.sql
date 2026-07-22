-- name: CreateBatch :one
INSERT INTO batches (tenant_id, product_id, batch_no, expiry_date)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListBatches :many
SELECT * FROM batches
WHERE tenant_id = $1 AND product_id = $2
ORDER BY expiry_date NULLS LAST, batch_no;
