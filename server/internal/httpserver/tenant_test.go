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

// seedTenantWithMembership creates a tenant and adds the user (by email) as a
// member. Seeding goes straight to the database because tenant onboarding has
// no API yet; assertions still go through the HTTP seam.
func seedTenantWithMembership(t *testing.T, email, tenantName, role string) string {
	t.Helper()
	ctx := context.Background()

	var tenantID string
	err := testPool.QueryRow(ctx,
		"INSERT INTO tenants (name, active) VALUES ($1, true) RETURNING id::text",
		tenantName).Scan(&tenantID)
	if err != nil {
		t.Fatalf("seed tenant: %v", err)
	}

	_, err = testPool.Exec(ctx,
		`INSERT INTO memberships (user_id, tenant_id, role)
		 SELECT u.id, $2::uuid, $3 FROM users u WHERE u.email = $1`,
		email, tenantID, role)
	if err != nil {
		t.Fatalf("seed membership: %v", err)
	}
	return tenantID
}

func getSessionInfo(t *testing.T, ts *httptest.Server, cookie *http.Cookie) (status int, activeTenantID string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/auth/session", nil)
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	defer resp.Body.Close()

	var info struct {
		ActiveTenantId string `json:"activeTenantId"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&info)
	return resp.StatusCode, info.ActiveTenantId
}

func TestSwitchTenantActivatesMembershipTenant(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")
	tenantID := seedTenantWithMembership(t, "budi@toko-makmur.co.id", "PT Toko Makmur", "owner")
	cookie := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/auth/switch-tenant",
		strings.NewReader(jsonBody("tenantId", tenantID)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("switch tenant: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("switch status = %d, want 200; body: %s", resp.StatusCode, body)
	}
	var info struct {
		ActiveTenantId string `json:"activeTenantId"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if info.ActiveTenantId != tenantID {
		t.Errorf("activeTenantId = %q, want %q", info.ActiveTenantId, tenantID)
	}

	// The choice must stick to the session, not just the response.
	status, persisted := getSessionInfo(t, ts, cookie)
	if status != http.StatusOK || persisted != tenantID {
		t.Errorf("after switch, session activeTenantId = %q (status %d), want %q", persisted, status, tenantID)
	}
}

func TestSwitchTenantRejectsNonMember(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")
	registerUser(t, ts, "auditor@kap-jaya.co.id", "kata-sandi-panjang")
	// Tenant belongs to the auditor only; budi has no membership there.
	otherTenant := seedTenantWithMembership(t, "auditor@kap-jaya.co.id", "PT Milik Orang Lain", "owner")
	cookie := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/auth/switch-tenant",
		strings.NewReader(jsonBody("tenantId", otherTenant)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("switch tenant: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("switch status = %d, want 403", resp.StatusCode)
	}

	if _, active := getSessionInfo(t, ts, cookie); active != "" {
		t.Errorf("session activeTenantId = %q after forbidden switch, want empty", active)
	}
}

func TestSwitchTenantWithoutSessionIsUnauthorized(t *testing.T) {
	ts := newTestServer(t)

	resp, err := http.Post(ts.URL+"/v1/auth/switch-tenant", "application/json",
		strings.NewReader(jsonBody("tenantId", "00000000-0000-0000-0000-000000000000")))
	if err != nil {
		t.Fatalf("switch tenant: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestLoginRestoresLastActiveTenant(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")

	// End the session entirely, then log in fresh.
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/auth/logout", nil)
	req.AddCookie(cookie)
	if resp, err := http.DefaultClient.Do(req); err == nil {
		resp.Body.Close()
	}
	fresh := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	status, active := getSessionInfo(t, ts, fresh)
	if status != http.StatusOK || active != tenantID {
		t.Errorf("fresh login activeTenantId = %q (status %d), want last active %q", active, status, tenantID)
	}
}

func TestLoginIgnoresStaleLastActiveTenant(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")
	_ = cookie

	// Membership disappears (e.g. removed from the tenant).
	if _, err := testPool.Exec(context.Background(),
		"DELETE FROM memberships WHERE tenant_id = $1", tenantID); err != nil {
		t.Fatalf("remove membership: %v", err)
	}

	fresh := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")
	status, active := getSessionInfo(t, ts, fresh)
	if status != http.StatusOK || active != "" {
		t.Errorf("login with stale last-active tenant: activeTenantId = %q (status %d), want empty", active, status)
	}
}
