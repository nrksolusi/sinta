package httpserver_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func createTenant(t *testing.T, ts *httptest.Server, cookie *http.Cookie, body string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/tenants", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("create tenant: %v", err)
	}
	return resp
}

const validTenantBody = `{
	"name": "PT Toko Makmur",
	"legalName": "PT Toko Makmur Sejahtera",
	"costingMethod": "weightedAverage",
	"fiscalYearStartMonth": 1,
	"warehouse": {"code": "GD-01", "name": "Gudang Utama"}
}`

func TestCreateTenantOnboardsOwnerWithWarehouse(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	resp := createTenant(t, ts, cookie, validTenantBody)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 201; body: %s", resp.StatusCode, body)
	}

	var profile struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		CostingMethod string `json:"costingMethod"`
		MyRole        string `json:"myRole"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if profile.MyRole != "owner" {
		t.Errorf("myRole = %q, want owner", profile.MyRole)
	}
	if profile.CostingMethod != "weightedAverage" {
		t.Errorf("costingMethod = %q, want weightedAverage", profile.CostingMethod)
	}

	// The new tenant must be active on the session immediately.
	status, active := getSessionInfo(t, ts, cookie)
	if status != http.StatusOK || active != profile.ID {
		t.Errorf("session activeTenantId = %q (status %d), want %q", active, status, profile.ID)
	}

	// The first warehouse must exist for the tenant.
	var warehouses int
	if err := testPool.QueryRow(context.Background(),
		"SELECT count(*) FROM warehouses WHERE tenant_id = $1 AND code = 'GD-01'",
		profile.ID).Scan(&warehouses); err != nil {
		t.Fatalf("count warehouses: %v", err)
	}
	if warehouses != 1 {
		t.Errorf("warehouse count = %d, want 1", warehouses)
	}
}

func TestCreateTenantRequiresAuth(t *testing.T) {
	ts := newTestServer(t)

	resp := createTenant(t, ts, nil, validTenantBody)
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}
