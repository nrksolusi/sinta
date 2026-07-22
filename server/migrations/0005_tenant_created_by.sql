-- Track who created each tenant so the self-serve activation soft cap
-- (ADR-0012) can count lifetime creations per user. Pre-existing tenants keep
-- NULL and count toward nobody's cap.

-- +goose Up

ALTER TABLE tenants
    ADD COLUMN created_by uuid REFERENCES users (id) ON DELETE SET NULL;

-- +goose Down

ALTER TABLE tenants
    DROP COLUMN created_by;
