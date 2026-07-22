-- Posting-path queries (Track B). Each posting runs in one transaction that
-- takes a per-key advisory lock, appends append-only stock_movements rows,
-- upserts the derived stock_levels cache, and assigns a gapless document number.

-- LockStockKey takes a transaction-scoped advisory lock for one
-- (tenant, product, warehouse) key. Concurrent postings that touch the same key
-- serialize here, so per-key seq and stock_levels stay consistent (PLAN.md
-- section 3). The lock is released automatically at transaction end.
-- name: LockStockKey :exec
SELECT pg_advisory_xact_lock(
    hashtextextended(sqlc.arg(tenant_id)::text || '|' || sqlc.arg(product_id)::text || '|' || sqlc.arg(warehouse_id)::text, 0)
);

-- MaxMovementSeq returns the current highest seq for a key, or 0 when the key
-- has no movements yet. The next movement's seq is this + 1. Batch is matched
-- with IS NOT DISTINCT FROM so the no-batch row (NULL) compares equal.
-- name: MaxMovementSeq :one
SELECT COALESCE(MAX(seq), 0)::bigint AS max_seq
FROM stock_movements
WHERE tenant_id = sqlc.arg(tenant_id)
  AND product_id = sqlc.arg(product_id)
  AND warehouse_id = sqlc.arg(warehouse_id)
  AND batch_id IS NOT DISTINCT FROM sqlc.narg(batch_id);

-- GetStockLevel returns the cached level for a key, if any.
-- name: GetStockLevel :one
SELECT qty_on_hand, avg_cost
FROM stock_levels
WHERE tenant_id = sqlc.arg(tenant_id)
  AND product_id = sqlc.arg(product_id)
  AND warehouse_id = sqlc.arg(warehouse_id)
  AND batch_id IS NOT DISTINCT FROM sqlc.narg(batch_id);

-- KeyMovements returns every movement for a key in journal order
-- (effective_at, seq). The poster re-folds the whole ordered slice through the
-- costing engine so stock_levels is always a faithful reduction of the
-- append-only journal (ADR-0001), never drifting from it.
-- name: KeyMovements :many
SELECT id, qty_base, unit_cost, movement_type, effective_at, seq, is_provisional
FROM stock_movements
WHERE tenant_id = sqlc.arg(tenant_id)
  AND product_id = sqlc.arg(product_id)
  AND warehouse_id = sqlc.arg(warehouse_id)
  AND batch_id IS NOT DISTINCT FROM sqlc.narg(batch_id)
ORDER BY effective_at, seq;

-- InsertMovement appends one journal row. stock_movements is append-only
-- (ADR-0001); there is no update/delete counterpart.
-- name: InsertMovement :one
INSERT INTO stock_movements (
    id, tenant_id, product_id, warehouse_id, batch_id,
    qty_base, unit_cost, movement_type, doc_type, doc_id, doc_line_id,
    effective_at, seq, is_provisional, created_by
) VALUES (
    sqlc.arg(id), sqlc.arg(tenant_id), sqlc.arg(product_id), sqlc.arg(warehouse_id), sqlc.narg(batch_id),
    sqlc.arg(qty_base), sqlc.arg(unit_cost), sqlc.arg(movement_type), sqlc.arg(doc_type), sqlc.arg(doc_id), sqlc.narg(doc_line_id),
    sqlc.arg(effective_at), sqlc.arg(seq), sqlc.arg(is_provisional), sqlc.arg(created_by)
)
RETURNING id;

-- UpsertStockLevel refreshes the derived cache for a key. Batch NULL is unique
-- per key via UNIQUE NULLS NOT DISTINCT (migration 0004), so ON CONFLICT keys on
-- the same four columns.
-- name: UpsertStockLevel :exec
INSERT INTO stock_levels (
    tenant_id, product_id, warehouse_id, batch_id, qty_on_hand, avg_cost, updated_at
) VALUES (
    sqlc.arg(tenant_id), sqlc.arg(product_id), sqlc.arg(warehouse_id), sqlc.narg(batch_id),
    sqlc.arg(qty_on_hand), sqlc.arg(avg_cost), now()
)
ON CONFLICT (tenant_id, product_id, warehouse_id, batch_id) DO UPDATE
SET qty_on_hand = EXCLUDED.qty_on_hand,
    avg_cost = EXCLUDED.avg_cost,
    updated_at = now();

-- NextDocumentNumber atomically reserves the next gapless sequence value for a
-- (tenant, doc_type, year) counter, creating the counter at 1 on first use
-- (ADR-0010). The row is updated under the posting transaction, so the number is
-- gapless as long as the transaction commits.
-- name: NextDocumentNumber :one
INSERT INTO document_number_sequences (tenant_id, doc_type, year, next_seq)
VALUES (sqlc.arg(tenant_id), sqlc.arg(doc_type), sqlc.arg(year), 2)
ON CONFLICT (tenant_id, doc_type, year) DO UPDATE
SET next_seq = document_number_sequences.next_seq + 1
RETURNING (next_seq - 1)::bigint AS assigned_seq;

-- ListProvisionalMovements is the reconciliation worklist (ADR-0003): every
-- provisional movement for a tenant not yet reconciled, newest first.
-- name: ListProvisionalMovements :many
SELECT id, product_id, warehouse_id, batch_id, qty_base, unit_cost,
       movement_type, doc_type, doc_id, effective_at, seq, created_at
FROM stock_movements
WHERE tenant_id = sqlc.arg(tenant_id)
  AND is_provisional
  AND reconciled_by_movement_id IS NULL
ORDER BY effective_at DESC, seq DESC;
