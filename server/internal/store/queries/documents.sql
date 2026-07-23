-- Document queries (Track C - docs/plans/m1-parallel.md). Draft CRUD for the six
-- document types plus the header transitions posting and reversal need. Movement
-- writes, gapless numbering, and stock_levels are owned by the Poster (Track B);
-- these queries only manage the document tables. Every query is tenant-scoped and
-- runs under an app.tenant_id transaction so RLS applies (ADR-0004).

-- ===========================================================================
-- Purchase orders
-- ===========================================================================

-- name: CreatePurchaseOrder :one
INSERT INTO purchase_orders (tenant_id, supplier_id, warehouse_id, doc_date, notes, reverses_id, status, created_by)
VALUES (sqlc.arg(tenant_id), sqlc.arg(supplier_id), sqlc.arg(warehouse_id), sqlc.arg(doc_date), sqlc.arg(notes), sqlc.narg(reverses_id), sqlc.arg(status), sqlc.arg(created_by))
RETURNING *;

-- name: InsertPurchaseOrderLine :one
INSERT INTO purchase_order_lines (tenant_id, purchase_order_id, line_no, product_id, uom, qty, unit_cost)
VALUES (sqlc.arg(tenant_id), sqlc.arg(purchase_order_id), sqlc.arg(line_no), sqlc.arg(product_id), sqlc.arg(uom), sqlc.arg(qty), sqlc.arg(unit_cost))
RETURNING *;

-- name: GetPurchaseOrder :one
SELECT * FROM purchase_orders WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: ListPurchaseOrders :many
SELECT * FROM purchase_orders
WHERE tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(filter_status)::text IS NULL OR status = sqlc.narg(filter_status)::text)
  AND (sqlc.narg(filter_warehouse_id)::uuid IS NULL OR warehouse_id = sqlc.narg(filter_warehouse_id)::uuid)
  AND (sqlc.narg(filter_date_from)::date IS NULL OR doc_date >= sqlc.narg(filter_date_from)::date)
  AND (sqlc.narg(filter_date_to)::date IS NULL OR doc_date <= sqlc.narg(filter_date_to)::date)
  AND (sqlc.narg(filter_q)::text IS NULL OR doc_number ILIKE '%' || sqlc.narg(filter_q) || '%')
  AND (sqlc.narg(cursor_ts)::timestamptz IS NULL
       OR created_at < sqlc.narg(cursor_ts)::timestamptz
       OR (created_at = sqlc.narg(cursor_ts)::timestamptz AND id < sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: ListPurchaseOrderLines :many
SELECT * FROM purchase_order_lines WHERE tenant_id = sqlc.arg(tenant_id) AND purchase_order_id = sqlc.arg(purchase_order_id) ORDER BY line_no;

-- name: DeletePurchaseOrderLines :exec
DELETE FROM purchase_order_lines WHERE tenant_id = sqlc.arg(tenant_id) AND purchase_order_id = sqlc.arg(purchase_order_id);

-- name: DeletePurchaseOrder :exec
DELETE FROM purchase_orders WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: UpdatePurchaseOrderHeader :one
UPDATE purchase_orders
SET supplier_id = sqlc.arg(supplier_id), warehouse_id = sqlc.arg(warehouse_id), doc_date = sqlc.arg(doc_date), notes = sqlc.arg(notes)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkPurchaseOrderPosted :one
UPDATE purchase_orders
SET status = 'posted', doc_number = sqlc.arg(doc_number), posted_at = now(), posted_by = sqlc.arg(posted_by)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkPurchaseOrderReversed :exec
UPDATE purchase_orders
SET status = 'reversed', reversed_by_id = sqlc.arg(reversed_by_id)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- ===========================================================================
-- Goods receipts
-- ===========================================================================

-- name: CreateGoodsReceipt :one
INSERT INTO goods_receipts (tenant_id, purchase_order_id, supplier_id, warehouse_id, doc_date, notes, reverses_id, status, created_by)
VALUES (sqlc.arg(tenant_id), sqlc.narg(purchase_order_id), sqlc.arg(supplier_id), sqlc.arg(warehouse_id), sqlc.arg(doc_date), sqlc.arg(notes), sqlc.narg(reverses_id), sqlc.arg(status), sqlc.arg(created_by))
RETURNING *;

-- name: InsertGoodsReceiptLine :one
INSERT INTO goods_receipt_lines (tenant_id, goods_receipt_id, line_no, purchase_order_line_id, product_id, batch_id, uom, qty, unit_cost)
VALUES (sqlc.arg(tenant_id), sqlc.arg(goods_receipt_id), sqlc.arg(line_no), sqlc.narg(purchase_order_line_id), sqlc.arg(product_id), sqlc.narg(batch_id), sqlc.arg(uom), sqlc.arg(qty), sqlc.arg(unit_cost))
RETURNING *;

-- name: GetGoodsReceipt :one
SELECT * FROM goods_receipts WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: ListGoodsReceipts :many
SELECT * FROM goods_receipts
WHERE tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(filter_status)::text IS NULL OR status = sqlc.narg(filter_status)::text)
  AND (sqlc.narg(filter_warehouse_id)::uuid IS NULL OR warehouse_id = sqlc.narg(filter_warehouse_id)::uuid)
  AND (sqlc.narg(filter_date_from)::date IS NULL OR doc_date >= sqlc.narg(filter_date_from)::date)
  AND (sqlc.narg(filter_date_to)::date IS NULL OR doc_date <= sqlc.narg(filter_date_to)::date)
  AND (sqlc.narg(filter_q)::text IS NULL OR doc_number ILIKE '%' || sqlc.narg(filter_q) || '%')
  AND (sqlc.narg(cursor_ts)::timestamptz IS NULL
       OR created_at < sqlc.narg(cursor_ts)::timestamptz
       OR (created_at = sqlc.narg(cursor_ts)::timestamptz AND id < sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: ListGoodsReceiptLines :many
SELECT * FROM goods_receipt_lines WHERE tenant_id = sqlc.arg(tenant_id) AND goods_receipt_id = sqlc.arg(goods_receipt_id) ORDER BY line_no;

-- name: DeleteGoodsReceiptLines :exec
DELETE FROM goods_receipt_lines WHERE tenant_id = sqlc.arg(tenant_id) AND goods_receipt_id = sqlc.arg(goods_receipt_id);

-- name: DeleteGoodsReceipt :exec
DELETE FROM goods_receipts WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: UpdateGoodsReceiptHeader :one
UPDATE goods_receipts
SET purchase_order_id = sqlc.narg(purchase_order_id), supplier_id = sqlc.arg(supplier_id), warehouse_id = sqlc.arg(warehouse_id), doc_date = sqlc.arg(doc_date), notes = sqlc.arg(notes)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkGoodsReceiptPosted :one
UPDATE goods_receipts
SET status = 'posted', doc_number = sqlc.arg(doc_number), posted_at = now(), posted_by = sqlc.arg(posted_by)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkGoodsReceiptReversed :exec
UPDATE goods_receipts
SET status = 'reversed', reversed_by_id = sqlc.arg(reversed_by_id)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- ===========================================================================
-- Sales orders
-- ===========================================================================

-- name: CreateSalesOrder :one
INSERT INTO sales_orders (tenant_id, customer_id, warehouse_id, doc_date, notes, reverses_id, status, created_by)
VALUES (sqlc.arg(tenant_id), sqlc.arg(customer_id), sqlc.arg(warehouse_id), sqlc.arg(doc_date), sqlc.arg(notes), sqlc.narg(reverses_id), sqlc.arg(status), sqlc.arg(created_by))
RETURNING *;

-- name: InsertSalesOrderLine :one
INSERT INTO sales_order_lines (tenant_id, sales_order_id, line_no, product_id, uom, qty, unit_price)
VALUES (sqlc.arg(tenant_id), sqlc.arg(sales_order_id), sqlc.arg(line_no), sqlc.arg(product_id), sqlc.arg(uom), sqlc.arg(qty), sqlc.arg(unit_price))
RETURNING *;

-- name: GetSalesOrder :one
SELECT * FROM sales_orders WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: ListSalesOrders :many
SELECT * FROM sales_orders
WHERE tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(filter_status)::text IS NULL OR status = sqlc.narg(filter_status)::text)
  AND (sqlc.narg(filter_warehouse_id)::uuid IS NULL OR warehouse_id = sqlc.narg(filter_warehouse_id)::uuid)
  AND (sqlc.narg(filter_date_from)::date IS NULL OR doc_date >= sqlc.narg(filter_date_from)::date)
  AND (sqlc.narg(filter_date_to)::date IS NULL OR doc_date <= sqlc.narg(filter_date_to)::date)
  AND (sqlc.narg(filter_q)::text IS NULL OR doc_number ILIKE '%' || sqlc.narg(filter_q) || '%')
  AND (sqlc.narg(cursor_ts)::timestamptz IS NULL
       OR created_at < sqlc.narg(cursor_ts)::timestamptz
       OR (created_at = sqlc.narg(cursor_ts)::timestamptz AND id < sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: ListSalesOrderLines :many
SELECT * FROM sales_order_lines WHERE tenant_id = sqlc.arg(tenant_id) AND sales_order_id = sqlc.arg(sales_order_id) ORDER BY line_no;

-- name: DeleteSalesOrderLines :exec
DELETE FROM sales_order_lines WHERE tenant_id = sqlc.arg(tenant_id) AND sales_order_id = sqlc.arg(sales_order_id);

-- name: DeleteSalesOrder :exec
DELETE FROM sales_orders WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: UpdateSalesOrderHeader :one
UPDATE sales_orders
SET customer_id = sqlc.arg(customer_id), warehouse_id = sqlc.arg(warehouse_id), doc_date = sqlc.arg(doc_date), notes = sqlc.arg(notes)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkSalesOrderPosted :one
UPDATE sales_orders
SET status = 'posted', doc_number = sqlc.arg(doc_number), posted_at = now(), posted_by = sqlc.arg(posted_by)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkSalesOrderReversed :exec
UPDATE sales_orders
SET status = 'reversed', reversed_by_id = sqlc.arg(reversed_by_id)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- ===========================================================================
-- Deliveries
-- ===========================================================================

-- name: CreateDelivery :one
INSERT INTO deliveries (tenant_id, sales_order_id, customer_id, warehouse_id, doc_date, notes, reverses_id, status, created_by)
VALUES (sqlc.arg(tenant_id), sqlc.narg(sales_order_id), sqlc.arg(customer_id), sqlc.arg(warehouse_id), sqlc.arg(doc_date), sqlc.arg(notes), sqlc.narg(reverses_id), sqlc.arg(status), sqlc.arg(created_by))
RETURNING *;

-- name: InsertDeliveryLine :one
INSERT INTO delivery_lines (tenant_id, delivery_id, line_no, sales_order_line_id, product_id, batch_id, uom, qty)
VALUES (sqlc.arg(tenant_id), sqlc.arg(delivery_id), sqlc.arg(line_no), sqlc.narg(sales_order_line_id), sqlc.arg(product_id), sqlc.narg(batch_id), sqlc.arg(uom), sqlc.arg(qty))
RETURNING *;

-- name: GetDelivery :one
SELECT * FROM deliveries WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: ListDeliveries :many
SELECT * FROM deliveries
WHERE tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(filter_status)::text IS NULL OR status = sqlc.narg(filter_status)::text)
  AND (sqlc.narg(filter_warehouse_id)::uuid IS NULL OR warehouse_id = sqlc.narg(filter_warehouse_id)::uuid)
  AND (sqlc.narg(filter_date_from)::date IS NULL OR doc_date >= sqlc.narg(filter_date_from)::date)
  AND (sqlc.narg(filter_date_to)::date IS NULL OR doc_date <= sqlc.narg(filter_date_to)::date)
  AND (sqlc.narg(filter_q)::text IS NULL OR doc_number ILIKE '%' || sqlc.narg(filter_q) || '%')
  AND (sqlc.narg(cursor_ts)::timestamptz IS NULL
       OR created_at < sqlc.narg(cursor_ts)::timestamptz
       OR (created_at = sqlc.narg(cursor_ts)::timestamptz AND id < sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: ListDeliveryLines :many
SELECT * FROM delivery_lines WHERE tenant_id = sqlc.arg(tenant_id) AND delivery_id = sqlc.arg(delivery_id) ORDER BY line_no;

-- name: DeleteDeliveryLines :exec
DELETE FROM delivery_lines WHERE tenant_id = sqlc.arg(tenant_id) AND delivery_id = sqlc.arg(delivery_id);

-- name: DeleteDelivery :exec
DELETE FROM deliveries WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: UpdateDeliveryHeader :one
UPDATE deliveries
SET sales_order_id = sqlc.narg(sales_order_id), customer_id = sqlc.arg(customer_id), warehouse_id = sqlc.arg(warehouse_id), doc_date = sqlc.arg(doc_date), notes = sqlc.arg(notes)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkDeliveryPosted :one
UPDATE deliveries
SET status = 'posted', doc_number = sqlc.arg(doc_number), posted_at = now(), posted_by = sqlc.arg(posted_by)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkDeliveryReversed :exec
UPDATE deliveries
SET status = 'reversed', reversed_by_id = sqlc.arg(reversed_by_id)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- ===========================================================================
-- Stock transfers
-- ===========================================================================

-- name: CreateStockTransfer :one
INSERT INTO stock_transfers (tenant_id, from_warehouse_id, to_warehouse_id, doc_date, notes, reverses_id, status, created_by)
VALUES (sqlc.arg(tenant_id), sqlc.arg(from_warehouse_id), sqlc.arg(to_warehouse_id), sqlc.arg(doc_date), sqlc.arg(notes), sqlc.narg(reverses_id), sqlc.arg(status), sqlc.arg(created_by))
RETURNING *;

-- name: InsertStockTransferLine :one
INSERT INTO stock_transfer_lines (tenant_id, stock_transfer_id, line_no, product_id, batch_id, uom, qty)
VALUES (sqlc.arg(tenant_id), sqlc.arg(stock_transfer_id), sqlc.arg(line_no), sqlc.arg(product_id), sqlc.narg(batch_id), sqlc.arg(uom), sqlc.arg(qty))
RETURNING *;

-- name: GetStockTransfer :one
SELECT * FROM stock_transfers WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: ListStockTransfers :many
SELECT * FROM stock_transfers
WHERE tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(filter_status)::text IS NULL OR status = sqlc.narg(filter_status)::text)
  AND (sqlc.narg(filter_warehouse_id)::uuid IS NULL
       OR from_warehouse_id = sqlc.narg(filter_warehouse_id)::uuid
       OR to_warehouse_id   = sqlc.narg(filter_warehouse_id)::uuid)
  AND (sqlc.narg(filter_date_from)::date IS NULL OR doc_date >= sqlc.narg(filter_date_from)::date)
  AND (sqlc.narg(filter_date_to)::date IS NULL OR doc_date <= sqlc.narg(filter_date_to)::date)
  AND (sqlc.narg(filter_q)::text IS NULL OR doc_number ILIKE '%' || sqlc.narg(filter_q) || '%')
  AND (sqlc.narg(cursor_ts)::timestamptz IS NULL
       OR created_at < sqlc.narg(cursor_ts)::timestamptz
       OR (created_at = sqlc.narg(cursor_ts)::timestamptz AND id < sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: ListStockTransferLines :many
SELECT * FROM stock_transfer_lines WHERE tenant_id = sqlc.arg(tenant_id) AND stock_transfer_id = sqlc.arg(stock_transfer_id) ORDER BY line_no;

-- name: DeleteStockTransferLines :exec
DELETE FROM stock_transfer_lines WHERE tenant_id = sqlc.arg(tenant_id) AND stock_transfer_id = sqlc.arg(stock_transfer_id);

-- name: DeleteStockTransfer :exec
DELETE FROM stock_transfers WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: UpdateStockTransferHeader :one
UPDATE stock_transfers
SET from_warehouse_id = sqlc.arg(from_warehouse_id), to_warehouse_id = sqlc.arg(to_warehouse_id), doc_date = sqlc.arg(doc_date), notes = sqlc.arg(notes)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkStockTransferPosted :one
UPDATE stock_transfers
SET status = 'posted', doc_number = sqlc.arg(doc_number), posted_at = now(), posted_by = sqlc.arg(posted_by)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkStockTransferReversed :exec
UPDATE stock_transfers
SET status = 'reversed', reversed_by_id = sqlc.arg(reversed_by_id)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- ===========================================================================
-- Stock adjustments
-- ===========================================================================

-- name: CreateStockAdjustment :one
INSERT INTO stock_adjustments (tenant_id, warehouse_id, reason, doc_date, notes, reverses_id, status, created_by)
VALUES (sqlc.arg(tenant_id), sqlc.arg(warehouse_id), sqlc.arg(reason), sqlc.arg(doc_date), sqlc.arg(notes), sqlc.narg(reverses_id), sqlc.arg(status), sqlc.arg(created_by))
RETURNING *;

-- name: InsertStockAdjustmentLine :one
INSERT INTO stock_adjustment_lines (tenant_id, stock_adjustment_id, line_no, product_id, batch_id, uom, qty, unit_cost)
VALUES (sqlc.arg(tenant_id), sqlc.arg(stock_adjustment_id), sqlc.arg(line_no), sqlc.arg(product_id), sqlc.narg(batch_id), sqlc.arg(uom), sqlc.arg(qty), sqlc.arg(unit_cost))
RETURNING *;

-- name: GetStockAdjustment :one
SELECT * FROM stock_adjustments WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: ListStockAdjustments :many
SELECT * FROM stock_adjustments
WHERE tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(filter_status)::text IS NULL OR status = sqlc.narg(filter_status)::text)
  AND (sqlc.narg(filter_warehouse_id)::uuid IS NULL OR warehouse_id = sqlc.narg(filter_warehouse_id)::uuid)
  AND (sqlc.narg(filter_date_from)::date IS NULL OR doc_date >= sqlc.narg(filter_date_from)::date)
  AND (sqlc.narg(filter_date_to)::date IS NULL OR doc_date <= sqlc.narg(filter_date_to)::date)
  AND (sqlc.narg(filter_q)::text IS NULL OR doc_number ILIKE '%' || sqlc.narg(filter_q) || '%')
  AND (sqlc.narg(cursor_ts)::timestamptz IS NULL
       OR created_at < sqlc.narg(cursor_ts)::timestamptz
       OR (created_at = sqlc.narg(cursor_ts)::timestamptz AND id < sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: ListStockAdjustmentLines :many
SELECT * FROM stock_adjustment_lines WHERE tenant_id = sqlc.arg(tenant_id) AND stock_adjustment_id = sqlc.arg(stock_adjustment_id) ORDER BY line_no;

-- name: DeleteStockAdjustmentLines :exec
DELETE FROM stock_adjustment_lines WHERE tenant_id = sqlc.arg(tenant_id) AND stock_adjustment_id = sqlc.arg(stock_adjustment_id);

-- name: DeleteStockAdjustment :exec
DELETE FROM stock_adjustments WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: UpdateStockAdjustmentHeader :one
UPDATE stock_adjustments
SET warehouse_id = sqlc.arg(warehouse_id), reason = sqlc.arg(reason), doc_date = sqlc.arg(doc_date), notes = sqlc.arg(notes)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkStockAdjustmentPosted :one
UPDATE stock_adjustments
SET status = 'posted', doc_number = sqlc.arg(doc_number), posted_at = now(), posted_by = sqlc.arg(posted_by)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkStockAdjustmentReversed :exec
UPDATE stock_adjustments
SET status = 'reversed', reversed_by_id = sqlc.arg(reversed_by_id)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- ===========================================================================
-- Stock opnames
-- ===========================================================================

-- name: CreateStockOpname :one
INSERT INTO stock_opnames (tenant_id, warehouse_id, doc_date, notes, reverses_id, status, created_by)
VALUES (sqlc.arg(tenant_id), sqlc.arg(warehouse_id), sqlc.arg(doc_date), sqlc.arg(notes), sqlc.narg(reverses_id), sqlc.arg(status), sqlc.arg(created_by))
RETURNING *;

-- name: InsertStockOpnameLine :one
INSERT INTO stock_opname_lines (tenant_id, stock_opname_id, line_no, product_id, batch_id, uom, counted_qty)
VALUES (sqlc.arg(tenant_id), sqlc.arg(stock_opname_id), sqlc.arg(line_no), sqlc.arg(product_id), sqlc.narg(batch_id), sqlc.arg(uom), sqlc.arg(counted_qty))
RETURNING *;

-- name: SetStockOpnameLineSystemQty :exec
UPDATE stock_opname_lines
SET system_qty = sqlc.arg(system_qty)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: GetStockOpname :one
SELECT * FROM stock_opnames WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: ListStockOpnames :many
SELECT * FROM stock_opnames
WHERE tenant_id = sqlc.arg(tenant_id)
  AND (sqlc.narg(filter_status)::text IS NULL OR status = sqlc.narg(filter_status)::text)
  AND (sqlc.narg(filter_warehouse_id)::uuid IS NULL OR warehouse_id = sqlc.narg(filter_warehouse_id)::uuid)
  AND (sqlc.narg(filter_date_from)::date IS NULL OR doc_date >= sqlc.narg(filter_date_from)::date)
  AND (sqlc.narg(filter_date_to)::date IS NULL OR doc_date <= sqlc.narg(filter_date_to)::date)
  AND (sqlc.narg(filter_q)::text IS NULL OR doc_number ILIKE '%' || sqlc.narg(filter_q) || '%')
  AND (sqlc.narg(cursor_ts)::timestamptz IS NULL
       OR created_at < sqlc.narg(cursor_ts)::timestamptz
       OR (created_at = sqlc.narg(cursor_ts)::timestamptz AND id < sqlc.narg(cursor_id)::uuid))
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg(page_limit);

-- name: ListStockOpnameLines :many
SELECT * FROM stock_opname_lines WHERE tenant_id = sqlc.arg(tenant_id) AND stock_opname_id = sqlc.arg(stock_opname_id) ORDER BY line_no;

-- name: DeleteStockOpnameLines :exec
DELETE FROM stock_opname_lines WHERE tenant_id = sqlc.arg(tenant_id) AND stock_opname_id = sqlc.arg(stock_opname_id);

-- name: UpdateStockOpnameHeader :one
UPDATE stock_opnames
SET warehouse_id = sqlc.arg(warehouse_id), doc_date = sqlc.arg(doc_date), notes = sqlc.arg(notes)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkStockOpnamePosted :one
UPDATE stock_opnames
SET status = 'posted', doc_number = sqlc.arg(doc_number), posted_at = now(), posted_by = sqlc.arg(posted_by)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: MarkStockOpnameReversed :exec
UPDATE stock_opnames
SET status = 'reversed', reversed_by_id = sqlc.arg(reversed_by_id)
WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: DeleteStockOpname :exec
DELETE FROM stock_opnames WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- ===========================================================================
-- Shared: current stock level for opname variance (read the derived cache)
-- ===========================================================================

-- name: GetStockLevelForDoc :one
SELECT qty_on_hand, avg_cost
FROM stock_levels
WHERE tenant_id = sqlc.arg(tenant_id)
  AND product_id = sqlc.arg(product_id)
  AND warehouse_id = sqlc.arg(warehouse_id)
  AND batch_id IS NOT DISTINCT FROM sqlc.narg(batch_id);

-- ===========================================================================
-- Fulfillment rollup (ADR-0016): server-computed received/delivered qty
-- ===========================================================================

-- name: GetPOLineRollups :many
-- Sum of received qty per PO line from posted non-reversal goods receipts.
-- Returns (id, received_qty) ordered by line_no.
SELECT pol.id,
       COALESCE(SUM(grl.qty), '0'::numeric) AS received_qty
FROM purchase_order_lines pol
LEFT JOIN goods_receipt_lines grl
    ON grl.purchase_order_line_id = pol.id
    AND grl.tenant_id = pol.tenant_id
LEFT JOIN goods_receipts gr
    ON gr.id = grl.goods_receipt_id
    AND gr.tenant_id = pol.tenant_id
    AND gr.status = 'posted'
    AND gr.reverses_id IS NULL
WHERE pol.tenant_id = sqlc.arg(tenant_id)
  AND pol.purchase_order_id = sqlc.arg(purchase_order_id)
GROUP BY pol.id, pol.line_no
ORDER BY pol.line_no;

-- name: GetSOLineRollups :many
-- Sum of delivered qty per SO line from posted non-reversal deliveries.
SELECT sol.id,
       COALESCE(SUM(dl.qty), '0'::numeric) AS delivered_qty
FROM sales_order_lines sol
LEFT JOIN delivery_lines dl
    ON dl.sales_order_line_id = sol.id
    AND dl.tenant_id = sol.tenant_id
LEFT JOIN deliveries d
    ON d.id = dl.delivery_id
    AND d.tenant_id = sol.tenant_id
    AND d.status = 'posted'
    AND d.reverses_id IS NULL
WHERE sol.tenant_id = sqlc.arg(tenant_id)
  AND sol.sales_order_id = sqlc.arg(sales_order_id)
GROUP BY sol.id, sol.line_no
ORDER BY sol.line_no;

-- name: GetTenantToleranceOverReceipt :one
-- Tenant over-receipt tolerance (default 0 when no settings row exists).
SELECT COALESCE(
    (SELECT tolerance_over_receipt FROM tenant_settings WHERE tenant_id = sqlc.arg(tenant_id)),
    '0'::numeric
) AS tolerance;

-- name: LockPOLineForReceipt :exec
-- Advisory lock on a PO line (transaction-scoped) to serialize concurrent receipts.
SELECT pg_advisory_xact_lock(
    ('x' || right(replace(sqlc.arg(purchase_order_line_id)::text, '-', ''), 16))::bit(64)::bigint
);

-- name: SumReceivedForPOLine :one
-- Already-received qty for a PO line, excluding the current goods receipt being posted.
SELECT COALESCE(SUM(grl.qty), '0'::numeric) AS received_qty
FROM goods_receipt_lines grl
JOIN goods_receipts gr ON gr.id = grl.goods_receipt_id
WHERE grl.tenant_id = sqlc.arg(tenant_id)
  AND grl.purchase_order_line_id = sqlc.arg(purchase_order_line_id)
  AND grl.goods_receipt_id != sqlc.arg(exclude_goods_receipt_id)
  AND gr.status = 'posted'
  AND gr.reverses_id IS NULL;

-- name: LockSOLineForDelivery :exec
-- Advisory lock on an SO line (transaction-scoped) to serialize concurrent deliveries.
SELECT pg_advisory_xact_lock(
    ('x' || right(replace(sqlc.arg(sales_order_line_id)::text, '-', ''), 16))::bit(64)::bigint
);

-- name: SumDeliveredForSOLine :one
-- Already-delivered qty for an SO line, excluding the current delivery being posted.
SELECT COALESCE(SUM(dl.qty), '0'::numeric) AS delivered_qty
FROM delivery_lines dl
JOIN deliveries d ON d.id = dl.delivery_id
WHERE dl.tenant_id = sqlc.arg(tenant_id)
  AND dl.sales_order_line_id = sqlc.arg(sales_order_line_id)
  AND dl.delivery_id != sqlc.arg(exclude_delivery_id)
  AND d.status = 'posted'
  AND d.reverses_id IS NULL;

-- name: GetPurchaseOrderLineByID :one
SELECT * FROM purchase_order_lines WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);

-- name: GetSalesOrderLineByID :one
SELECT * FROM sales_order_lines WHERE tenant_id = sqlc.arg(tenant_id) AND id = sqlc.arg(id);
