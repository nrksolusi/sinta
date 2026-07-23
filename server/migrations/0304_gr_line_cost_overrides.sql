-- +goose Up

-- Audit log for goods receipt line cost overrides (ADR-0017).
-- An entry is written only when an owner/admin explicitly sets a unit_cost
-- that differs from the linked PO line's unit_cost (or enters any cost on a
-- receipt that has no PO link). Non-privileged roles cannot change cost at all.
CREATE TABLE goods_receipt_line_cost_overrides (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    goods_receipt_line_id uuid NOT NULL REFERENCES goods_receipt_lines(id) ON DELETE CASCADE,
    po_line_unit_cost    numeric NOT NULL,
    override_unit_cost   numeric NOT NULL,
    actor_user_id        uuid NOT NULL REFERENCES users(id),
    created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goods_receipt_line_cost_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON goods_receipt_line_cost_overrides
    USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- +goose Down
DROP TABLE IF EXISTS goods_receipt_line_cost_overrides;
