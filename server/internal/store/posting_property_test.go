package store_test

import (
	"context"
	"math/rand"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// TestPoster_QtyInvariant is the load-bearing property test at the store level
// (PLAN.md section 4): after ANY sequence of postings, for every key the sum of
// journal quantities equals stock_levels.qty_on_hand. This is what makes
// stock_levels a faithful, rebuildable cache over the append-only journal
// (ADR-0001). It also checks the journal's per-key seq is strictly increasing.
func TestPoster_QtyInvariant(t *testing.T) {
	f := seedFixture(t)
	p := store.NewPoster(appPool, costingEngine())
	ctx := context.Background()
	rng := rand.New(rand.NewSource(42))
	base := time.Now().UTC()

	warehouses := []uuid.UUID{f.whA, f.whB}

	for i := 0; i < 60; i++ {
		wh := warehouses[rng.Intn(len(warehouses))]
		var m stock.Movement
		switch rng.Intn(3) {
		case 0: // receipt
			m = receipt(f, wh,
				decimal.NewFromInt(int64(rng.Intn(50)+1)).String(),
				decimal.NewFromInt(int64(rng.Intn(1000)+1)).String(),
				base.Add(time.Duration(i)*time.Second))
		default: // issue (may go negative -> provisional)
			qty := -int64(rng.Intn(60) + 1)
			// The poster does not decide provisional; the caller flags it. In real
			// posting Track C computes this from current level. For the property
			// test we conservatively flag issues that likely go negative; the
			// invariant under test is quantity, independent of the flag.
			m = issue(f, wh, decimal.NewFromInt(qty).String(), false,
				base.Add(time.Duration(i)*time.Second))
		}
		if _, err := p.Post(ctx, posting.Request{
			TenantID: f.tenantID, DocType: "stock_adjustment", DocID: uuid.New(), Year: 2026,
			Movements: []stock.Movement{m},
		}); err != nil {
			t.Fatalf("post %d: %v", i, err)
		}
	}

	// For each warehouse key, sum(journal qty) must equal the level.
	for _, wh := range warehouses {
		var sumS string
		err := ownerPool.QueryRow(ctx,
			`SELECT COALESCE(SUM(qty_base),0)::text FROM stock_movements
			 WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3 AND batch_id IS NULL`,
			f.tenantID, f.product, wh).Scan(&sumS)
		if err != nil {
			t.Fatalf("sum journal: %v", err)
		}
		journalSum := dec(t, sumS)

		var levelS string
		err = ownerPool.QueryRow(ctx,
			`SELECT COALESCE(qty_on_hand,0)::text FROM stock_levels
			 WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3 AND batch_id IS NULL`,
			f.tenantID, f.product, wh).Scan(&levelS)
		if err != nil {
			// No movements posted to this warehouse: journal sum must be zero too.
			if journalSum.IsZero() {
				continue
			}
			t.Fatalf("read level for wh %v: %v", wh, err)
		}
		levelQty := dec(t, levelS)

		if !journalSum.Equal(levelQty) {
			t.Fatalf("invariant violated for wh %v: journal sum %s != level %s", wh, journalSum, levelQty)
		}

		assertSeqStrictlyIncreasing(t, ctx, f, wh)
	}
}

func assertSeqStrictlyIncreasing(t *testing.T, ctx context.Context, f fixture, wh uuid.UUID) {
	t.Helper()
	rows, err := ownerPool.Query(ctx,
		`SELECT seq FROM stock_movements
		 WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3 AND batch_id IS NULL
		 ORDER BY seq`,
		f.tenantID, f.product, wh)
	if err != nil {
		t.Fatalf("read seqs: %v", err)
	}
	defer rows.Close()
	seen := map[int64]bool{}
	var prev int64 = -1
	for rows.Next() {
		var s int64
		if err := rows.Scan(&s); err != nil {
			t.Fatalf("scan seq: %v", err)
		}
		if seen[s] {
			t.Fatalf("duplicate seq %d for wh %v", s, wh)
		}
		if s <= prev {
			t.Fatalf("seq not increasing (%d after %d) for wh %v", s, prev, wh)
		}
		seen[s] = true
		prev = s
	}
}
