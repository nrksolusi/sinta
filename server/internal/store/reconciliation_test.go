package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// TestPoster_NegativeStockBooksProvisional verifies ADR-0003: an issue that
// drives stock below zero is not rejected. It books at the last known cost, is
// flagged provisional, and surfaces on the reconciliation worklist.
func TestPoster_NegativeStockBooksProvisional(t *testing.T) {
	f := seedFixture(t)
	p := store.NewPoster(appPool, costingEngine())
	ctx := context.Background()
	now := time.Now().UTC()

	// 10 @ 100, then issue 15 -> stock -5 at last known cost 100, provisional.
	if _, err := p.Post(ctx, posting.Request{
		TenantID: f.tenantID, DocType: "goods_receipt", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{receipt(f, f.whA, "10", "100", now)},
	}); err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	if _, err := p.Post(ctx, posting.Request{
		TenantID: f.tenantID, DocType: "delivery", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{issue(f, f.whA, "-15", true, now.Add(time.Second))},
	}); err != nil {
		t.Fatalf("post oversized issue: %v", err)
	}

	qty, avg := levelOf(t, f, f.whA)
	if !qty.Equal(dec(t, "-5")) {
		t.Fatalf("qty on hand = %s, want -5", qty)
	}
	if !avg.Equal(dec(t, "100")) {
		t.Fatalf("avg cost = %s, want 100 (last known cost)", avg)
	}

	// The provisional movement is on the worklist.
	q := store.New(withTenant(t, ctx, f.tenantID))
	work, err := q.ListProvisionalMovements(ctx, f.tenantID)
	if err != nil {
		t.Fatalf("worklist: %v", err)
	}
	if len(work) != 1 {
		t.Fatalf("worklist has %d entries, want 1", len(work))
	}
	if work[0].MovementType != string(stock.Issue) {
		t.Fatalf("worklist entry type = %s, want issue", work[0].MovementType)
	}
}

// TestPoster_ManualReconciliation exercises the M1 manual reconciliation path:
// the operator posts a cost_correction movement for the cost difference once the
// missing receipt arrives (ADR-0003). No automated emission at M1 (that is M2);
// the correction just adjusts booked value and re-averages the level.
func TestPoster_ManualReconciliation(t *testing.T) {
	f := seedFixture(t)
	p := store.NewPoster(appPool, costingEngine())
	ctx := context.Background()
	now := time.Now().UTC()

	// Issue with no stock: -5 at zero cost, provisional.
	if _, err := p.Post(ctx, posting.Request{
		TenantID: f.tenantID, DocType: "delivery", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{issue(f, f.whA, "-5", true, now)},
	}); err != nil {
		t.Fatalf("post provisional issue: %v", err)
	}
	qty, _ := levelOf(t, f, f.whA)
	if !qty.Equal(dec(t, "-5")) {
		t.Fatalf("qty = %s, want -5", qty)
	}

	// Reconciling receipt arrives: 20 @ 100 -> value now 20*100 + (-5*100 booked
	// at 100 after re-average) ... the receipt re-averages against the negative
	// position, and the level becomes 15 on hand.
	if _, err := p.Post(ctx, posting.Request{
		TenantID: f.tenantID, DocType: "goods_receipt", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{receipt(f, f.whA, "20", "100", now.Add(time.Second))},
	}); err != nil {
		t.Fatalf("post reconciling receipt: %v", err)
	}
	qty, avg := levelOf(t, f, f.whA)
	if !qty.Equal(dec(t, "15")) {
		t.Fatalf("qty after receipt = %s, want 15", qty)
	}
	// Value = -5*0 (issue booked at 0, no prior cost) + 20*100 = 2000 over 15.
	if !avg.Equal(dec(t, "133.3333333333")) {
		t.Fatalf("avg after receipt = %s, want 133.3333333333", avg)
	}

	// Operator posts a manual cost_correction (qty 0) to true up the provisional
	// value. This is the accepted M1 flow.
	corr := stock.Movement{
		Key:         stock.Key{ProductID: f.product, WarehouseID: f.whA},
		Qty:         decimal.Zero,
		UnitCost:    dec(t, "500"), // add 500 total value
		Type:        stock.CostCorrection,
		EffectiveAt: now.Add(2 * time.Second),
		CreatedBy:   f.userID,
	}
	if _, err := p.Post(ctx, posting.Request{
		TenantID: f.tenantID, DocType: "stock_adjustment", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{corr},
	}); err != nil {
		t.Fatalf("post correction: %v", err)
	}
	qty, avg = levelOf(t, f, f.whA)
	if !qty.Equal(dec(t, "15")) {
		t.Fatalf("qty after correction = %s, want 15 (unchanged)", qty)
	}
	// Value 2000 + 500 = 2500 over 15 -> 166.6666666667.
	if !avg.Equal(dec(t, "166.6666666667")) {
		t.Fatalf("avg after correction = %s, want 166.6666666667", avg)
	}
}

// withTenant returns a DBTX bound to a connection with app.tenant_id set, so the
// worklist query runs under RLS like real traffic. It leases a connection from
// the app pool for the duration of the test.
func withTenant(t *testing.T, ctx context.Context, tenantID uuid.UUID) store.DBTX {
	t.Helper()
	conn, err := appPool.Acquire(ctx)
	if err != nil {
		t.Fatalf("acquire: %v", err)
	}
	t.Cleanup(conn.Release)
	if _, err := conn.Exec(ctx, "SELECT set_config('app.tenant_id', $1, false)", tenantID.String()); err != nil {
		t.Fatalf("set tenant: %v", err)
	}
	return conn
}
