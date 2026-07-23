-- +goose Up

-- Trigram search support
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- PO and SO gain cancelled status (distinct from reversal, ADR-0018).
-- Stock documents keep draft|posted|reversed only.
ALTER TABLE purchase_orders DROP CONSTRAINT purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('draft', 'posted', 'reversed', 'cancelled'));

ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check
    CHECK (status IN ('draft', 'posted', 'reversed', 'cancelled'));

-- Tenant-level settings (ADR-0016 over-receipt tolerance, stubbed for now).
CREATE TABLE tenant_settings (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tolerance_over_receipt  numeric NOT NULL DEFAULT 0,
    CONSTRAINT tenant_settings_tenant_unique UNIQUE (tenant_id)
);
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_settings
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- Trigram indexes for typeahead search (ADR-0019)
CREATE INDEX products_name_trgm   ON products   USING gin (name gin_trgm_ops);
CREATE INDEX products_sku_trgm    ON products   USING gin (sku  gin_trgm_ops);
CREATE INDEX partners_name_trgm   ON partners   USING gin (name gin_trgm_ops);
CREATE INDEX partners_code_trgm   ON partners   USING gin (code gin_trgm_ops);
CREATE INDEX warehouses_name_trgm ON warehouses USING gin (name gin_trgm_ops);
CREATE INDEX warehouses_code_trgm ON warehouses USING gin (code gin_trgm_ops);

-- Supporting FK indexes for fulfillment rollup queries (ADR-0016)
CREATE INDEX goods_receipt_lines_po_line_id_idx
    ON goods_receipt_lines (purchase_order_line_id)
    WHERE purchase_order_line_id IS NOT NULL;

CREATE INDEX delivery_lines_so_line_id_idx
    ON delivery_lines (sales_order_line_id)
    WHERE sales_order_line_id IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS delivery_lines_so_line_id_idx;
DROP INDEX IF EXISTS goods_receipt_lines_po_line_id_idx;
DROP INDEX IF EXISTS warehouses_code_trgm;
DROP INDEX IF EXISTS warehouses_name_trgm;
DROP INDEX IF EXISTS partners_code_trgm;
DROP INDEX IF EXISTS partners_name_trgm;
DROP INDEX IF EXISTS products_sku_trgm;
DROP INDEX IF EXISTS products_name_trgm;
DROP TABLE IF EXISTS tenant_settings;
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;
ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check
    CHECK (status IN ('draft', 'posted', 'reversed'));
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN ('draft', 'posted', 'reversed'));
DROP EXTENSION IF EXISTS pg_trgm;
