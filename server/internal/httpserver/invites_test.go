package httpserver_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func createInvite(t *testing.T, ts *httptest.Server, cookie *http.Cookie, role string) (id, token string) {
	t.Helper()
	resp := doJSON(t, ts, http.MethodPost, "/v1/tenant/invites", cookie, jsonBody("role", role))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("create invite status = %d, want 201; body: %s", resp.StatusCode, body)
	}
	var invite struct {
		ID    string `json:"id"`
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&invite); err != nil {
		t.Fatalf("decode invite: %v", err)
	}
	if invite.Token == "" {
		t.Fatal("invite has no token")
	}
	return invite.ID, invite.Token
}

func TestInviteLinkFullFlow(t *testing.T) {
	ts := newTestServer(t)
	ownerCookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")
	_, token := createInvite(t, ts, ownerCookie, "warehouse")

	// Public landing info - no auth.
	resp := doJSON(t, ts, http.MethodGet, "/v1/invites/"+token, nil, "")
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("public lookup status = %d, want 200", resp.StatusCode)
	}
	var pub struct {
		TenantName string `json:"tenantName"`
		Role       string `json:"role"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pub); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if pub.TenantName != "PT Toko Makmur" || pub.Role != "warehouse" {
		t.Errorf("public info = %+v", pub)
	}

	// A new user registers and accepts - joins with the invite's role.
	registerUser(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	staffCookie := login(t, ts, "staff@toko-makmur.co.id", "kata-sandi-panjang")
	resp2 := doJSON(t, ts, http.MethodPost, "/v1/invites/"+token+"/accept", staffCookie, "")
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp2.Body)
		t.Fatalf("accept status = %d, want 200; body: %s", resp2.StatusCode, body)
	}
	var info struct {
		ActiveTenantId string `json:"activeTenantId"`
		Memberships    []struct {
			Role   string `json:"role"`
			Tenant struct {
				Id string `json:"id"`
			} `json:"tenant"`
		} `json:"memberships"`
	}
	if err := json.NewDecoder(resp2.Body).Decode(&info); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	if info.ActiveTenantId != tenantID {
		t.Errorf("activeTenantId = %q, want %q", info.ActiveTenantId, tenantID)
	}
	if len(info.Memberships) != 1 || info.Memberships[0].Role != "warehouse" {
		t.Errorf("memberships = %+v, want one warehouse membership", info.Memberships)
	}

	// Accepting again is idempotent, not an error.
	resp3 := doJSON(t, ts, http.MethodPost, "/v1/invites/"+token+"/accept", staffCookie, "")
	resp3.Body.Close()
	if resp3.StatusCode != http.StatusOK {
		t.Errorf("second accept status = %d, want 200", resp3.StatusCode)
	}
}

func TestCreateInviteRequiresOwnerOrAdmin(t *testing.T) {
	ts := newTestServer(t)
	_, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")
	registerUser(t, ts, "sales@toko-makmur.co.id", "kata-sandi-panjang")
	seedMembership(t, "sales@toko-makmur.co.id", tenantID, "sales")
	salesCookie := login(t, ts, "sales@toko-makmur.co.id", "kata-sandi-panjang")
	switchTenant(t, ts, salesCookie, tenantID)

	resp := doJSON(t, ts, http.MethodPost, "/v1/tenant/invites", salesCookie, jsonBody("role", "viewer"))
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("sales create invite status = %d, want 403", resp.StatusCode)
	}
}

func TestExpiredInviteIsGone(t *testing.T) {
	ts := newTestServer(t)
	ownerCookie, _ := onboard(t, ts, "budi@toko-makmur.co.id")
	_, token := createInvite(t, ts, ownerCookie, "viewer")

	if _, err := testPool.Exec(context.Background(),
		"UPDATE invitations SET expires_at = now() - interval '1 hour' WHERE token = $1", token); err != nil {
		t.Fatalf("expire invite: %v", err)
	}

	resp := doJSON(t, ts, http.MethodGet, "/v1/invites/"+token, nil, "")
	resp.Body.Close()
	if resp.StatusCode != http.StatusGone {
		t.Fatalf("expired lookup status = %d, want 410", resp.StatusCode)
	}
}

func TestRevokeInvite(t *testing.T) {
	ts := newTestServer(t)
	ownerCookie, _ := onboard(t, ts, "budi@toko-makmur.co.id")
	inviteID, token := createInvite(t, ts, ownerCookie, "viewer")

	resp := doJSON(t, ts, http.MethodDelete, "/v1/tenant/invites/"+inviteID, ownerCookie, "")
	resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("revoke status = %d, want 204", resp.StatusCode)
	}

	resp2 := doJSON(t, ts, http.MethodGet, "/v1/invites/"+token, nil, "")
	resp2.Body.Close()
	if resp2.StatusCode != http.StatusNotFound {
		t.Fatalf("revoked lookup status = %d, want 404", resp2.StatusCode)
	}
}
