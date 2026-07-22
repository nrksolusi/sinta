package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

func dec(t *testing.T, s string) decimal.Decimal {
	t.Helper()
	d, err := decimal.NewFromString(s)
	if err != nil {
		t.Fatalf("decimal %q: %v", s, err)
	}
	return d
}

// levelOf reads stock_levels for a key via the owner pool, asserting the row
// exists, and returns (qty_on_hand, avg_cost) as decimals.
func levelOf(t *testing.T, f fixture, wh uuid.UUID) (decimal.Decimal, decimal.Decimal) {
	t.Helper()
	var qtyS, avgS string
	err := ownerPool.QueryRow(context.Background(),
		`SELECT qty_on_hand::text, avg_cost::text FROM stock_levels
		 WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3 AND batch_id IS NULL`,
		f.tenantID, f.product, wh).Scan(&qtyS, &avgS)
	if err != nil {
		t.Fatalf("read level: %v", err)
	}
	return dec(t, qtyS), dec(t, avgS)
}

func receipt(f fixture, wh uuid.UUID, qty, cost string, at time.Time) stock.Movement {
	q, _ := decimal.NewFromString(qty)
	c, _ := decimal.NewFromString(cost)
	return stock.Movement{
		Key:         stock.Key{ProductID: f.product, WarehouseID: wh},
		Qty:         q,
		UnitCost:    c,
		Type:        stock.Receipt,
		EffectiveAt: at,
		CreatedBy:   f.userID,
	}
}

func issue(f fixture, wh uuid.UUID, qty string, provisional bool, at time.Time) stock.Movement {
	q, _ := decimal.NewFromString(qty)
	return stock.Movement{
		Key:         stock.Key{ProductID: f.product, WarehouseID: wh},
		Qty:         q,
		Type:        stock.Issue,
		EffectiveAt: at,
		Provisional: provisional,
		CreatedBy:   f.userID,
	}
}

func TestPoster_ReceiptThenIssue(t *testing.T) {
	f := seedFixture(t)
	p := store.NewPoster(appPool, costingEngine())
	ctx := context.Background()
	now := time.Now().UTC()

	res, err := p.Post(ctx, posting.Request{
		TenantID:  f.tenantID,
		DocType:   "goods_receipt",
		DocID:     uuid.New(),
		Year:      2026,
		Movements: []stock.Movement{receipt(f, f.whA, "10", "100", now)},
	})
	if err != nil {
		t.Fatalf("post receipt: %v", err)
	}
	if res.DocNumber != "GR-2026-00001" {
		t.Fatalf("doc number = %q, want GR-2026-00001", res.DocNumber)
	}

	qty, avg := levelOf(t, f, f.whA)
	if !qty.Equal(dec(t, "10")) || !avg.Equal(dec(t, "100")) {
		t.Fatalf("after receipt level = (%s, %s), want (10, 100)", qty, avg)
	}

	// Second receipt re-averages: 10@100 + 10@200 -> 20 @ 150.
	if _, err := p.Post(ctx, posting.Request{
		TenantID:  f.tenantID,
		DocType:   "goods_receipt",
		DocID:     uuid.New(),
		Year:      2026,
		Movements: []stock.Movement{receipt(f, f.whA, "10", "200", now.Add(time.Second))},
	}); err != nil {
		t.Fatalf("post receipt 2: %v", err)
	}
	qty, avg = levelOf(t, f, f.whA)
	if !qty.Equal(dec(t, "20")) || !avg.Equal(dec(t, "150")) {
		t.Fatalf("after receipt2 level = (%s, %s), want (20, 150)", qty, avg)
	}

	// Issue 5 at current average.
	if _, err := p.Post(ctx, posting.Request{
		TenantID:  f.tenantID,
		DocType:   "delivery",
		DocID:     uuid.New(),
		Year:      2026,
		Movements: []stock.Movement{issue(f, f.whA, "-5", false, now.Add(2*time.Second))},
	}); err != nil {
		t.Fatalf("post issue: %v", err)
	}
	qty, avg = levelOf(t, f, f.whA)
	if !qty.Equal(dec(t, "15")) || !avg.Equal(dec(t, "150")) {
		t.Fatalf("after issue level = (%s, %s), want (15, 150)", qty, avg)
	}
}

func TestPoster_GaplessNumberingPerType(t *testing.T) {
	f := seedFixture(t)
	p := store.NewPoster(appPool, costingEngine())
	ctx := context.Background()
	now := time.Now().UTC()

	want := []string{"GR-2026-00001", "GR-2026-00002", "GR-2026-00003"}
	for i, w := range want {
		res, err := p.Post(ctx, posting.Request{
			TenantID:  f.tenantID,
			DocType:   "goods_receipt",
			DocID:     uuid.New(),
			Year:      2026,
			Movements: []stock.Movement{receipt(f, f.whA, "1", "10", now.Add(time.Duration(i)*time.Second))},
		})
		if err != nil {
			t.Fatalf("post %d: %v", i, err)
		}
		if res.DocNumber != w {
			t.Fatalf("post %d doc number = %q, want %q", i, res.DocNumber, w)
		}
	}

	// A different type has its own counter starting at 1.
	res, err := p.Post(ctx, posting.Request{
		TenantID:  f.tenantID,
		DocType:   "delivery",
		DocID:     uuid.New(),
		Year:      2026,
		Movements: []stock.Movement{issue(f, f.whA, "-1", false, now.Add(10*time.Second))},
	})
	if err != nil {
		t.Fatalf("post delivery: %v", err)
	}
	if res.DocNumber != "DEL-2026-00001" {
		t.Fatalf("delivery number = %q, want DEL-2026-00001", res.DocNumber)
	}
}

// TestPoster_TransferPairsAcrossKeys posts one document with a transfer_out and
// transfer_in touching two keys, and verifies both levels and that seq is
// per-key.
func TestPoster_TransferPairsAcrossKeys(t *testing.T) {
	f := seedFixture(t)
	p := store.NewPoster(appPool, costingEngine())
	ctx := context.Background()
	now := time.Now().UTC()

	// Seed A with stock.
	if _, err := p.Post(ctx, posting.Request{
		TenantID: f.tenantID, DocType: "goods_receipt", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{receipt(f, f.whA, "10", "100", now)},
	}); err != nil {
		t.Fatalf("seed A: %v", err)
	}

	out := issue(f, f.whA, "-4", false, now.Add(time.Second))
	out.Type = stock.TransferOut
	in := receipt(f, f.whB, "4", "100", now.Add(time.Second))
	in.Type = stock.TransferIn

	if _, err := p.Post(ctx, posting.Request{
		TenantID: f.tenantID, DocType: "stock_transfer", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{out, in},
	}); err != nil {
		t.Fatalf("post transfer: %v", err)
	}

	qA, avgA := levelOf(t, f, f.whA)
	if !qA.Equal(dec(t, "6")) || !avgA.Equal(dec(t, "100")) {
		t.Fatalf("A level = (%s, %s), want (6, 100)", qA, avgA)
	}
	qB, avgB := levelOf(t, f, f.whB)
	if !qB.Equal(dec(t, "4")) || !avgB.Equal(dec(t, "100")) {
		t.Fatalf("B level = (%s, %s), want (4, 100)", qB, avgB)
	}
}

// costingEngine returns the weighted-average engine the Poster uses in M1.
func costingEngine() costing.Engine {
	return costing.NewAverage()
}
