package httpserver_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

type memberResp struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Role   string `json:"role"`
}

func listMembers(t *testing.T, ts *httptest.Server, cookie *http.Cookie) []memberResp {
	t.Helper()
	resp := doJSON(t, ts, http.MethodGet, "/v1/tenant/members", cookie, "")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list members status = %d, want 200", resp.StatusCode)
	}
	var members []memberResp
	if err := json.NewDecoder(resp.Body).Decode(&members); err != nil {
		t.Fatalf("decode members: %v", err)
	}
	return members
}

func userIDByEmail(t *testing.T, email string) string {
	t.Helper()
	var id string
	if err := testPool.QueryRow(context.Background(),
		"SELECT id::text FROM users WHERE email = $1", email).Scan(&id); err != nil {
		t.Fatalf("lookup user: %v", err)
	}
	return id
}

func TestListMembersShowsAllRoles(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")
	registerUser(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	seedMembership(t, "staff@toko-makmur.co.id", tenantID, "warehouse")

	members := listMembers(t, ts, cookie)
	if len(members) != 2 {
		t.Fatalf("member count = %d, want 2", len(members))
	}
	roles := map[string]string{}
	for _, m := range members {
		roles[m.Email] = m.Role
	}
	if roles["budi@toko-makmur.co.id"] != "owner" || roles["staff@toko-makmur.co.id"] != "warehouse" {
		t.Errorf("roles = %v", roles)
	}
}

func TestUpdateMemberRoleOwnerOnly(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")
	registerUser(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	seedMembership(t, "staff@toko-makmur.co.id", tenantID, "viewer")
	staffID := userIDByEmail(t, "staff@toko-makmur.co.id")

	// Owner promotes viewer to admin.
	resp := doJSON(t, ts, http.MethodPatch, "/v1/tenant/members/"+staffID, cookie, `{"role": "admin"}`)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("promote status = %d, want 200; body: %s", resp.StatusCode, body)
	}
	var updated memberResp
	if err := json.NewDecoder(resp.Body).Decode(&updated); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if updated.Role != "admin" {
		t.Errorf("role = %q, want admin", updated.Role)
	}

	// The (now) admin still cannot change roles - owner only.
	staffCookie := login(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	switchTenant(t, ts, staffCookie, tenantID)
	ownerID := userIDByEmail(t, "budi@toko-makmur.co.id")
	resp2 := doJSON(t, ts, http.MethodPatch, "/v1/tenant/members/"+ownerID, staffCookie, `{"role": "viewer"}`)
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusForbidden {
		t.Fatalf("admin changing roles status = %d, want 403", resp2.StatusCode)
	}
}

func TestLastOwnerCannotBeDemotedOrRemoved(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := onboard(t, ts, "budi@toko-makmur.co.id")
	ownerID := userIDByEmail(t, "budi@toko-makmur.co.id")

	resp := doJSON(t, ts, http.MethodPatch, "/v1/tenant/members/"+ownerID, cookie, `{"role": "admin"}`)
	resp.Body.Close()
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("demote last owner status = %d, want 409", resp.StatusCode)
	}

	resp2 := doJSON(t, ts, http.MethodDelete, "/v1/tenant/members/"+ownerID, cookie, "")
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusConflict {
		t.Fatalf("remove last owner status = %d, want 409", resp2.StatusCode)
	}
}

func TestRemoveMember(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")
	registerUser(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	seedMembership(t, "staff@toko-makmur.co.id", tenantID, "sales")
	staffID := userIDByEmail(t, "staff@toko-makmur.co.id")

	resp := doJSON(t, ts, http.MethodDelete, "/v1/tenant/members/"+staffID, cookie, "")
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("remove status = %d, want 204", resp.StatusCode)
	}

	if got := len(listMembers(t, ts, cookie)); got != 1 {
		t.Errorf("member count after removal = %d, want 1", got)
	}
}
