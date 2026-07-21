package httpserver_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// onboard registers, logs in, and creates a tenant - returns the cookie and tenant id.
func onboard(t *testing.T, ts *httptest.Server, email string) (*http.Cookie, string) {
	t.Helper()
	registerUser(t, ts, email, "kata-sandi-panjang")
	cookie := login(t, ts, email, "kata-sandi-panjang")
	resp := createTenant(t, ts, cookie, validTenantBody)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("onboard tenant: status %d, body %s", resp.StatusCode, body)
	}
	var profile struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return cookie, profile.ID
}

func doJSON(t *testing.T, ts *httptest.Server, method, path string, cookie *http.Cookie, body string) *http.Response {
	t.Helper()
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	req, _ := http.NewRequest(method, ts.URL+path, reader)
	req.Header.Set("Content-Type", "application/json")
	if cookie != nil {
		req.AddCookie(cookie)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	return resp
}

func TestGetTenantReturnsActiveProfile(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")

	resp := doJSON(t, ts, http.MethodGet, "/v1/tenant", cookie, "")
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var profile struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		MyRole string `json:"myRole"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if profile.ID != tenantID || profile.Name != "PT Toko Makmur" || profile.MyRole != "owner" {
		t.Errorf("profile = %+v, want onboarded tenant with owner role", profile)
	}
}

func TestGetTenantWithoutActiveTenantIsForbidden(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "baru@toko.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "baru@toko.co.id", "kata-sandi-panjang")

	resp := doJSON(t, ts, http.MethodGet, "/v1/tenant", cookie, "")
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", resp.StatusCode)
	}
}

func TestUpdateTenantOwnerOnly(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")

	// Owner can update.
	resp := doJSON(t, ts, http.MethodPatch, "/v1/tenant", cookie,
		`{"name": "PT Toko Makmur Baru"}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("owner patch status = %d, want 200; body: %s", resp.StatusCode, body)
	}
	var profile struct {
		Name      string `json:"name"`
		LegalName string `json:"legalName"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if profile.Name != "PT Toko Makmur Baru" {
		t.Errorf("name = %q, want updated name", profile.Name)
	}
	if profile.LegalName != "PT Toko Makmur Sejahtera" {
		t.Errorf("legalName = %q - patching one field must not clear others", profile.LegalName)
	}

	// A viewer in the same tenant cannot update.
	registerUser(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	seedMembership(t, "staff@toko-makmur.co.id", tenantID, "viewer")
	staffCookie := login(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	switchTenant(t, ts, staffCookie, tenantID)

	resp2 := doJSON(t, ts, http.MethodPatch, "/v1/tenant", staffCookie, `{"name": "Hacked"}`)
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusForbidden {
		t.Fatalf("viewer patch status = %d, want 403", resp2.StatusCode)
	}
}
