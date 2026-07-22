package costing_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/stock"
)

// dec is a terse decimal constructor for fixtures.
func dec(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		panic(err)
	}
	return d
}

// mv builds a movement for one key at a given seq. EffectiveAt is derived from
// seq so the ordering the engine relies on is explicit in the fixtures.
func mv(seq int64, typ stock.MovementType, qty, unitCost string) stock.Movement {
	return stock.Movement{
		ID:          uuid.New(),
		Qty:         dec(qty),
		UnitCost:    dec(unitCost),
		Type:        typ,
		EffectiveAt: time.Date(2026, 1, 1, 0, 0, int(seq), 0, time.UTC),
		Seq:         seq,
	}
}

func TestAverageEngine_Method(t *testing.T) {
	e := costing.NewAverage()
	if e.Method() != costing.WeightedAverage {
		t.Fatalf("Method() = %q, want %q", e.Method(), costing.WeightedAverage)
	}
}

func TestAverageEngine_Empty(t *testing.T) {
	e := costing.NewAverage()
	got, err := e.Cost(nil)
	if err != nil {
		t.Fatalf("Cost(nil) error: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("Cost(nil) len = %d, want 0", len(got))
	}
}

func TestAverageEngine_Cost(t *testing.T) {
	tests := []struct {
		name string
		in   []stock.Movement
		want []stock.Valuation
	}{
		{
			name: "single receipt",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"),
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
			},
		},
		{
			name: "two receipts re-average",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"), // value 1000, avg 100
				mv(2, stock.Receipt, "10", "200"), // value 3000 over 20, avg 150
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				{QtyOnHand: dec("20"), UnitCost: dec("200"), ValueOnHand: dec("3000")},
			},
		},
		{
			name: "receipt then issue at current average",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"),
				mv(2, stock.Receipt, "10", "200"), // avg 150
				mv(3, stock.Issue, "-4", "0"),     // issue 4 at avg 150
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				{QtyOnHand: dec("20"), UnitCost: dec("200"), ValueOnHand: dec("3000")},
				// 16 left at avg 150 -> value 2400. Issue booked at 150.
				{QtyOnHand: dec("16"), UnitCost: dec("150"), ValueOnHand: dec("2400")},
			},
		},
		{
			name: "issue draining to exactly zero keeps average",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"),
				mv(2, stock.Issue, "-10", "0"),
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				{QtyOnHand: dec("0"), UnitCost: dec("100"), ValueOnHand: dec("0")},
			},
		},
		{
			name: "negative-stock issue books at last known cost, provisional",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"), // avg 100
				mv(2, stock.Issue, "-15", "0"),    // drives to -5, last known cost 100
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				// -5 * 100 = -500 value, provisional.
				{QtyOnHand: dec("-5"), UnitCost: dec("100"), ValueOnHand: dec("-500"), Provisional: true},
			},
		},
		{
			name: "issue with no prior stock books at zero cost, provisional",
			in: []stock.Movement{
				mv(1, stock.Issue, "-5", "0"),
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("-5"), UnitCost: dec("0"), ValueOnHand: dec("0"), Provisional: true},
			},
		},
		{
			name: "receipt onto negative stock re-averages against negative value",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"), // avg 100, value 1000
				mv(2, stock.Issue, "-15", "0"),    // -5, value -500, provisional
				mv(3, stock.Receipt, "20", "120"), // +20 @120 -> value -500+2400=1900 over 15 -> avg 126.6667
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				{QtyOnHand: dec("-5"), UnitCost: dec("100"), ValueOnHand: dec("-500"), Provisional: true},
				// The receipt books at the cost that entered (120); the resulting
				// average is 1900/15 = 126.6667, reflected in ValueOnHand/QtyOnHand.
				{QtyOnHand: dec("15"), UnitCost: dec("120"), ValueOnHand: dec("1900")},
			},
		},
		{
			name: "cost_correction adjusts value without changing quantity",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"),         // value 1000
				mv(2, stock.CostCorrection, "0", "20"),    // adds 10*20? no: correction carries qty 0, unit_cost is delta value
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				// correction adds unit_cost as a total value delta: +20 -> value 1020, avg 102
				{QtyOnHand: dec("10"), UnitCost: dec("102"), ValueOnHand: dec("1020")},
			},
		},
		{
			name: "adjustment positive re-averages like a receipt",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"),
				mv(2, stock.Adjustment, "5", "200"), // found stock: +5 @200 -> value 2000 over 15 -> avg 133.3333
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				// Books at the cost that entered (200); resulting average is 2000/15.
				{QtyOnHand: dec("15"), UnitCost: dec("200"), ValueOnHand: dec("2000")},
			},
		},
		{
			name: "adjustment negative consumes at current average",
			in: []stock.Movement{
				mv(1, stock.Receipt, "10", "100"),
				mv(2, stock.Adjustment, "-4", "0"), // waste 4 @avg 100
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("100"), ValueOnHand: dec("1000")},
				{QtyOnHand: dec("6"), UnitCost: dec("100"), ValueOnHand: dec("600")},
			},
		},
		{
			name: "transfer_in re-averages, transfer_out consumes",
			in: []stock.Movement{
				mv(1, stock.TransferIn, "10", "150"),
				mv(2, stock.TransferOut, "-3", "0"),
			},
			want: []stock.Valuation{
				{QtyOnHand: dec("10"), UnitCost: dec("150"), ValueOnHand: dec("1500")},
				{QtyOnHand: dec("7"), UnitCost: dec("150"), ValueOnHand: dec("1050")},
			},
		},
	}

	e := costing.NewAverage()
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := e.Cost(tc.in)
			if err != nil {
				t.Fatalf("Cost() error: %v", err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d", len(got), len(tc.want))
			}
			for i := range got {
				w := tc.want[i]
				g := got[i]
				if g.MovementID != tc.in[i].ID {
					t.Errorf("[%d] MovementID = %v, want %v", i, g.MovementID, tc.in[i].ID)
				}
				if !g.QtyOnHand.Equal(w.QtyOnHand) {
					t.Errorf("[%d] QtyOnHand = %s, want %s", i, g.QtyOnHand, w.QtyOnHand)
				}
				if !g.UnitCost.Equal(w.UnitCost) {
					t.Errorf("[%d] UnitCost = %s, want %s", i, g.UnitCost, w.UnitCost)
				}
				if !g.ValueOnHand.Equal(w.ValueOnHand) {
					t.Errorf("[%d] ValueOnHand = %s, want %s", i, g.ValueOnHand, w.ValueOnHand)
				}
				if g.Provisional != w.Provisional {
					t.Errorf("[%d] Provisional = %v, want %v", i, g.Provisional, w.Provisional)
				}
			}
		})
	}
}
