// Package costing defines the valuation engine contract. Weighted average (M1)
// and FIFO (M2) both implement Engine over the same ordered journal slice, so
// documents and reports depend only on this interface, not on which engine runs
// (ADR-0002). Engines are pure functions of the journal, with no database
// access - this is what makes the dual-engine risk (D3) survivable via
// in-memory fixtures. Part of the Track 0 contract freeze; the implementations
// land in Track B (weighted average) and M2 (FIFO).
package costing

import (
	"github.com/nrksolusi/sinta/internal/domain/stock"
)

// Method names a valuation engine. Values match tenants.costing_method and the
// CostingMethod wire enum.
type Method string

const (
	WeightedAverage Method = "weighted_average"
	FIFO            Method = "fifo"
)

// Engine values a single stock key's movements. The caller passes the movements
// for one stock.Key, pre-sorted by (EffectiveAt, Seq); the engine folds them
// and returns one Valuation per input movement, in the same order.
type Engine interface {
	// Method reports which valuation method this engine implements.
	Method() Method
	// Cost folds the ordered movements of one key into per-movement valuations.
	// It returns an error only for inputs the engine cannot value; a normal
	// negative-stock issue is valued at last known cost and marked provisional
	// (D6), not rejected.
	Cost(ordered []stock.Movement) ([]stock.Valuation, error)
}
