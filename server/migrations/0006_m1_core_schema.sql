-- M1 core schema (PLAN.md section 3): catalog, the append-only movement
-- journal, the derived stock-levels cache, all order documents, and the gapless
-- document-number counter. This is the Track 0 schema freeze - one wave so the
-- parallel M1 tracks build against stable tables (docs/plans/m1-parallel.md).
--
-- Conventions (established in 0001-0003):
--   - UUIDv7 PKs (uuidv7(), native in Postgres 18), ADR-0009.
--   - timestamptz for *_at columns; date for business dates that are day-grained.
--   - Quantities and money are numeric, never float; quantities in base units.
--   - Every tenant-owned table: tenant_id + fail-closed RLS (ADR-0004) + a grant
--     to sinta_app. Fail-closed = invisible without an explicit app.tenant_id, so
--     a handler that forgets tenantTx surfaces immediately (0003 rationale).

-- +goose Up

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE products (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    sku text NOT NULL,
    name text NOT NULL,
    base_uom text NOT NULL,
    is_batch_tracked boolean NOT NULL DEFAULT false,
    barcode text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, sku)
);

-- Barcode is optional but unique within a tenant when present.
CREATE UNIQUE INDEX products_tenant_barcode_idx
    ON products (tenant_id, barcode) WHERE barcode IS NOT NULL;

CREATE TABLE product_uoms (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    uom text NOT NULL,
    -- carton = 24 pcs -> factor_to_base = 24; must be positive.
    factor_to_base numeric NOT NULL CHECK (factor_to_base > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, product_id, uom)
);

CREATE TABLE batches (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    batch_no text NOT NULL,
    expiry_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, product_id, batch_no)
);

CREATE INDEX batches_product_expiry_idx ON batches (tenant_id, product_id, expiry_date);

-- One partner table with type flags: a partner may be a supplier, a customer,
-- or both (PLAN.md section 3, glossary "Partner").
CREATE TABLE partners (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    code text,
    name text NOT NULL,
    is_supplier boolean NOT NULL DEFAULT false,
    is_customer boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (is_supplier OR is_customer)
);

CREATE UNIQUE INDEX partners_tenant_code_idx
    ON partners (tenant_id, code) WHERE code IS NOT NULL;

-- Optional warehouse scoping per membership (D10). Empty set = all warehouses.
CREATE TABLE membership_warehouses (
    membership_id uuid NOT NULL REFERENCES memberships (id) ON DELETE CASCADE,
    warehouse_id uuid NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    PRIMARY KEY (membership_id, warehouse_id)
);

-- ---------------------------------------------------------------------------
-- Movement journal (append-only, the sole source of truth for stock)
-- ADR-0001, ADR-0003. No UPDATE or DELETE, ever - enforced by trigger below.
-- ---------------------------------------------------------------------------

CREATE TABLE stock_movements (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products (id),
    warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    batch_id uuid REFERENCES batches (id),
    qty_base numeric NOT NULL,
    unit_cost numeric NOT NULL DEFAULT 0,
    movement_type text NOT NULL CHECK (movement_type IN (
        'receipt', 'issue', 'transfer_in', 'transfer_out',
        'adjustment', 'opname', 'cost_correction', 'revaluation')),
    doc_type text NOT NULL,
    doc_id uuid NOT NULL,
    doc_line_id uuid,
    -- Business date the movement counts from; enables backdating (D7).
    effective_at timestamptz NOT NULL,
    -- Per-key ordering tiebreaker for movements sharing an effective_at.
    seq bigint NOT NULL,
    is_provisional boolean NOT NULL DEFAULT false,
    reconciled_by_movement_id uuid REFERENCES stock_movements (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id)
);

-- The ordered fold that drives stock levels and both costing engines walks the
-- journal per (product, warehouse, batch) by (effective_at, seq).
CREATE INDEX stock_movements_key_order_idx ON stock_movements
    (tenant_id, product_id, warehouse_id, batch_id, effective_at, seq);

CREATE INDEX stock_movements_doc_idx ON stock_movements (tenant_id, doc_type, doc_id);

CREATE INDEX stock_movements_provisional_idx ON stock_movements (tenant_id)
    WHERE is_provisional;

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION stock_movements_append_only()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'stock_movements is append-only: % is not allowed (ADR-0001); post a correcting movement instead', TG_OP;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

CREATE TRIGGER stock_movements_no_mutate
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION stock_movements_append_only();

-- ---------------------------------------------------------------------------
-- Stock levels (derived cache over the journal, never authoritative)
-- ---------------------------------------------------------------------------

CREATE TABLE stock_levels (
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    warehouse_id uuid NOT NULL REFERENCES warehouses (id) ON DELETE CASCADE,
    batch_id uuid REFERENCES batches (id) ON DELETE CASCADE,
    qty_on_hand numeric NOT NULL DEFAULT 0,
    avg_cost numeric NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- NULLS NOT DISTINCT (Postgres 15+) so the no-batch row is unique per key.
    UNIQUE NULLS NOT DISTINCT (tenant_id, product_id, warehouse_id, batch_id)
);

-- ---------------------------------------------------------------------------
-- Documents (shared shape: draft -> posted; posted is immutable, enforced in
-- the posting layer. Cancellation is a reversal document, not a delete.)
-- doc_number is assigned only at posting (gapless), so it is null while draft.
-- ---------------------------------------------------------------------------

CREATE TABLE purchase_orders (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    supplier_id uuid NOT NULL REFERENCES partners (id),
    warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    doc_date date NOT NULL,
    notes text NOT NULL DEFAULT '',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id),
    UNIQUE (tenant_id, doc_number)
);

CREATE TABLE purchase_order_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    purchase_order_id uuid NOT NULL REFERENCES purchase_orders (id) ON DELETE CASCADE,
    line_no int NOT NULL,
    product_id uuid NOT NULL REFERENCES products (id),
    uom text NOT NULL,
    qty numeric NOT NULL CHECK (qty > 0),
    unit_cost numeric NOT NULL DEFAULT 0,
    UNIQUE (purchase_order_id, line_no)
);

CREATE TABLE goods_receipts (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    purchase_order_id uuid REFERENCES purchase_orders (id),
    supplier_id uuid NOT NULL REFERENCES partners (id),
    warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    doc_date date NOT NULL,
    notes text NOT NULL DEFAULT '',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id),
    UNIQUE (tenant_id, doc_number)
);

CREATE TABLE goods_receipt_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    goods_receipt_id uuid NOT NULL REFERENCES goods_receipts (id) ON DELETE CASCADE,
    line_no int NOT NULL,
    purchase_order_line_id uuid REFERENCES purchase_order_lines (id),
    product_id uuid NOT NULL REFERENCES products (id),
    batch_id uuid REFERENCES batches (id),
    uom text NOT NULL,
    qty numeric NOT NULL CHECK (qty > 0),
    unit_cost numeric NOT NULL DEFAULT 0,
    UNIQUE (goods_receipt_id, line_no)
);

CREATE TABLE sales_orders (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    customer_id uuid NOT NULL REFERENCES partners (id),
    warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    doc_date date NOT NULL,
    notes text NOT NULL DEFAULT '',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id),
    UNIQUE (tenant_id, doc_number)
);

CREATE TABLE sales_order_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    sales_order_id uuid NOT NULL REFERENCES sales_orders (id) ON DELETE CASCADE,
    line_no int NOT NULL,
    product_id uuid NOT NULL REFERENCES products (id),
    uom text NOT NULL,
    qty numeric NOT NULL CHECK (qty > 0),
    unit_price numeric NOT NULL DEFAULT 0,
    UNIQUE (sales_order_id, line_no)
);

CREATE TABLE deliveries (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    sales_order_id uuid REFERENCES sales_orders (id),
    customer_id uuid NOT NULL REFERENCES partners (id),
    warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    doc_date date NOT NULL,
    notes text NOT NULL DEFAULT '',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id),
    UNIQUE (tenant_id, doc_number)
);

CREATE TABLE delivery_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    delivery_id uuid NOT NULL REFERENCES deliveries (id) ON DELETE CASCADE,
    line_no int NOT NULL,
    sales_order_line_id uuid REFERENCES sales_order_lines (id),
    product_id uuid NOT NULL REFERENCES products (id),
    batch_id uuid REFERENCES batches (id),
    uom text NOT NULL,
    qty numeric NOT NULL CHECK (qty > 0),
    UNIQUE (delivery_id, line_no)
);

CREATE TABLE stock_transfers (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    from_warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    to_warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    doc_date date NOT NULL,
    notes text NOT NULL DEFAULT '',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id),
    UNIQUE (tenant_id, doc_number),
    CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE stock_transfer_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    stock_transfer_id uuid NOT NULL REFERENCES stock_transfers (id) ON DELETE CASCADE,
    line_no int NOT NULL,
    product_id uuid NOT NULL REFERENCES products (id),
    batch_id uuid REFERENCES batches (id),
    uom text NOT NULL,
    qty numeric NOT NULL CHECK (qty > 0),
    UNIQUE (stock_transfer_id, line_no)
);

CREATE TABLE stock_adjustments (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    reason text NOT NULL DEFAULT '',
    doc_date date NOT NULL,
    notes text NOT NULL DEFAULT '',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id),
    UNIQUE (tenant_id, doc_number)
);

CREATE TABLE stock_adjustment_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    stock_adjustment_id uuid NOT NULL REFERENCES stock_adjustments (id) ON DELETE CASCADE,
    line_no int NOT NULL,
    product_id uuid NOT NULL REFERENCES products (id),
    batch_id uuid REFERENCES batches (id),
    uom text NOT NULL,
    -- Signed: positive is found stock, negative is waste/damage.
    qty numeric NOT NULL CHECK (qty <> 0),
    unit_cost numeric NOT NULL DEFAULT 0,
    UNIQUE (stock_adjustment_id, line_no)
);

CREATE TABLE stock_opnames (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_number text,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
    warehouse_id uuid NOT NULL REFERENCES warehouses (id),
    doc_date date NOT NULL,
    notes text NOT NULL DEFAULT '',
    posted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL REFERENCES users (id),
    UNIQUE (tenant_id, doc_number)
);

CREATE TABLE stock_opname_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    stock_opname_id uuid NOT NULL REFERENCES stock_opnames (id) ON DELETE CASCADE,
    line_no int NOT NULL,
    product_id uuid NOT NULL REFERENCES products (id),
    batch_id uuid REFERENCES batches (id),
    uom text NOT NULL,
    -- Counted physical quantity; variance vs system is computed at posting.
    counted_qty numeric NOT NULL CHECK (counted_qty >= 0),
    UNIQUE (stock_opname_id, line_no)
);

-- ---------------------------------------------------------------------------
-- Gapless document numbering counter (ADR-0010). One row per tenant, doc type,
-- and year; incremented under advisory lock at posting. The rendered format is
-- the default template ({TYPE}-{YYYY}-{NNNNN}) in M1; the configurable template
-- lands in M2.
-- ---------------------------------------------------------------------------

CREATE TABLE document_number_sequences (
    tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
    doc_type text NOT NULL,
    year int NOT NULL,
    next_seq bigint NOT NULL DEFAULT 1,
    PRIMARY KEY (tenant_id, doc_type, year)
);

-- ---------------------------------------------------------------------------
-- RLS: every table above is tenant-owned domain data -> fail-closed policy.
-- ---------------------------------------------------------------------------

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opnames ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_tenant_isolation ON products USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY product_uoms_tenant_isolation ON product_uoms USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY batches_tenant_isolation ON batches USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY partners_tenant_isolation ON partners USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY membership_warehouses_tenant_isolation ON membership_warehouses USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_movements_tenant_isolation ON stock_movements USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_levels_tenant_isolation ON stock_levels USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY purchase_orders_tenant_isolation ON purchase_orders USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY purchase_order_lines_tenant_isolation ON purchase_order_lines USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY goods_receipts_tenant_isolation ON goods_receipts USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY goods_receipt_lines_tenant_isolation ON goods_receipt_lines USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY sales_orders_tenant_isolation ON sales_orders USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY sales_order_lines_tenant_isolation ON sales_order_lines USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY deliveries_tenant_isolation ON deliveries USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY delivery_lines_tenant_isolation ON delivery_lines USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_transfers_tenant_isolation ON stock_transfers USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_transfer_lines_tenant_isolation ON stock_transfer_lines USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_adjustments_tenant_isolation ON stock_adjustments USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_adjustment_lines_tenant_isolation ON stock_adjustment_lines USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_opnames_tenant_isolation ON stock_opnames USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY stock_opname_lines_tenant_isolation ON stock_opname_lines USING (tenant_id::text = current_setting('app.tenant_id', true));
CREATE POLICY document_number_sequences_tenant_isolation ON document_number_sequences USING (tenant_id::text = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON
    products, product_uoms, batches, partners, membership_warehouses,
    stock_movements, stock_levels,
    purchase_orders, purchase_order_lines,
    goods_receipts, goods_receipt_lines,
    sales_orders, sales_order_lines,
    deliveries, delivery_lines,
    stock_transfers, stock_transfer_lines,
    stock_adjustments, stock_adjustment_lines,
    stock_opnames, stock_opname_lines,
    document_number_sequences
    TO sinta_app;

-- +goose Down

DROP TABLE document_number_sequences;
DROP TABLE stock_opname_lines;
DROP TABLE stock_opnames;
DROP TABLE stock_adjustment_lines;
DROP TABLE stock_adjustments;
DROP TABLE stock_transfer_lines;
DROP TABLE stock_transfers;
DROP TABLE delivery_lines;
DROP TABLE deliveries;
DROP TABLE sales_order_lines;
DROP TABLE sales_orders;
DROP TABLE goods_receipt_lines;
DROP TABLE goods_receipts;
DROP TABLE purchase_order_lines;
DROP TABLE purchase_orders;
DROP TABLE stock_levels;
DROP TRIGGER stock_movements_no_mutate ON stock_movements;
DROP FUNCTION stock_movements_append_only();
DROP TABLE stock_movements;
DROP TABLE membership_warehouses;
DROP TABLE partners;
DROP TABLE batches;
DROP TABLE product_uoms;
DROP TABLE products;
