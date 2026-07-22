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
