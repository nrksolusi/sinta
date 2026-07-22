package httpserver_test

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

var updateGolden = flag.Bool("update", false, "update report golden files")

// reportScene is a fully onboarded tenant with a known product/warehouse layout
// and a journal seeded through the real Poster, ready to exercise the reports.
type reportScene struct {
	ts       *httptest.Server
	cookie   *http.Cookie
	tenantID uuid.UUID
	userID   uuid.UUID
	prodA    uuid.UUID // "AAA" - moved in two warehouses
	prodB    uuid.UUID // "BBB" - moved in one warehouse
	whMain   uuid.UUID // "GD-01"
	whSpare  uuid.UUID // "GD-02"
}

// seedReportScene onboards a tenant over HTTP (so the session cookie is real),
// then seeds catalog rows and a deterministic journal via the Poster - the same
// path Track C posting takes. IDs are fixed so golden output is stable after
// UUID/timestamp normalization.
func seedReportScene(t *testing.T) reportScene {
	t.Helper()
	ctx := context.Background()

	ts := newTestServer(t)
	registerUser(t, ts, "owner@toko.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "owner@toko.co.id", "kata-sandi-panjang")

	resp := createTenant(t, ts, cookie, validTenantBody)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("onboard: status %d; body %s", resp.StatusCode, body)
	}
	var profile struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		t.Fatalf("decode profile: %v", err)
	}
	tenantID := uuid.MustParse(profile.ID)

	var userID, whMain uuid.UUID
	if err := testPool.QueryRow(ctx,
		"SELECT id FROM users WHERE email = $1", "owner@toko.co.id").Scan(&userID); err != nil {
		t.Fatalf("load user: %v", err)
	}
	if err := testPool.QueryRow(ctx,
		"SELECT id FROM warehouses WHERE tenant_id = $1 AND code = 'GD-01'", tenantID).Scan(&whMain); err != nil {
		t.Fatalf("load warehouse: %v", err)
	}

	s := reportScene{
		ts: ts, cookie: cookie, tenantID: tenantID, userID: userID,
		prodA: uuid.New(), prodB: uuid.New(), whMain: whMain, whSpare: uuid.New(),
	}

	exec := func(sql string, args ...any) {
		if _, err := testPool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("seed %q: %v", sql, err)
		}
	}
	exec(`INSERT INTO warehouses (id, tenant_id, code, name) VALUES ($1, $2, 'GD-02', 'Gudang Cadangan')`, s.whSpare, tenantID)
	exec(`INSERT INTO products (id, tenant_id, sku, name, base_uom) VALUES ($1, $2, 'AAA', 'Produk A', 'pcs')`, s.prodA, tenantID)
	exec(`INSERT INTO products (id, tenant_id, sku, name, base_uom) VALUES ($1, $2, 'BBB', 'Produk B', 'pcs')`, s.prodB, tenantID)

	p := store.NewPoster(appPool, costing.NewAverage())
	base := time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC)

	mv := func(prod, wh uuid.UUID, qty, cost string, typ stock.MovementType, at time.Time) stock.Movement {
		return stock.Movement{
			Key:         stock.Key{ProductID: prod, WarehouseID: wh},
			Qty:         dec2(qty),
			UnitCost:    dec2(cost),
			Type:        typ,
			EffectiveAt: at,
			CreatedBy:   userID,
		}
	}
	post := func(docType string, ms ...stock.Movement) {
		if _, err := p.Post(ctx, posting.Request{
			TenantID: tenantID, DocType: docType, DocID: uuid.New(), Year: 2026, Movements: ms,
		}); err != nil {
			t.Fatalf("post %s: %v", docType, err)
		}
	}

	// Product A, main warehouse: receipt 10@100, receipt 10@200 (re-avg to 150),
	// issue 5. Ends 15 on hand @ 150.
	post("goods_receipt", mv(s.prodA, s.whMain, "10", "100", stock.Receipt, base))
	post("goods_receipt", mv(s.prodA, s.whMain, "10", "200", stock.Receipt, base.Add(time.Hour)))
	post("delivery", mv(s.prodA, s.whMain, "-5", "0", stock.Issue, base.Add(2*time.Hour)))
	// Product A, spare warehouse: receipt 4@250.
	post("goods_receipt", mv(s.prodA, s.whSpare, "4", "250", stock.Receipt, base.Add(3*time.Hour)))
	// Product B, main warehouse: receipt 8@50.
	post("goods_receipt", mv(s.prodB, s.whMain, "8", "50", stock.Receipt, base.Add(4*time.Hour)))

	return s
}

// dec2 parses a decimal literal for the seed table, panicking on a bad literal
// (the inputs are all test constants).
func dec2(s string) decimal.Decimal {
	d, err := decimal.NewFromString(s)
	if err != nil {
		panic(err)
	}
	return d
}

// getReport issues a GET and returns the normalized, pretty JSON body.
func getReport(t *testing.T, s reportScene, path string) (int, string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, s.ts.URL+path, nil)
	req.AddCookie(s.cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get %s: %v", path, err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, normalize(s, body)
}

var (
	tsRe = regexp.MustCompile(`"20\d\d-\d\d-\d\dT[0-9:.\-+Z]+"`)
)

// normalize makes report JSON stable for golden comparison: it re-indents,
// swaps the scene's known UUIDs for readable tokens, and blanks timestamps
// (which carry created_at-derived jitter). Unknown UUIDs (movement/doc IDs) are
// tokenized positionally.
func normalize(s reportScene, body []byte) string {
	var v any
	if err := json.Unmarshal(body, &v); err != nil {
		return string(body)
	}
	pretty, _ := json.MarshalIndent(v, "", "  ")
	out := string(pretty)

	repl := map[string]string{
		s.tenantID.String(): "<tenant>",
		s.userID.String():   "<user>",
		s.prodA.String():    "<prodA>",
		s.prodB.String():    "<prodB>",
		s.whMain.String():   "<whMain>",
		s.whSpare.String():  "<whSpare>",
	}
	for from, to := range repl {
		out = replaceAll(out, from, to)
	}
	out = tsRe.ReplaceAllString(out, `"<ts>"`)
	// Remaining UUIDs are per-run movement/doc IDs: tokenize them stably by
	// first-seen order so the golden file stays deterministic.
	uuidRe := regexp.MustCompile(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
	seen := map[string]string{}
	out = uuidRe.ReplaceAllStringFunc(out, func(m string) string {
		if tok, ok := seen[m]; ok {
			return tok
		}
		tok := "<id" + itoa(len(seen)+1) + ">"
		seen[m] = tok
		return tok
	})
	return out
}

func replaceAll(s, from, to string) string {
	return string(bytes.ReplaceAll([]byte(s), []byte(from), []byte(to)))
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// assertGolden compares got against testdata/<name>.json, rewriting it under -update.
func assertGolden(t *testing.T, name, got string) {
	t.Helper()
	path := filepath.Join("testdata", name+".json")
	if *updateGolden {
		if err := os.MkdirAll("testdata", 0o755); err != nil {
			t.Fatalf("mkdir testdata: %v", err)
		}
		if err := os.WriteFile(path, []byte(got), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		return
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden %s (run with -update to create): %v", path, err)
	}
	if got != string(want) {
		t.Errorf("report %s mismatch\n--- got ---\n%s\n--- want ---\n%s", name, got, want)
	}
}

func TestReportStockOnHand(t *testing.T) {
	s := seedReportScene(t)
	status, body := getReport(t, s, "/v1/reports/stock-on-hand")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body:\n%s", status, body)
	}
	assertGolden(t, "stock_on_hand", body)
}

func TestReportStockOnHandFilterByWarehouse(t *testing.T) {
	s := seedReportScene(t)
	status, body := getReport(t, s, "/v1/reports/stock-on-hand?warehouseId="+s.whSpare.String())
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body:\n%s", status, body)
	}
	assertGolden(t, "stock_on_hand_wh_spare", body)
}

func TestReportStockValuation(t *testing.T) {
	s := seedReportScene(t)
	status, body := getReport(t, s, "/v1/reports/stock-valuation")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body:\n%s", status, body)
	}
	assertGolden(t, "stock_valuation", body)
}

func TestReportStockCard(t *testing.T) {
	s := seedReportScene(t)
	status, body := getReport(t, s, "/v1/reports/stock-card?productId="+s.prodA.String())
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body:\n%s", status, body)
	}
	assertGolden(t, "stock_card_prodA", body)
}

func TestReportStockCardRequiresProduct(t *testing.T) {
	s := seedReportScene(t)
	status, _ := getReport(t, s, "/v1/reports/stock-card")
	// oapi-codegen rejects a missing required query param before the handler.
	if status != http.StatusBadRequest && status != http.StatusUnprocessableEntity {
		t.Fatalf("missing productId status = %d, want 400 or 422", status)
	}
}

func TestReportsRequireAuth(t *testing.T) {
	s := seedReportScene(t)
	for _, path := range []string{
		"/v1/reports/stock-on-hand",
		"/v1/reports/stock-valuation",
		"/v1/reports/stock-card?productId=" + s.prodA.String(),
	} {
		req, _ := http.NewRequest(http.MethodGet, s.ts.URL+path, nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("get %s: %v", path, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s unauth status = %d, want 401", path, resp.StatusCode)
		}
	}
}

// TestReportsTenantIsolation confirms a second tenant, seeded with its own
// stock, never sees the first tenant's rows through the reports (RLS + tenantTx,
// ADR-0004).
func TestReportsTenantIsolation(t *testing.T) {
	s := seedReportScene(t)
	ctx := context.Background()

	// Onboard a second tenant on a fresh session.
	registerUser(t, s.ts, "other@lain.co.id", "kata-sandi-panjang")
	otherCookie := login(t, s.ts, "other@lain.co.id", "kata-sandi-panjang")
	resp := createTenant(t, s.ts, otherCookie, `{
		"name": "PT Lain", "legalName": "PT Lain", "costingMethod": "weightedAverage",
		"fiscalYearStartMonth": 1, "warehouse": {"code": "LN-01", "name": "Gudang Lain"}
	}`)
	var otherProfile struct{ ID string }
	_ = json.NewDecoder(resp.Body).Decode(&otherProfile)
	resp.Body.Close()
	otherTenant := uuid.MustParse(otherProfile.ID)

	var otherWh uuid.UUID
	if err := testPool.QueryRow(ctx,
		"SELECT id FROM warehouses WHERE tenant_id = $1 AND code = 'LN-01'", otherTenant).Scan(&otherWh); err != nil {
		t.Fatalf("load other warehouse: %v", err)
	}
	var otherUser uuid.UUID
	if err := testPool.QueryRow(ctx,
		"SELECT id FROM users WHERE email = $1", "other@lain.co.id").Scan(&otherUser); err != nil {
		t.Fatalf("load other user: %v", err)
	}
	otherProd := uuid.New()
	if _, err := testPool.Exec(ctx,
		`INSERT INTO products (id, tenant_id, sku, name, base_uom) VALUES ($1, $2, 'ZZZ', 'Produk Z', 'pcs')`,
		otherProd, otherTenant); err != nil {
		t.Fatalf("seed other product: %v", err)
	}
	p := store.NewPoster(appPool, costing.NewAverage())
	if _, err := p.Post(ctx, posting.Request{
		TenantID: otherTenant, DocType: "goods_receipt", DocID: uuid.New(), Year: 2026,
		Movements: []stock.Movement{{
			Key: stock.Key{ProductID: otherProd, WarehouseID: otherWh}, Qty: dec2("99"),
			UnitCost: dec2("7"), Type: stock.Receipt, EffectiveAt: time.Now().UTC(), CreatedBy: otherUser,
		}},
	}); err != nil {
		t.Fatalf("post other: %v", err)
	}

	// The second tenant's stock-on-hand must contain only its own product.
	req, _ := http.NewRequest(http.MethodGet, s.ts.URL+"/v1/reports/stock-on-hand", nil)
	req.AddCookie(otherCookie)
	r2, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("other on-hand: %v", err)
	}
	defer r2.Body.Close()
	body, _ := io.ReadAll(r2.Body)
	str := string(body)
	if !bytes.Contains(body, []byte("ZZZ")) {
		t.Fatalf("second tenant should see its own product ZZZ; got:\n%s", str)
	}
	for _, leak := range []string{"AAA", "BBB", s.prodA.String(), s.whMain.String()} {
		if bytes.Contains(body, []byte(leak)) {
			t.Fatalf("second tenant leaked first tenant data %q; got:\n%s", leak, str)
		}
	}
}
