-- +goose Up
-- INC-2: add posted_by to all 7 document header tables so the actor who
-- posted a document is recorded alongside posted_at (which already exists).
-- Nullable on existing rows; set at post time going forward.

ALTER TABLE goods_receipts    ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES users(id);
ALTER TABLE purchase_orders   ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES users(id);
ALTER TABLE sales_orders      ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES users(id);
ALTER TABLE deliveries        ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES users(id);
ALTER TABLE stock_transfers   ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES users(id);
ALTER TABLE stock_adjustments ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES users(id);
ALTER TABLE stock_opnames     ADD COLUMN IF NOT EXISTS posted_by uuid REFERENCES users(id);

-- +goose Down
ALTER TABLE goods_receipts    DROP COLUMN IF EXISTS posted_by;
ALTER TABLE purchase_orders   DROP COLUMN IF EXISTS posted_by;
ALTER TABLE sales_orders      DROP COLUMN IF EXISTS posted_by;
ALTER TABLE deliveries        DROP COLUMN IF EXISTS posted_by;
ALTER TABLE stock_transfers   DROP COLUMN IF EXISTS posted_by;
ALTER TABLE stock_adjustments DROP COLUMN IF EXISTS posted_by;
ALTER TABLE stock_opnames     DROP COLUMN IF EXISTS posted_by;
