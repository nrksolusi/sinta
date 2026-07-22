package costing

import (
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/stock"
)

// avgCostScale is the number of decimal places the weighted-average unit cost is
// rounded to. Quantities and total values are kept exact; only the derived
// per-unit average, which is a ratio and may not terminate, is rounded. Ten
// places is far finer than any currency and keeps golden fixtures stable.
const avgCostScale = 10

// Average is the weighted-average costing engine (ADR-0002, M1). It folds a
// key's ordered journal into per-movement valuations: inbound movements
// re-average the unit cost of stock on hand, outbound movements consume at the
// current average, and an issue that drives stock below zero books at the last
// known cost and is flagged provisional (ADR-0003). It is a pure function of
// the journal - no database access, no state of its own beyond the fold.
type Average struct{}

// NewAverage returns the weighted-average engine.
func NewAverage() Average { return Average{} }

// Method reports the valuation method (ADR-0002).
func (Average) Method() Method { return WeightedAverage }

// Cost folds the ordered movements of one stock key into per-movement
// valuations. The caller must pass movements for a single key, pre-sorted by
// (EffectiveAt, Seq); the engine does not sort. It returns one Valuation per
// input movement in the same order.
//
// Rules, tracking running quantity q and running total value v:
//   - Qty > 0 (receipt, transfer_in, positive adjustment): inbound. v += Qty*UnitCost,
//     q += Qty. Booked unit cost is the movement's own UnitCost.
//   - Qty < 0 (issue, transfer_out, negative adjustment): outbound. Consumed at the
//     current average (last known cost). v += Qty*avg, q += Qty. When the position
//     is at or below zero before the movement, or the movement drives it below
//     zero, the movement is provisional (ADR-0003): it was valued at last known
//     cost with no stock to back it, awaiting reconciliation.
//   - Qty == 0 (cost_correction): UnitCost is a total value delta. v += UnitCost,
//     q unchanged. This is how reconciliation and revaluation adjust booked cost
//     without touching quantity.
//
// The average is v/q, rounded to avgCostScale; it is zero when q is zero.
func (Average) Cost(ordered []stock.Movement) ([]stock.Valuation, error) {
	out := make([]stock.Valuation, 0, len(ordered))

	q := decimal.Zero // running quantity on hand
	v := decimal.Zero // running total value on hand

	for _, m := range ordered {
		var bookedUnitCost decimal.Decimal
		provisional := false

		switch {
		case m.Qty.IsPositive():
			// Inbound: re-average against whatever value is on hand, including a
			// negative value left by a prior provisional issue (ADR-0003).
			v = v.Add(m.Qty.Mul(m.UnitCost))
			q = q.Add(m.Qty)
			bookedUnitCost = m.UnitCost

		case m.Qty.IsNegative():
			// Outbound: consume at the current average (the last known cost).
			avg := average(q, v)
			bookedUnitCost = avg
			// Provisional when there is no positive stock backing the issue:
			// either the position was already <= 0, or this issue crosses below
			// zero.
			after := q.Add(m.Qty)
			if !q.IsPositive() || after.IsNegative() {
				provisional = true
			}
			v = v.Add(m.Qty.Mul(avg))
			q = after

		default:
			// Qty == 0: a cost correction. UnitCost carries a total value delta.
			v = v.Add(m.UnitCost)
			bookedUnitCost = average(q, v)
		}

		// A position at exactly zero quantity holds no value. Clearing here keeps
		// value coherent with quantity and discards the rounding residue a rounded
		// average leaves when stock is fully consumed. It never fires for a cost
		// correction, which leaves quantity unchanged.
		if q.IsZero() && !m.Qty.IsZero() {
			v = decimal.Zero
		}

		out = append(out, stock.Valuation{
			MovementID:  m.ID,
			QtyOnHand:   q,
			UnitCost:    bookedUnitCost,
			ValueOnHand: v,
			Provisional: provisional,
		})
	}

	return out, nil
}

// average returns v/q rounded to avgCostScale, or zero when q is zero.
func average(q, v decimal.Decimal) decimal.Decimal {
	if q.IsZero() {
		return decimal.Zero
	}
	return v.DivRound(q, avgCostScale)
}
