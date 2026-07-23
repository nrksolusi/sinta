package httpserver_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// activeTenant registers a user, seeds an owner membership on a fresh tenant,
// switches into it, and returns the session cookie plus the tenant id. Catalog
// tests operate as the tenant owner over the HTTP seam.
func activeTenant(t *testing.T, ts *httptest.Server, email string) (*http.Cookie, string) {
	t.Helper()
	registerUser(t, ts, email, "kata-sandi-panjang")
	tenantID := seedTenantWithMembership(t, email, "PT Catalog Test", "owner")
	cookie := login(t, ts, email, "kata-sandi-panjang")
	switchTenant(t, ts, cookie, tenantID)
	return cookie, tenantID
}

// do issues an authenticated JSON request and returns status + body.
func do(t *testing.T, ts *httptest.Server, cookie *http.Cookie, method, path, body string) (int, []byte) {
	t.Helper()
	var r io.Reader
	if body != "" {
		r = strings.NewReader(body)
	}
	req, _ := http.NewRequest(method, ts.URL+path, r)
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	out, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, out
}

func TestCreateAndGetProduct(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")

	status, body := do(t, ts, cookie, http.MethodPost, "/v1/products",
		`{"sku":"SKU-1","name":"Beras Premium 5kg","baseUom":"pcs","isBatchTracked":true,"barcode":"8991234567890"}`)
	if status != http.StatusCreated {
		t.Fatalf("create status = %d, want 201; body: %s", status, body)
	}
	var created struct {
		Id             string `json:"id"`
		Sku            string `json:"sku"`
		Name           string `json:"name"`
		BaseUom        string `json:"baseUom"`
		IsBatchTracked bool   `json:"isBatchTracked"`
		Barcode        string `json:"barcode"`
		Status         string `json:"status"`
	}
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatalf("decode: %v; body: %s", err, body)
	}
	if created.Id == "" || created.Sku != "SKU-1" || created.BaseUom != "pcs" ||
		!created.IsBatchTracked || created.Barcode != "8991234567890" || created.Status != "active" {
		t.Fatalf("created product = %+v", created)
	}

	status, body = do(t, ts, cookie, http.MethodGet, "/v1/products/"+created.Id, "")
	if status != http.StatusOK {
		t.Fatalf("get status = %d, want 200; body: %s", status, body)
	}
	var got struct {
		Sku string `json:"sku"`
	}
	_ = json.Unmarshal(body, &got)
	if got.Sku != "SKU-1" {
		t.Fatalf("got product sku = %q, want SKU-1", got.Sku)
	}
}

func TestListProductsFiltersByStatus(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")

	do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"A","name":"A","baseUom":"pcs"}`)
	_, created := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"B","name":"B","baseUom":"pcs"}`)
	var b struct {
		Id string `json:"id"`
	}
	_ = json.Unmarshal(created, &b)
	// Archive B.
	do(t, ts, cookie, http.MethodPatch, "/v1/products/"+b.Id, `{"status":"archived"}`)

	status, body := do(t, ts, cookie, http.MethodGet, "/v1/products?status=active", "")
	if status != http.StatusOK {
		t.Fatalf("list status = %d; body: %s", status, body)
	}
	var list []struct {
		Sku string `json:"sku"`
	}
	_ = json.Unmarshal(body, &list)
	if len(list) != 1 || list[0].Sku != "A" {
		t.Fatalf("active list = %+v, want only A", list)
	}
}

func TestUpdateProduct(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")

	_, created := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"S","name":"Old","baseUom":"pcs","barcode":"111"}`)
	var p struct {
		Id string `json:"id"`
	}
	_ = json.Unmarshal(created, &p)

	status, body := do(t, ts, cookie, http.MethodPatch, "/v1/products/"+p.Id, `{"name":"New","barcode":""}`)
	if status != http.StatusOK {
		t.Fatalf("update status = %d; body: %s", status, body)
	}
	var updated struct {
		Name    string `json:"name"`
		Barcode string `json:"barcode"`
		Sku     string `json:"sku"`
	}
	_ = json.Unmarshal(body, &updated)
	if updated.Name != "New" || updated.Sku != "S" || updated.Barcode != "" {
		t.Fatalf("updated = %+v, want name New, sku S, cleared barcode", updated)
	}
}

func TestProductSkuUniquePerTenant(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")

	status, _ := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"DUP","name":"First","baseUom":"pcs"}`)
	if status != http.StatusCreated {
		t.Fatalf("first create status = %d, want 201", status)
	}
	status, body := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"DUP","name":"Second","baseUom":"pcs"}`)
	if status != http.StatusConflict {
		t.Fatalf("duplicate sku status = %d, want 409; body: %s", status, body)
	}
}

func TestProductBarcodeUniquePerTenant(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")

	do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"P1","name":"P1","baseUom":"pcs","barcode":"BC-1"}`)
	status, body := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"P2","name":"P2","baseUom":"pcs","barcode":"BC-1"}`)
	if status != http.StatusConflict {
		t.Fatalf("duplicate barcode status = %d, want 409; body: %s", status, body)
	}
}

func TestProductSkuUniquenessIsPerTenant(t *testing.T) {
	ts := newTestServer(t)
	cookieA, _ := activeTenant(t, ts, "a@toko.co.id")
	// A different user in a different tenant may reuse the same SKU.
	registerUser(t, ts, "b@toko.co.id", "kata-sandi-panjang")
	tenantB := seedTenantWithMembership(t, "b@toko.co.id", "PT Lain", "owner")
	cookieB := login(t, ts, "b@toko.co.id", "kata-sandi-panjang")
	switchTenant(t, ts, cookieB, tenantB)

	if s, _ := do(t, ts, cookieA, http.MethodPost, "/v1/products", `{"sku":"SHARED","name":"A","baseUom":"pcs"}`); s != http.StatusCreated {
		t.Fatalf("tenant A create status = %d, want 201", s)
	}
	if s, b := do(t, ts, cookieB, http.MethodPost, "/v1/products", `{"sku":"SHARED","name":"B","baseUom":"pcs"}`); s != http.StatusCreated {
		t.Fatalf("tenant B create status = %d, want 201; body: %s", s, b)
	}
}

func TestProductValidationRejectsMissingSku(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")
	status, _ := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"name":"No SKU","baseUom":"pcs"}`)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("missing sku status = %d, want 422", status)
	}
}

func TestProductRequiresTenant(t *testing.T) {
	ts := newTestServer(t)
	// Logged in but no active tenant selected.
	registerUser(t, ts, "budi@toko.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "budi@toko.co.id", "kata-sandi-panjang")
	status, _ := do(t, ts, cookie, http.MethodGet, "/v1/products", "")
	if status != http.StatusForbidden {
		t.Fatalf("no-tenant list status = %d, want 403", status)
	}
}

func TestProductUomConversion(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")
	_, created := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"S","name":"P","baseUom":"pcs"}`)
	var p struct {
		Id string `json:"id"`
	}
	_ = json.Unmarshal(created, &p)

	status, body := do(t, ts, cookie, http.MethodPost, "/v1/products/"+p.Id+"/uoms",
		`{"uom":"carton","factorToBase":"24"}`)
	if status != http.StatusCreated {
		t.Fatalf("create uom status = %d, want 201; body: %s", status, body)
	}
	var uom struct {
		Id           string `json:"id"`
		Uom          string `json:"uom"`
		FactorToBase string `json:"factorToBase"`
	}
	_ = json.Unmarshal(body, &uom)
	if uom.Uom != "carton" || uom.FactorToBase != "24" {
		t.Fatalf("uom = %+v, want carton/24", uom)
	}

	// List returns it.
	status, body = do(t, ts, cookie, http.MethodGet, "/v1/products/"+p.Id+"/uoms", "")
	if status != http.StatusOK {
		t.Fatalf("list uom status = %d; body: %s", status, body)
	}
	var list []struct {
		FactorToBase string `json:"factorToBase"`
	}
	_ = json.Unmarshal(body, &list)
	if len(list) != 1 || list[0].FactorToBase != "24" {
		t.Fatalf("uom list = %+v, want one factor 24", list)
	}

	// Delete it.
	status, _ = do(t, ts, cookie, http.MethodDelete, "/v1/products/"+p.Id+"/uoms/"+uom.Id, "")
	if status != http.StatusNoContent {
		t.Fatalf("delete uom status = %d, want 204", status)
	}
}

func TestProductUomRejectsNonPositiveFactor(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")
	_, created := do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"S","name":"P","baseUom":"pcs"}`)
	var p struct {
		Id string `json:"id"`
	}
	_ = json.Unmarshal(created, &p)

	status, _ := do(t, ts, cookie, http.MethodPost, "/v1/products/"+p.Id+"/uoms", `{"uom":"bad","factorToBase":"0"}`)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("zero factor status = %d, want 422", status)
	}
}

func TestBatchCrud(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")
	_, created := do(t, ts, cookie, http.MethodPost, "/v1/products",
		`{"sku":"S","name":"P","baseUom":"pcs","isBatchTracked":true}`)
	var p struct {
		Id string `json:"id"`
	}
	_ = json.Unmarshal(created, &p)

	status, body := do(t, ts, cookie, http.MethodPost, "/v1/products/"+p.Id+"/batches",
		`{"batchNo":"LOT-2026-01","expiryDate":"2027-01-31"}`)
	if status != http.StatusCreated {
		t.Fatalf("create batch status = %d, want 201; body: %s", status, body)
	}
	var batch struct {
		BatchNo    string `json:"batchNo"`
		ExpiryDate string `json:"expiryDate"`
	}
	_ = json.Unmarshal(body, &batch)
	if batch.BatchNo != "LOT-2026-01" || batch.ExpiryDate != "2027-01-31" {
		t.Fatalf("batch = %+v", batch)
	}

	// Duplicate batch_no for the same product is a conflict.
	status, _ = do(t, ts, cookie, http.MethodPost, "/v1/products/"+p.Id+"/batches", `{"batchNo":"LOT-2026-01"}`)
	if status != http.StatusConflict {
		t.Fatalf("duplicate batch status = %d, want 409", status)
	}

	status, body = do(t, ts, cookie, http.MethodGet, "/v1/products/"+p.Id+"/batches", "")
	if status != http.StatusOK {
		t.Fatalf("list batches status = %d; body: %s", status, body)
	}
	var list []struct {
		BatchNo string `json:"batchNo"`
	}
	_ = json.Unmarshal(body, &list)
	if len(list) != 1 {
		t.Fatalf("batch list len = %d, want 1", len(list))
	}
}

func TestPartnerCrud(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")

	status, body := do(t, ts, cookie, http.MethodPost, "/v1/partners",
		`{"code":"SUP-1","name":"CV Pemasok Jaya","isSupplier":true}`)
	if status != http.StatusCreated {
		t.Fatalf("create partner status = %d, want 201; body: %s", status, body)
	}
	var p struct {
		Id         string `json:"id"`
		Name       string `json:"name"`
		IsSupplier bool   `json:"isSupplier"`
		IsCustomer bool   `json:"isCustomer"`
		Status     string `json:"status"`
	}
	_ = json.Unmarshal(body, &p)
	if !p.IsSupplier || p.IsCustomer || p.Status != "active" {
		t.Fatalf("partner = %+v", p)
	}

	// Update to also be a customer.
	status, body = do(t, ts, cookie, http.MethodPatch, "/v1/partners/"+p.Id, `{"isCustomer":true}`)
	if status != http.StatusOK {
		t.Fatalf("update partner status = %d; body: %s", status, body)
	}
	var upd struct {
		IsSupplier bool `json:"isSupplier"`
		IsCustomer bool `json:"isCustomer"`
	}
	_ = json.Unmarshal(body, &upd)
	if !upd.IsSupplier || !upd.IsCustomer {
		t.Fatalf("updated partner = %+v, want both flags", upd)
	}

	// Filter suppliers.
	status, body = do(t, ts, cookie, http.MethodGet, "/v1/partners?role=supplier", "")
	if status != http.StatusOK {
		t.Fatalf("list suppliers status = %d; body: %s", status, body)
	}
	var suppliers []struct {
		Id string `json:"id"`
	}
	_ = json.Unmarshal(body, &suppliers)
	if len(suppliers) != 1 {
		t.Fatalf("supplier list len = %d, want 1", len(suppliers))
	}
}

func TestPartnerRequiresRoleFlag(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")
	// Neither supplier nor customer -> the DB CHECK would fail; surface as 422.
	status, _ := do(t, ts, cookie, http.MethodPost, "/v1/partners", `{"name":"Neither"}`)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("no-flag partner status = %d, want 422", status)
	}
}

func TestPartnerCodeUniquePerTenant(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")
	do(t, ts, cookie, http.MethodPost, "/v1/partners", `{"code":"C1","name":"A","isSupplier":true}`)
	status, _ := do(t, ts, cookie, http.MethodPost, "/v1/partners", `{"code":"C1","name":"B","isCustomer":true}`)
	if status != http.StatusConflict {
		t.Fatalf("duplicate code status = %d, want 409", status)
	}
}

func TestWarehouseListCreateUpdate(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")

	// The seeded tenant here has no warehouse (seedTenantWithMembership skips
	// onboarding), so we create one.
	status, body := do(t, ts, cookie, http.MethodPost, "/v1/warehouses", `{"code":"WH-1","name":"Gudang Utama"}`)
	if status != http.StatusCreated {
		t.Fatalf("create warehouse status = %d, want 201; body: %s", status, body)
	}
	var wh struct {
		Id   string `json:"id"`
		Code string `json:"code"`
		Name string `json:"name"`
	}
	_ = json.Unmarshal(body, &wh)
	if wh.Code != "WH-1" || wh.Name != "Gudang Utama" {
		t.Fatalf("warehouse = %+v", wh)
	}

	status, body = do(t, ts, cookie, http.MethodPatch, "/v1/warehouses/"+wh.Id, `{"name":"Gudang Pusat"}`)
	if status != http.StatusOK {
		t.Fatalf("update warehouse status = %d; body: %s", status, body)
	}
	var updated struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	_ = json.Unmarshal(body, &updated)
	if updated.Code != "WH-1" || updated.Name != "Gudang Pusat" {
		t.Fatalf("updated warehouse = %+v", updated)
	}

	status, body = do(t, ts, cookie, http.MethodGet, "/v1/warehouses", "")
	if status != http.StatusOK {
		t.Fatalf("list warehouses status = %d; body: %s", status, body)
	}
	var list []struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(body, &list)
	if len(list) != 1 || list[0].Code != "WH-1" {
		t.Fatalf("warehouse list = %+v", list)
	}
}

func TestWarehouseCodeUniquePerTenant(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "budi@toko.co.id")
	do(t, ts, cookie, http.MethodPost, "/v1/warehouses", `{"code":"WH-1","name":"A"}`)
	status, _ := do(t, ts, cookie, http.MethodPost, "/v1/warehouses", `{"code":"WH-1","name":"B"}`)
	if status != http.StatusConflict {
		t.Fatalf("duplicate warehouse code status = %d, want 409", status)
	}
}

// Ensure cross-tenant isolation: tenant B cannot read tenant A's product.
func TestProductTenantIsolation(t *testing.T) {
	ts := newTestServer(t)
	cookieA, _ := activeTenant(t, ts, "a@toko.co.id")
	registerUser(t, ts, "b@toko.co.id", "kata-sandi-panjang")
	tenantB := seedTenantWithMembership(t, "b@toko.co.id", "PT B", "owner")
	cookieB := login(t, ts, "b@toko.co.id", "kata-sandi-panjang")
	switchTenant(t, ts, cookieB, tenantB)

	_, created := do(t, ts, cookieA, http.MethodPost, "/v1/products", `{"sku":"SECRET","name":"A","baseUom":"pcs"}`)
	var p struct {
		Id string `json:"id"`
	}
	_ = json.Unmarshal(created, &p)

	status, _ := do(t, ts, cookieB, http.MethodGet, "/v1/products/"+p.Id, "")
	if status != http.StatusNotFound {
		t.Fatalf("cross-tenant get status = %d, want 404", status)
	}
}

// TestProductSearchByQ verifies trigram-ranked product search.
func TestProductSearchByQ(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "cari@toko.co.id")

	do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"GULA","name":"Gula Pasir","baseUom":"kg"}`)
	do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"GAR","name":"Garam Dapur","baseUom":"kg"}`)
	do(t, ts, cookie, http.MethodPost, "/v1/products", `{"sku":"MER","name":"Merica Hitam","baseUom":"gr"}`)

	status, body := do(t, ts, cookie, http.MethodGet, "/v1/products?q=Gula", "")
	if status != http.StatusOK {
		t.Fatalf("search status = %d, body: %s", status, body)
	}
	var products []struct {
		Sku string `json:"sku"`
	}
	if err := json.Unmarshal(body, &products); err != nil {
		t.Fatalf("decode: %v; body: %s", err, body)
	}
	if len(products) == 0 {
		t.Fatalf("product search by q=Gula: got 0 results, want >= 1")
	}
	if products[0].Sku != "GULA" {
		t.Fatalf("product search q=Gula: first result sku = %q, want GULA", products[0].Sku)
	}
}

// TestPartnerSearchByQ verifies trigram-ranked partner search.
func TestPartnerSearchByQ(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "mitra@toko.co.id")

	do(t, ts, cookie, http.MethodPost, "/v1/partners",
		`{"code":"SUP-01","name":"PT Indofood Sukses","isSupplier":true,"isCustomer":false}`)
	do(t, ts, cookie, http.MethodPost, "/v1/partners",
		`{"code":"SUP-02","name":"CV Maju Jaya","isSupplier":true,"isCustomer":false}`)

	status, body := do(t, ts, cookie, http.MethodGet, "/v1/partners?q=indofood", "")
	if status != http.StatusOK {
		t.Fatalf("partner search status = %d, body: %s", status, body)
	}
	var partners []struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &partners); err != nil {
		t.Fatalf("decode: %v; body: %s", err, body)
	}
	if len(partners) != 1 {
		t.Fatalf("partner search q=indofood: got %d results, want 1", len(partners))
	}
	if partners[0].Code != "SUP-01" {
		t.Fatalf("partner search q=indofood: first result code = %q, want SUP-01", partners[0].Code)
	}
}

// TestWarehouseSearchByQ verifies warehouse search.
func TestWarehouseSearchByQ(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := activeTenant(t, ts, "gudang@toko2.co.id")

	do(t, ts, cookie, http.MethodPost, "/v1/warehouses", `{"code":"GDG-01","name":"Gudang Utama"}`)
	do(t, ts, cookie, http.MethodPost, "/v1/warehouses", `{"code":"GDG-02","name":"Toko Cabang"}`)

	status, body := do(t, ts, cookie, http.MethodGet, "/v1/warehouses?q=utama", "")
	if status != http.StatusOK {
		t.Fatalf("warehouse search status = %d, body: %s", status, body)
	}
	var warehouses []struct {
		Code string `json:"code"`
	}
	if err := json.Unmarshal(body, &warehouses); err != nil {
		t.Fatalf("decode: %v; body: %s", err, body)
	}
	if len(warehouses) != 1 {
		t.Fatalf("warehouse search q=utama: got %d results, want 1", len(warehouses))
	}
	if warehouses[0].Code != "GDG-01" {
		t.Fatalf("warehouse search q=utama: result code = %q, want GDG-01", warehouses[0].Code)
	}
}
