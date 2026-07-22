package costing_test

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/stock"
)

var update = flag.Bool("update", false, "update golden files")

// TestAverageEngine_Golden folds a full receive -> deliver -> adjust ->
// negative-issue -> reconcile sequence and compares the rendered valuations to
// a committed golden file. Run with -update to regenerate.
func TestAverageEngine_Golden(t *testing.T) {
	journal := []stock.Movement{
		mv(1, stock.Receipt, "100", "5000"),      // 100 @ 5000
		mv(2, stock.Receipt, "50", "6000"),       // re-average
		mv(3, stock.Issue, "-30", "0"),           // consume at avg
		mv(4, stock.Adjustment, "-2", "0"),       // waste 2 at avg
		mv(5, stock.TransferOut, "-40", "0"),     // consume at avg
		mv(6, stock.Issue, "-90", "0"),           // drives negative -> provisional
		mv(7, stock.Receipt, "100", "6500"),      // reconciling receipt re-averages
		mv(8, stock.CostCorrection, "0", "12000"), // manual cost correction (value delta)
	}

	e := costing.NewAverage()
	got, err := e.Cost(journal)
	if err != nil {
		t.Fatalf("Cost() error: %v", err)
	}

	var b strings.Builder
	b.WriteString("idx  type            qty         provisional  qty_on_hand   unit_cost         value_on_hand\n")
	for i, v := range got {
		fmt.Fprintf(&b, "%-3d  %-14s  %-10s  %-11t  %-12s  %-16s  %s\n",
			i,
			journal[i].Type,
			journal[i].Qty.String(),
			v.Provisional,
			v.QtyOnHand.String(),
			v.UnitCost.String(),
			v.ValueOnHand.String(),
		)
	}
	rendered := b.String()

	goldenPath := filepath.Join("testdata", "average_golden.txt")
	if *update {
		if err := os.MkdirAll(filepath.Dir(goldenPath), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(goldenPath, []byte(rendered), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}

	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden (run with -update to create): %v", err)
	}
	if rendered != string(want) {
		t.Errorf("golden mismatch:\n--- got ---\n%s\n--- want ---\n%s", rendered, want)
	}
}
