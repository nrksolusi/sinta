package store_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// TestPoster_ConcurrentSameKey posts many receipts to one key from several
// goroutines at once. The per-key advisory lock (PLAN.md section 3) must
// serialize them so that: no two movements share a seq, the number of journal
// rows equals the number of postings, and the final stock level equals the sum
// of all posted quantities. Without the lock, concurrent MaxMovementSeq reads
// would hand out duplicate seqs and the level would be corrupted.
func TestPoster_ConcurrentSameKey(t *testing.T) {
	f := seedFixture(t)
	p := store.NewPoster(appPool, costingEngine())
	ctx := context.Background()
	base := time.Now().UTC()

	const goroutines = 8
	const perGoroutine = 10
	const total = goroutines * perGoroutine

	var wg sync.WaitGroup
	errs := make(chan error, total)
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < perGoroutine; i++ {
				m := receipt(f, f.whA, "1", "100",
					base.Add(time.Duration(g*perGoroutine+i)*time.Millisecond))
				_, err := p.Post(ctx, posting.Request{
					TenantID: f.tenantID, DocType: "goods_receipt", DocID: uuid.New(), Year: 2026,
					Movements: []stock.Movement{m},
				})
				if err != nil {
					errs <- err
					return
				}
			}
		}(g)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent post: %v", err)
	}

	// Exactly `total` journal rows, all with distinct seqs 1..total.
	var count int64
	if err := ownerPool.QueryRow(ctx,
		`SELECT count(*) FROM stock_movements
		 WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3`,
		f.tenantID, f.product, f.whA).Scan(&count); err != nil {
		t.Fatalf("count movements: %v", err)
	}
	if count != total {
		t.Fatalf("journal has %d rows, want %d", count, total)
	}

	var distinctSeq int64
	if err := ownerPool.QueryRow(ctx,
		`SELECT count(DISTINCT seq) FROM stock_movements
		 WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3`,
		f.tenantID, f.product, f.whA).Scan(&distinctSeq); err != nil {
		t.Fatalf("count distinct seq: %v", err)
	}
	if distinctSeq != total {
		t.Fatalf("distinct seq count = %d, want %d (advisory lock did not serialize)", distinctSeq, total)
	}

	// Level equals the journal sum.
	qty, _ := levelOf(t, f, f.whA)
	if !qty.Equal(decimal.NewFromInt(total)) {
		t.Fatalf("final qty on hand = %s, want %d", qty, total)
	}

	// Document numbers are gapless: the counter reached exactly `total`.
	var nextSeq int64
	if err := ownerPool.QueryRow(ctx,
		`SELECT next_seq FROM document_number_sequences
		 WHERE tenant_id=$1 AND doc_type='goods_receipt' AND year=2026`,
		f.tenantID).Scan(&nextSeq); err != nil {
		t.Fatalf("read counter: %v", err)
	}
	if nextSeq != total+1 {
		t.Fatalf("next_seq = %d, want %d", nextSeq, total+1)
	}
}
