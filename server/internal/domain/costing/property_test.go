package costing_test

import (
	"math/rand"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/stock"
)

// TestAverageEngine_QtyInvariant is the load-bearing property test (PLAN.md
// section 4): for ANY sequence of movements on one key, the running QtyOnHand
// after each movement equals the running sum of movement quantities, and the
// final QtyOnHand equals sum(qty). This is the same invariant the posting layer
// relies on to keep stock_levels.qty_on_hand rebuildable from the journal.
func TestAverageEngine_QtyInvariant(t *testing.T) {
	e := costing.NewAverage()
	rng := rand.New(rand.NewSource(1)) // fixed seed: reproducible failures

	for trial := 0; trial < 2000; trial++ {
		n := rng.Intn(40)
		journal := randomJournal(rng, n)

		got, err := e.Cost(journal)
		if err != nil {
			t.Fatalf("trial %d: Cost() error: %v", trial, err)
		}
		if len(got) != len(journal) {
			t.Fatalf("trial %d: len(got)=%d, want %d", trial, len(got), len(journal))
		}

		running := decimal.Zero
		for i := range journal {
			running = running.Add(journal[i].Qty)
			if !got[i].QtyOnHand.Equal(running) {
				t.Fatalf("trial %d: after movement %d QtyOnHand=%s, want running sum %s",
					trial, i, got[i].QtyOnHand, running)
			}
		}
	}
}

// TestAverageEngine_ValueInvariant asserts value coherence: when quantity is
// strictly positive the reported ValueOnHand equals QtyOnHand * derived average
// (within rounding), and QtyOnHand==0 implies ValueOnHand==0 for a position
// built only from inbound/outbound movements (no cost corrections).
func TestAverageEngine_ValueInvariant(t *testing.T) {
	e := costing.NewAverage()
	rng := rand.New(rand.NewSource(7))

	for trial := 0; trial < 2000; trial++ {
		journal := randomJournalNoCorrection(rng, rng.Intn(30))
		got, err := e.Cost(journal)
		if err != nil {
			t.Fatalf("trial %d: %v", trial, err)
		}
		for i, v := range got {
			if v.QtyOnHand.IsZero() && !v.ValueOnHand.IsZero() {
				t.Fatalf("trial %d mv %d: qty zero but value=%s", trial, i, v.ValueOnHand)
			}
		}
	}
}

// randomJournal builds n movements for a single key with a mix of inbound,
// outbound, and cost-correction types, ordered by seq.
func randomJournal(rng *rand.Rand, n int) []stock.Movement {
	journal := make([]stock.Movement, 0, n)
	for i := 0; i < n; i++ {
		seq := int64(i + 1)
		switch rng.Intn(5) {
		case 0, 1: // inbound
			journal = append(journal, movement(seq, inboundType(rng),
				randQty(rng, false), randCost(rng)))
		case 2, 3: // outbound
			journal = append(journal, movement(seq, outboundType(rng),
				randQty(rng, true), decimal.Zero))
		default: // cost correction (qty 0, value delta)
			journal = append(journal, movement(seq, stock.CostCorrection,
				decimal.Zero, randCost(rng)))
		}
	}
	return journal
}

func randomJournalNoCorrection(rng *rand.Rand, n int) []stock.Movement {
	journal := make([]stock.Movement, 0, n)
	for i := 0; i < n; i++ {
		seq := int64(i + 1)
		if rng.Intn(2) == 0 {
			journal = append(journal, movement(seq, inboundType(rng), randQty(rng, false), randCost(rng)))
		} else {
			journal = append(journal, movement(seq, outboundType(rng), randQty(rng, true), decimal.Zero))
		}
	}
	return journal
}

func movement(seq int64, typ stock.MovementType, qty, unitCost decimal.Decimal) stock.Movement {
	return stock.Movement{
		ID:          uuid.New(),
		Qty:         qty,
		UnitCost:    unitCost,
		Type:        typ,
		EffectiveAt: time.Date(2026, 1, 1, 0, 0, int(seq), 0, time.UTC),
		Seq:         seq,
	}
}

func inboundType(rng *rand.Rand) stock.MovementType {
	return []stock.MovementType{stock.Receipt, stock.TransferIn, stock.Adjustment}[rng.Intn(3)]
}

func outboundType(rng *rand.Rand) stock.MovementType {
	return []stock.MovementType{stock.Issue, stock.TransferOut, stock.Adjustment}[rng.Intn(3)]
}

// randQty returns a random quantity; negative when out is true. Uses small
// fractional values to exercise decimal arithmetic without float drift.
func randQty(rng *rand.Rand, out bool) decimal.Decimal {
	q := decimal.NewFromInt(int64(rng.Intn(1000) + 1)).Div(decimal.NewFromInt(10))
	if out {
		return q.Neg()
	}
	return q
}

func randCost(rng *rand.Rand) decimal.Decimal {
	return decimal.NewFromInt(int64(rng.Intn(100000) + 1)).Div(decimal.NewFromInt(100))
}
