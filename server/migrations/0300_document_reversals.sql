-- Document reversal linkage (Track C - docs/plans/m1-parallel.md, range 0300-0399).
--
-- A reversal cancels a posted document by posting the opposite movements as a new
-- posted document of the same type (glossary "Reversal"); nothing posted is ever
-- deleted or mutated (ADR-0001, PLAN.md section 3). We record the linkage on the
-- documents themselves so each row is self-describing:
--   - reverses_id      on the reversal row -> the original it cancels
--   - reversed_by_id   on the original row -> the reversal that cancelled it
-- and we extend the status CHECK with 'reversed' so a cancelled original is
-- distinguishable from a still-live posted one. The original's status flips to
-- 'reversed' but its lines and posted movements stay untouched.
--
-- All seven document tables carry the same shape. Purchase and sales orders move
-- no stock, but a posted intent can still be cancelled by reversal, so they get
-- the columns too for a uniform lifecycle. Statements are static (not a dynamic
-- loop) so sqlc, which reads these migrations as its schema, sees the columns.

-- +goose Up

ALTER TABLE purchase_orders ADD COLUMN reverses_id uuid REFERENCES purchase_orders (id);
ALTER TABLE purchase_orders ADD COLUMN reversed_by_id uuid REFERENCES purchase_orders (id);
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft', 'posted', 'reversed'));

ALTER TABLE goods_receipts ADD COLUMN reverses_id uuid REFERENCES goods_receipts (id);
ALTER TABLE goods_receipts ADD COLUMN reversed_by_id uuid REFERENCES goods_receipts (id);
ALTER TABLE goods_receipts DROP CONSTRAINT goods_receipts_status_check;
ALTER TABLE goods_receipts ADD CONSTRAINT goods_receipts_status_check CHECK (status IN ('draft', 'posted', 'reversed'));

ALTER TABLE sales_orders ADD COLUMN reverses_id uuid REFERENCES sales_orders (id);
ALTER TABLE sales_orders ADD COLUMN reversed_by_id uuid REFERENCES sales_orders (id);
ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check CHECK (status IN ('draft', 'posted', 'reversed'));

ALTER TABLE deliveries ADD COLUMN reverses_id uuid REFERENCES deliveries (id);
ALTER TABLE deliveries ADD COLUMN reversed_by_id uuid REFERENCES deliveries (id);
ALTER TABLE deliveries DROP CONSTRAINT deliveries_status_check;
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check CHECK (status IN ('draft', 'posted', 'reversed'));

ALTER TABLE stock_transfers ADD COLUMN reverses_id uuid REFERENCES stock_transfers (id);
ALTER TABLE stock_transfers ADD COLUMN reversed_by_id uuid REFERENCES stock_transfers (id);
ALTER TABLE stock_transfers DROP CONSTRAINT stock_transfers_status_check;
ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK (status IN ('draft', 'posted', 'reversed'));

ALTER TABLE stock_adjustments ADD COLUMN reverses_id uuid REFERENCES stock_adjustments (id);
ALTER TABLE stock_adjustments ADD COLUMN reversed_by_id uuid REFERENCES stock_adjustments (id);
ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_status_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_status_check CHECK (status IN ('draft', 'posted', 'reversed'));

ALTER TABLE stock_opnames ADD COLUMN reverses_id uuid REFERENCES stock_opnames (id);
ALTER TABLE stock_opnames ADD COLUMN reversed_by_id uuid REFERENCES stock_opnames (id);
ALTER TABLE stock_opnames DROP CONSTRAINT stock_opnames_status_check;
ALTER TABLE stock_opnames ADD CONSTRAINT stock_opnames_status_check CHECK (status IN ('draft', 'posted', 'reversed'));

-- +goose Down

ALTER TABLE stock_opnames DROP CONSTRAINT stock_opnames_status_check;
ALTER TABLE stock_opnames ADD CONSTRAINT stock_opnames_status_check CHECK (status IN ('draft', 'posted'));
ALTER TABLE stock_opnames DROP COLUMN reversed_by_id;
ALTER TABLE stock_opnames DROP COLUMN reverses_id;

ALTER TABLE stock_adjustments DROP CONSTRAINT stock_adjustments_status_check;
ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adjustments_status_check CHECK (status IN ('draft', 'posted'));
ALTER TABLE stock_adjustments DROP COLUMN reversed_by_id;
ALTER TABLE stock_adjustments DROP COLUMN reverses_id;

ALTER TABLE stock_transfers DROP CONSTRAINT stock_transfers_status_check;
ALTER TABLE stock_transfers ADD CONSTRAINT stock_transfers_status_check CHECK (status IN ('draft', 'posted'));
ALTER TABLE stock_transfers DROP COLUMN reversed_by_id;
ALTER TABLE stock_transfers DROP COLUMN reverses_id;

ALTER TABLE deliveries DROP CONSTRAINT deliveries_status_check;
ALTER TABLE deliveries ADD CONSTRAINT deliveries_status_check CHECK (status IN ('draft', 'posted'));
ALTER TABLE deliveries DROP COLUMN reversed_by_id;
ALTER TABLE deliveries DROP COLUMN reverses_id;

ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check CHECK (status IN ('draft', 'posted'));
ALTER TABLE sales_orders DROP COLUMN reversed_by_id;
ALTER TABLE sales_orders DROP COLUMN reverses_id;

ALTER TABLE goods_receipts DROP CONSTRAINT goods_receipts_status_check;
ALTER TABLE goods_receipts ADD CONSTRAINT goods_receipts_status_check CHECK (status IN ('draft', 'posted'));
ALTER TABLE goods_receipts DROP COLUMN reversed_by_id;
ALTER TABLE goods_receipts DROP COLUMN reverses_id;

ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check CHECK (status IN ('draft', 'posted'));
ALTER TABLE purchase_orders DROP COLUMN reversed_by_id;
ALTER TABLE purchase_orders DROP COLUMN reverses_id;
