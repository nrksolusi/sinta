package httpserver_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
)

// docFixture is a seeded tenant with a warehouse pair, a product, a supplier, and
// a customer, plus a logged-in owner cookie with that tenant active. Track A's
// catalog endpoints live on another branch, so prerequisites are seeded straight
// into the database (docs/plans/m1-parallel.md).
type docFixture struct {
	ts       *httptest.Server
	cookie   *http.Cookie
	tenantID string
	whA      string
	whB      string
	product  string
	supplier string
	customer string
}

func seedDocFixture(t *testing.T) docFixture {
	t.Helper()
	ctx := context.Background()
	ts := newTestServer(t)
	registerUser(t, ts, "gudang@toko.co.id", "kata-sandi-panjang")
	tenantID := seedTenantWithMembership(t, "gudang@toko.co.id", "PT Gudang", "owner")

	f := docFixture{ts: ts, tenantID: tenantID}
	f.whA = uuid.NewString()
	f.whB = uuid.NewString()
	f.product = uuid.NewString()
	f.supplier = uuid.NewString()
	f.customer = uuid.NewString()

	exec := func(sql string, args ...any) {
		if _, err := testPool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("seed %q: %v", sql, err)
		}
	}
	exec(`INSERT INTO warehouses (id, tenant_id, code, name) VALUES ($1,$2,'WA','Gudang A')`, f.whA, tenantID)
	exec(`INSERT INTO warehouses (id, tenant_id, code, name) VALUES ($1,$2,'WB','Gudang B')`, f.whB, tenantID)
	exec(`INSERT INTO products (id, tenant_id, sku, name, base_uom) VALUES ($1,$2,'SKU1','Produk 1','pcs')`, f.product, tenantID)
	exec(`INSERT INTO partners (id, tenant_id, name, is_supplier) VALUES ($1,$2,'Pemasok',true)`, f.supplier, tenantID)
	exec(`INSERT INTO partners (id, tenant_id, name, is_customer) VALUES ($1,$2,'Pelanggan',true)`, f.customer, tenantID)

	f.cookie = login(t, ts, "gudang@toko.co.id", "kata-sandi-panjang")
	switchTenant(t, ts, f.cookie, tenantID)
	return f
}

// do sends an authenticated JSON request and returns status + decoded body.
func (f docFixture) do(t *testing.T, method, path, body string) (int, map[string]any) {
	t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req, _ := http.NewRequest(method, f.ts.URL+path, r)
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(f.cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return resp.StatusCode, out
}

// levelQty reads stock_levels for a product/warehouse via the owner pool.
func levelQty(t *testing.T, tenantID, product, warehouse string) string {
	t.Helper()
	var qty string
	err := testPool.QueryRow(context.Background(),
		`SELECT qty_on_hand::text FROM stock_levels
		 WHERE tenant_id=$1 AND product_id=$2 AND warehouse_id=$3 AND batch_id IS NULL`,
		tenantID, product, warehouse).Scan(&qty)
	if err != nil {
		return "0"
	}
	return qty
}

// TestGoodsReceiptPostMovesStockAndNumbers covers the core post path: a draft
// receipt posts, gets the gapless number, and moves stock into the journal.
func TestGoodsReceiptPostMovesStockAndNumbers(t *testing.T) {
	f := seedDocFixture(t)

	body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-03-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"10","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	status, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", body)
	if status != http.StatusCreated {
		t.Fatalf("create status = %d, body %v", status, gr)
	}
	if gr["status"] != "draft" {
		t.Fatalf("new receipt status = %v, want draft", gr["status"])
	}
	id := gr["id"].(string)

	status, posted := f.do(t, http.MethodPost, "/v1/goods-receipts/"+id+"/post", "")
	if status != http.StatusOK {
		t.Fatalf("post status = %d, body %v", status, posted)
	}
	if posted["status"] != "posted" {
		t.Fatalf("posted status = %v, want posted", posted["status"])
	}
	if posted["docNumber"] != "GR-2026-00001" {
		t.Fatalf("docNumber = %v, want GR-2026-00001", posted["docNumber"])
	}
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "10" {
		t.Fatalf("on-hand after receipt = %s, want 10", q)
	}
}

// TestPostedDocumentIsImmutable covers the immutability gate: editing a posted
// document is rejected.
func TestPostedDocumentIsImmutable(t *testing.T) {
	f := seedDocFixture(t)

	body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-03-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"5","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", body)
	id := gr["id"].(string)
	if status, _ := f.do(t, http.MethodPost, "/v1/goods-receipts/"+id+"/post", ""); status != http.StatusOK {
		t.Fatalf("post status = %d", status)
	}

	// A draft edit is allowed; a posted edit must be a 409.
	edit := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-03-02",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"9","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	status, out := f.do(t, http.MethodPut, "/v1/goods-receipts/"+id, edit)
	if status != http.StatusConflict {
		t.Fatalf("edit posted status = %d, want 409; body %v", status, out)
	}

	// Re-posting a posted document is also rejected.
	if status, _ := f.do(t, http.MethodPost, "/v1/goods-receipts/"+id+"/post", ""); status != http.StatusConflict {
		t.Fatalf("re-post status = %d, want 409", status)
	}
}

// TestGaplessNumberingUnderConcurrency covers the numbering gate: many receipts
// posted concurrently receive a gapless, non-duplicated sequence.
func TestGaplessNumberingUnderConcurrency(t *testing.T) {
	f := seedDocFixture(t)

	const n = 8
	ids := make([]string, n)
	for i := range ids {
		body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-04-01",
		  "lines":[{"productId":%q,"uom":"pcs","qty":"1","unitCost":"10"}]}`, f.supplier, f.whA, f.product)
		_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", body)
		ids[i] = gr["id"].(string)
	}

	numbers := make([]string, n)
	var wg sync.WaitGroup
	for i := range ids {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, posted := f.do(t, http.MethodPost, "/v1/goods-receipts/"+ids[i]+"/post", "")
			if s, ok := posted["docNumber"].(string); ok {
				numbers[i] = s
			}
		}(i)
	}
	wg.Wait()

	seen := map[string]bool{}
	for _, num := range numbers {
		if num == "" {
			t.Fatalf("a concurrent post produced no number: %v", numbers)
		}
		if seen[num] {
			t.Fatalf("duplicate document number %q under concurrency: %v", num, numbers)
		}
		seen[num] = true
	}
	// Gapless: the set must be exactly GR-2026-00001..00008.
	for i := 1; i <= n; i++ {
		want := fmt.Sprintf("GR-2026-%05d", i)
		if !seen[want] {
			t.Fatalf("missing number %q, sequence has a gap: %v", want, numbers)
		}
	}
}

// TestGoodsReceiptReversalUndoesStock covers the reversal gate: reversing a
// posted receipt posts the opposite movements (stock back out), links the
// reversal to the original, and leaves the original untouched.
func TestGoodsReceiptReversalUndoesStock(t *testing.T) {
	f := seedDocFixture(t)

	body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-05-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"20","unitCost":"50"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", body)
	id := gr["id"].(string)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+id+"/post", "")
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "20" {
		t.Fatalf("on-hand after receipt = %s, want 20", q)
	}

	status, rev := f.do(t, http.MethodPost, "/v1/goods-receipts/"+id+"/reverse", "")
	if status != http.StatusCreated {
		t.Fatalf("reverse status = %d, body %v", status, rev)
	}
	if rev["reversesId"] != id {
		t.Fatalf("reversal reversesId = %v, want %v", rev["reversesId"], id)
	}
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "0" {
		t.Fatalf("on-hand after reversal = %s, want 0", q)
	}

	// The original is now marked reversed and still carries its posted number.
	_, orig := f.do(t, http.MethodGet, "/v1/goods-receipts/"+id, "")
	if orig["status"] != "reversed" {
		t.Fatalf("original status = %v, want reversed", orig["status"])
	}
	if orig["docNumber"] != "GR-2026-00001" {
		t.Fatalf("original docNumber = %v, changed by reversal", orig["docNumber"])
	}
	if orig["reversedById"] != rev["id"] {
		t.Fatalf("original reversedById = %v, want %v", orig["reversedById"], rev["id"])
	}
	// Reversing an already-reversed (non-posted) document is rejected.
	if status, _ := f.do(t, http.MethodPost, "/v1/goods-receipts/"+id+"/reverse", ""); status != http.StatusConflict {
		t.Fatalf("re-reverse status = %d, want 409", status)
	}
}

// TestPurchaseOrderPostNumbersWithoutMovingStock covers the intent-only path:
// posting a PO assigns a number and flips status but writes no movements.
func TestPurchaseOrderPostNumbersWithoutMovingStock(t *testing.T) {
	f := seedDocFixture(t)

	body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-02-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"12","unitCost":"75"}]}`, f.supplier, f.whA, f.product)
	status, po := f.do(t, http.MethodPost, "/v1/purchase-orders", body)
	if status != http.StatusCreated {
		t.Fatalf("create PO status = %d, body %v", status, po)
	}
	id := po["id"].(string)

	status, posted := f.do(t, http.MethodPost, "/v1/purchase-orders/"+id+"/post", "")
	if status != http.StatusOK {
		t.Fatalf("post PO status = %d, body %v", status, posted)
	}
	if posted["docNumber"] != "PO-2026-00001" {
		t.Fatalf("PO docNumber = %v, want PO-2026-00001", posted["docNumber"])
	}
	// No stock moved.
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "0" {
		t.Fatalf("on-hand after PO post = %s, want 0 (PO moves no stock)", q)
	}
}

// TestTransferPostMovesStockAcrossWarehouses covers the transfer pair path.
func TestTransferPostMovesStockAcrossWarehouses(t *testing.T) {
	f := seedDocFixture(t)

	// Seed A with stock via a receipt.
	recv := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-06-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"10","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", recv)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+gr["id"].(string)+"/post", "")

	body := fmt.Sprintf(`{"fromWarehouseId":%q,"toWarehouseId":%q,"docDate":"2026-06-02",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"4"}]}`, f.whA, f.whB, f.product)
	status, tr := f.do(t, http.MethodPost, "/v1/stock-transfers", body)
	if status != http.StatusCreated {
		t.Fatalf("create transfer status = %d, body %v", status, tr)
	}
	if status, out := f.do(t, http.MethodPost, "/v1/stock-transfers/"+tr["id"].(string)+"/post", ""); status != http.StatusOK {
		t.Fatalf("post transfer status = %d, body %v", status, out)
	}
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "6" {
		t.Fatalf("A on-hand = %s, want 6", q)
	}
	if q := levelQty(t, f.tenantID, f.product, f.whB); q != "4" {
		t.Fatalf("B on-hand = %s, want 4", q)
	}
}

// TestOpnamePostAdjustsVariance covers the opname variance path: counting more
// than on hand posts an adjustment for the difference.
func TestOpnamePostAdjustsVariance(t *testing.T) {
	f := seedDocFixture(t)

	// On hand becomes 10 via a receipt.
	recv := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-07-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"10","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", recv)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+gr["id"].(string)+"/post", "")

	// Count 7 -> variance -3 -> on hand should become 7.
	body := fmt.Sprintf(`{"warehouseId":%q,"docDate":"2026-07-02",
	  "lines":[{"productId":%q,"uom":"pcs","countedQty":"7"}]}`, f.whA, f.product)
	_, o := f.do(t, http.MethodPost, "/v1/stock-opnames", body)
	if status, out := f.do(t, http.MethodPost, "/v1/stock-opnames/"+o["id"].(string)+"/post", ""); status != http.StatusOK {
		t.Fatalf("post opname status = %d, body %v", status, out)
	}
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "7" {
		t.Fatalf("on-hand after opname = %s, want 7", q)
	}
}

// TestAdjustmentPostAndReverse covers the signed adjustment path and its reversal.
func TestAdjustmentPostAndReverse(t *testing.T) {
	f := seedDocFixture(t)

	recv := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-08-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"10","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", recv)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+gr["id"].(string)+"/post", "")

	// Waste 3 (negative).
	body := fmt.Sprintf(`{"warehouseId":%q,"reason":"damage","docDate":"2026-08-02",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"-3","unitCost":"100"}]}`, f.whA, f.product)
	_, a := f.do(t, http.MethodPost, "/v1/stock-adjustments", body)
	f.do(t, http.MethodPost, "/v1/stock-adjustments/"+a["id"].(string)+"/post", "")
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "7" {
		t.Fatalf("on-hand after adjustment = %s, want 7", q)
	}

	if status, _ := f.do(t, http.MethodPost, "/v1/stock-adjustments/"+a["id"].(string)+"/reverse", ""); status != http.StatusCreated {
		t.Fatalf("reverse adjustment status = %d", status)
	}
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "10" {
		t.Fatalf("on-hand after adjustment reversal = %s, want 10", q)
	}
}

// TestDraftDeleteStockOpname covers INC-1: a draft opname can be deleted (204),
// a posted opname cannot (409), and the deleted doc is gone (404).
func TestDraftDeleteStockOpname(t *testing.T) {
	f := seedDocFixture(t)

	// Seed on-hand so we can post an opname later.
	recv := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-01-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"5","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", recv)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+gr["id"].(string)+"/post", "")

	// Create a draft opname.
	body := fmt.Sprintf(`{"warehouseId":%q,"docDate":"2026-01-02",
	  "lines":[{"productId":%q,"uom":"pcs","countedQty":"5"}]}`, f.whA, f.product)
	status, o := f.do(t, http.MethodPost, "/v1/stock-opnames", body)
	if status != http.StatusCreated {
		t.Fatalf("create opname status = %d", status)
	}
	id := o["id"].(string)

	// Delete the draft -> 204, no body.
	status, _ = f.do(t, http.MethodDelete, "/v1/stock-opnames/"+id, "")
	if status != http.StatusNoContent {
		t.Fatalf("delete draft status = %d, want 204", status)
	}

	// GET now returns 404.
	if status, _ = f.do(t, http.MethodGet, "/v1/stock-opnames/"+id, ""); status != http.StatusNotFound {
		t.Fatalf("get deleted status = %d, want 404", status)
	}

	// Post a second opname, then try to delete it -> 409.
	_, o2 := f.do(t, http.MethodPost, "/v1/stock-opnames", body)
	id2 := o2["id"].(string)
	f.do(t, http.MethodPost, "/v1/stock-opnames/"+id2+"/post", "")

	if status, _ = f.do(t, http.MethodDelete, "/v1/stock-opnames/"+id2, ""); status != http.StatusConflict {
		t.Fatalf("delete posted status = %d, want 409", status)
	}
}

// TestOpnameSystemQty covers INC-3: after posting an opname, every line carries
// the system (on-hand) qty that was read at post time, including zero-variance
// lines and the no-variance fast path (no movements).
func TestOpnameSystemQty(t *testing.T) {
	f := seedDocFixture(t)

	// Put 10 on hand.
	recv := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-01-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"10","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", recv)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+gr["id"].(string)+"/post", "")

	// Count 7 -> variance -3 (nonzero).
	body := fmt.Sprintf(`{"warehouseId":%q,"docDate":"2026-01-02",
	  "lines":[{"productId":%q,"uom":"pcs","countedQty":"7"}]}`, f.whA, f.product)
	_, o := f.do(t, http.MethodPost, "/v1/stock-opnames", body)
	id := o["id"].(string)
	_, posted := f.do(t, http.MethodPost, "/v1/stock-opnames/"+id+"/post", "")
	if posted["status"] != "posted" {
		t.Fatalf("post status = %v", posted["status"])
	}

	lines, _ := posted["lines"].([]any)
	if len(lines) == 0 {
		t.Fatalf("no lines in posted opname response")
	}
	line := lines[0].(map[string]any)
	if line["systemQty"] == nil {
		t.Fatalf("line missing systemQty after variance post, got %v", line)
	}
	if line["systemQty"] != "10" {
		t.Fatalf("line systemQty = %v, want 10", line["systemQty"])
	}

	// No-variance opname (count = on-hand after first post = 7).
	body2 := fmt.Sprintf(`{"warehouseId":%q,"docDate":"2026-01-03",
	  "lines":[{"productId":%q,"uom":"pcs","countedQty":"7"}]}`, f.whA, f.product)
	_, o2 := f.do(t, http.MethodPost, "/v1/stock-opnames", body2)
	id2 := o2["id"].(string)
	_, posted2 := f.do(t, http.MethodPost, "/v1/stock-opnames/"+id2+"/post", "")
	lines2, _ := posted2["lines"].([]any)
	if len(lines2) == 0 {
		t.Fatalf("no lines in no-variance opname response")
	}
	line2 := lines2[0].(map[string]any)
	if line2["systemQty"] == nil {
		t.Fatalf("no-variance line missing systemQty, got %v", line2)
	}
	if line2["systemQty"] != "7" {
		t.Fatalf("no-variance line systemQty = %v, want 7", line2["systemQty"])
	}
}

// TestLifecycleTimestampsAndActor covers INC-2: posted documents expose createdAt,
// createdBy, postedAt, and postedBy with the actor's id and displayName.
func TestLifecycleTimestampsAndActor(t *testing.T) {
	f := seedDocFixture(t)

	body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-03-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"5","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", body)
	id := gr["id"].(string)

	// createdAt/createdBy must already appear on the draft.
	if gr["createdAt"] == nil {
		t.Fatalf("draft missing createdAt, got %v", gr)
	}
	createdBy, _ := gr["createdBy"].(map[string]any)
	if createdBy == nil || createdBy["id"] == nil {
		t.Fatalf("draft missing createdBy.id, got %v", gr["createdBy"])
	}

	// Post it.
	_, posted := f.do(t, http.MethodPost, "/v1/goods-receipts/"+id+"/post", "")
	if posted["postedAt"] == nil {
		t.Fatalf("posted missing postedAt, got %v", posted)
	}
	postedBy, _ := posted["postedBy"].(map[string]any)
	if postedBy == nil || postedBy["id"] == nil {
		t.Fatalf("posted missing postedBy.id, got %v", posted["postedBy"])
	}
	if postedBy["id"] != createdBy["id"] {
		t.Fatalf("postedBy.id = %v, want same user as createdBy.id = %v", postedBy["id"], createdBy["id"])
	}

	// GET also returns the same fields.
	_, got := f.do(t, http.MethodGet, "/v1/goods-receipts/"+id, "")
	if got["postedAt"] == nil {
		t.Fatalf("GET missing postedAt, got %v", got)
	}
	gotPostedBy, _ := got["postedBy"].(map[string]any)
	if gotPostedBy == nil || gotPostedBy["displayName"] == nil {
		t.Fatalf("GET missing postedBy.displayName, got %v", got["postedBy"])
	}
}

// TestDraftDeleteAllDocumentTypes covers INC-1 for the remaining 6 document
// types: draft deletes succeed (204) and posted deletes are rejected (409).
func TestDraftDeleteAllDocumentTypes(t *testing.T) {
	f := seedDocFixture(t)

	// Seed stock for delivery and transfer tests.
	recv := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-01-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"20","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr0 := f.do(t, http.MethodPost, "/v1/goods-receipts", recv)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+gr0["id"].(string)+"/post", "")

	cases := []struct {
		path       string
		createBody func() string
		postPath   func(id string) string
	}{
		{
			path: "/v1/goods-receipts",
			createBody: func() string {
				return fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-01-02",
				  "lines":[{"productId":%q,"uom":"pcs","qty":"1","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
			},
			postPath: func(id string) string { return "/v1/goods-receipts/" + id + "/post" },
		},
		{
			path: "/v1/purchase-orders",
			createBody: func() string {
				return fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-01-02",
				  "lines":[{"productId":%q,"uom":"pcs","qty":"1","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
			},
			postPath: func(id string) string { return "/v1/purchase-orders/" + id + "/post" },
		},
		{
			path: "/v1/sales-orders",
			createBody: func() string {
				return fmt.Sprintf(`{"customerId":%q,"warehouseId":%q,"docDate":"2026-01-02",
				  "lines":[{"productId":%q,"uom":"pcs","qty":"1","unitPrice":"100"}]}`, f.customer, f.whA, f.product)
			},
			postPath: func(id string) string { return "/v1/sales-orders/" + id + "/post" },
		},
		{
			path: "/v1/deliveries",
			createBody: func() string {
				return fmt.Sprintf(`{"customerId":%q,"warehouseId":%q,"docDate":"2026-01-02",
				  "lines":[{"productId":%q,"uom":"pcs","qty":"1"}]}`, f.customer, f.whA, f.product)
			},
			postPath: func(id string) string { return "/v1/deliveries/" + id + "/post" },
		},
		{
			path: "/v1/stock-transfers",
			createBody: func() string {
				return fmt.Sprintf(`{"fromWarehouseId":%q,"toWarehouseId":%q,"docDate":"2026-01-02",
				  "lines":[{"productId":%q,"uom":"pcs","qty":"1"}]}`, f.whA, f.whB, f.product)
			},
			postPath: func(id string) string { return "/v1/stock-transfers/" + id + "/post" },
		},
		{
			path: "/v1/stock-adjustments",
			createBody: func() string {
				return fmt.Sprintf(`{"warehouseId":%q,"reason":"damage","docDate":"2026-01-02",
				  "lines":[{"productId":%q,"uom":"pcs","qty":"-1","unitCost":"100"}]}`, f.whA, f.product)
			},
			postPath: func(id string) string { return "/v1/stock-adjustments/" + id + "/post" },
		},
	}

	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			// Delete a draft -> 204.
			status, doc := f.do(t, http.MethodPost, tc.path, tc.createBody())
			if status != http.StatusCreated {
				t.Fatalf("create status = %d, body %v", status, doc)
			}
			id := doc["id"].(string)
			if status, _ = f.do(t, http.MethodDelete, tc.path+"/"+id, ""); status != http.StatusNoContent {
				t.Fatalf("delete draft status = %d, want 204", status)
			}

			// Create another, post it, then try to delete -> 409.
			_, doc2 := f.do(t, http.MethodPost, tc.path, tc.createBody())
			id2 := doc2["id"].(string)
			f.do(t, http.MethodPost, tc.postPath(id2), "")
			if status, _ = f.do(t, http.MethodDelete, tc.path+"/"+id2, ""); status != http.StatusConflict {
				t.Fatalf("delete posted status = %d, want 409", status)
			}
		})
	}
}

// TestListEnvelopeShape verifies every document list returns the paginated
// envelope {items, nextCursor} required by ADR-0019 (SN-0001 contract freeze).
func TestListEnvelopeShape(t *testing.T) {
	f := seedDocFixture(t)

	// seed one PO so items is non-empty
	body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-07-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"5","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	if st, _ := f.do(t, http.MethodPost, "/v1/purchase-orders", body); st != http.StatusCreated {
		t.Fatalf("create PO: status %d", st)
	}

	st, list := f.do(t, http.MethodGet, "/v1/purchase-orders", "")
	if st != http.StatusOK {
		t.Fatalf("list status = %d", st)
	}
	if _, ok := list["items"]; !ok {
		t.Fatalf("list response missing 'items': %v", list)
	}
	if _, ok := list["nextCursor"]; !ok {
		t.Fatalf("list response missing 'nextCursor': %v", list)
	}
	items, ok := list["items"].([]any)
	if !ok {
		t.Fatalf("'items' is not an array: %T", list["items"])
	}
	if len(items) == 0 {
		t.Fatal("'items' is empty, expected at least one PO")
	}
}

// TestCancelPurchaseOrderStub verifies the cancel route exists (SN-0001 contract
// freeze). Full behaviour lands in SN-0003; the stub returns 409 for now.
func TestCancelPurchaseOrderStub(t *testing.T) {
	f := seedDocFixture(t)
	body := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-07-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"5","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, po := f.do(t, http.MethodPost, "/v1/purchase-orders", body)
	id := po["id"].(string)

	st, _ := f.do(t, http.MethodPost, "/v1/purchase-orders/"+id+"/cancel", `{"reason":"too expensive"}`)
	if st != http.StatusConflict {
		t.Fatalf("cancel stub status = %d, want 409", st)
	}
}

// TestCancelSalesOrderStub mirrors TestCancelPurchaseOrderStub for SO.
func TestCancelSalesOrderStub(t *testing.T) {
	f := seedDocFixture(t)
	body := fmt.Sprintf(`{"customerId":%q,"warehouseId":%q,"docDate":"2026-07-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"5","unitPrice":"100"}]}`, f.customer, f.whA, f.product)
	_, so := f.do(t, http.MethodPost, "/v1/sales-orders", body)
	id := so["id"].(string)

	st, _ := f.do(t, http.MethodPost, "/v1/sales-orders/"+id+"/cancel", `{"reason":"customer changed mind"}`)
	if st != http.StatusConflict {
		t.Fatalf("cancel SO stub status = %d, want 409", st)
	}
}

// TestDeliveryPostAndReverse covers the issue path (stock out) and its reversal.
func TestDeliveryPostAndReverse(t *testing.T) {
	f := seedDocFixture(t)

	recv := fmt.Sprintf(`{"supplierId":%q,"warehouseId":%q,"docDate":"2026-09-01",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"10","unitCost":"100"}]}`, f.supplier, f.whA, f.product)
	_, gr := f.do(t, http.MethodPost, "/v1/goods-receipts", recv)
	f.do(t, http.MethodPost, "/v1/goods-receipts/"+gr["id"].(string)+"/post", "")

	body := fmt.Sprintf(`{"customerId":%q,"warehouseId":%q,"docDate":"2026-09-02",
	  "lines":[{"productId":%q,"uom":"pcs","qty":"4"}]}`, f.customer, f.whA, f.product)
	_, d := f.do(t, http.MethodPost, "/v1/deliveries", body)
	if status, out := f.do(t, http.MethodPost, "/v1/deliveries/"+d["id"].(string)+"/post", ""); status != http.StatusOK {
		t.Fatalf("post delivery status = %d, body %v", status, out)
	}
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "6" {
		t.Fatalf("on-hand after delivery = %s, want 6", q)
	}

	if status, _ := f.do(t, http.MethodPost, "/v1/deliveries/"+d["id"].(string)+"/reverse", ""); status != http.StatusCreated {
		t.Fatalf("reverse delivery status = %d", status)
	}
	if q := levelQty(t, f.tenantID, f.product, f.whA); q != "10" {
		t.Fatalf("on-hand after delivery reversal = %s, want 10", q)
	}
}
