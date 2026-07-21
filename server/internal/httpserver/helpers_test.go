package httpserver_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func seedMembership(t *testing.T, email, tenantID, role string) {
	t.Helper()
	_, err := testPool.Exec(context.Background(),
		`INSERT INTO memberships (user_id, tenant_id, role)
		 SELECT u.id, $2::uuid, $3 FROM users u WHERE u.email = $1`,
		email, tenantID, role)
	if err != nil {
		t.Fatalf("seed membership: %v", err)
	}
}

func switchTenant(t *testing.T, ts *httptest.Server, cookie *http.Cookie, tenantID string) {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/v1/auth/switch-tenant",
		strings.NewReader(jsonBody("tenantId", tenantID)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("switch tenant: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("switch tenant status = %d, want 200", resp.StatusCode)
	}
}
