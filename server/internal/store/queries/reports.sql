-- Report queries (Track D - docs/plans/m1-parallel.md). All read-only over the
-- existing tables and tenant-scoped through tenantTx + RLS. Stock on hand and
-- valuation read the derived stock_levels cache; the stock card reads the
-- append-only journal so the costing engine can fold a running balance.

-- StockOnHand returns every cached level for the tenant, joined to product and
-- warehouse (and batch, where tracked), optionally narrowed to one warehouse
-- and/or product. NULLs on the filter args mean "no filter". Rows are ordered
-- deterministically so report output is stable for golden files.
-- name: StockOnHand :many
SELECT sl.product_id,
       p.sku,
       p.name AS product_name,
       sl.warehouse_id,
       w.code AS warehouse_code,
       w.name AS warehouse_name,
       sl.batch_id,
       b.batch_no,
       sl.qty_on_hand,
       sl.avg_cost
FROM stock_levels sl
JOIN products p ON p.id = sl.product_id
JOIN warehouses w ON w.id = sl.warehouse_id
LEFT JOIN batches b ON b.id = sl.batch_id
WHERE sl.tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(warehouse_id)::uuid IS NULL OR sl.warehouse_id = sqlc.narg(warehouse_id)::uuid)
  AND (sqlc.narg(product_id)::uuid IS NULL OR sl.product_id = sqlc.narg(product_id)::uuid)
ORDER BY p.sku, w.code, b.batch_no NULLS FIRST;

-- StockCardMovements returns the journal for one product, optionally one
-- warehouse, ordered per key by (warehouse, batch, effective_at, seq). The
-- report handler folds each contiguous key run through the costing engine to
-- derive the running balance (ADR-0002); the append-only journal is the sole
-- source of truth (ADR-0001).
-- name: StockCardMovements :many
SELECT id,
       warehouse_id,
       batch_id,
       qty_base,
       unit_cost,
       movement_type,
       doc_type,
       doc_id,
       effective_at,
       seq,
       is_provisional
FROM stock_movements
WHERE tenant_id = sqlc.arg(tenant_id)
  AND product_id = sqlc.arg(product_id)
  AND (sqlc.narg(warehouse_id)::uuid IS NULL OR warehouse_id = sqlc.narg(warehouse_id)::uuid)
ORDER BY warehouse_id, batch_id NULLS FIRST, effective_at, seq;
