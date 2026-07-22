-- +goose Up
-- INC-3: snapshot the on-hand qty at post time so the posted berita acara can
-- display System / Counted / Selisih without re-reading current stock levels.
ALTER TABLE stock_opname_lines ADD COLUMN IF NOT EXISTS system_qty numeric;

-- +goose Down
ALTER TABLE stock_opname_lines DROP COLUMN IF EXISTS system_qty;
