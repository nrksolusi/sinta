// Package stock defines the core value types of the movement journal - the
// append-only source of truth for stock (ADR-0001). These types are pure: no
// database or transport imports, so both costing engines and document posting
// exercise them with in-memory fixtures (PLAN.md section 2). This file is part
// of the Track 0 contract freeze; Tracks B, C, and D build against it.
package stock

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

// MovementType classifies a journal entry. The set is fixed and mirrors the
// stock_movements CHECK constraint (migration 0004).
type MovementType string

const (
	Receipt        MovementType = "receipt"
	Issue          MovementType = "issue"
	TransferIn     MovementType = "transfer_in"
	TransferOut    MovementType = "transfer_out"
	Adjustment     MovementType = "adjustment"
	Opname         MovementType = "opname"
	CostCorrection MovementType = "cost_correction"
	Revaluation    MovementType = "revaluation"
)

// Key identifies the stock position a movement belongs to. The journal is
// folded per Key, ordered by (EffectiveAt, Seq), to derive stock levels and
// valuations. BatchID is the zero UUID for stock that is not batch-tracked.
type Key struct {
	ProductID   uuid.UUID
	WarehouseID uuid.UUID
	BatchID     uuid.UUID
}

// Movement is one append-only journal entry (a row of stock_movements). Qty is
// signed and expressed in the product's base unit: positive adds to stock,
// negative removes it. UnitCost is the per-base-unit cost the movement carries
// (relevant for inbound movements and corrections). The Doc* fields link the
// movement to the document line that produced it; costing ignores them.
type Movement struct {
	ID          uuid.UUID
	Key         Key
	Qty         decimal.Decimal
	UnitCost    decimal.Decimal
	Type        MovementType
	DocType     string
	DocID       uuid.UUID
	DocLineID   uuid.UUID // zero when the movement is not line-specific
	EffectiveAt time.Time
	Seq         int64
	Provisional bool
	CreatedBy   uuid.UUID
}

// Valuation is the costed result of folding the journal for one Key up to and
// including a given movement. It is the common output of every costing engine
// (ADR-0002): weighted average (M1) and FIFO (M2) return the same shape, so
// callers do not depend on which engine ran.
type Valuation struct {
	MovementID uuid.UUID
	// QtyOnHand is the running base-unit quantity after this movement.
	QtyOnHand decimal.Decimal
	// UnitCost is the cost booked for this movement: for an issue, the cost the
	// engine assigned to what left; for a receipt, the cost that entered.
	UnitCost decimal.Decimal
	// ValueOnHand is the running total stock value after this movement.
	ValueOnHand decimal.Decimal
	// Provisional is true when the movement was valued below zero stock at last
	// known cost, awaiting reconciliation (D6).
	Provisional bool
}
