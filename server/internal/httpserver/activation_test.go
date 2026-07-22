package httpserver_test

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

// ADR-0012: tenant creation is rate-limited per user, on top of the
// activation soft cap.
func TestCreateTenantRateLimited(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "spam@pabrik-tenant.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "spam@pabrik-tenant.co.id", "kata-sandi-panjang")

	for i := 1; i <= 5; i++ {
		resp := createTenant(t, ts, cookie, validTenantBody)
		resp.Body.Close()
		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("tenant %d: status = %d, want 201", i, resp.StatusCode)
		}
	}

	resp := createTenant(t, ts, cookie, validTenantBody)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("6th creation: status = %d, want 429", resp.StatusCode)
	}
	var apiErr struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&apiErr); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if apiErr.Code != "too_many_attempts" {
		t.Errorf("code = %q, want too_many_attempts", apiErr.Code)
	}
}

// ADR-0012: the first 3 self-served tenants per user start active; from the
// 4th onward they are created inactive and wait for manual activation.
func TestTenantCreationSoftCap(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "rani@multi-usaha.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "rani@multi-usaha.co.id", "kata-sandi-panjang")

	var lastTenantID string
	for i := 1; i <= 4; i++ {
		resp := createTenant(t, ts, cookie, validTenantBody)
		if resp.StatusCode != http.StatusCreated {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			t.Fatalf("tenant %d: status = %d, want 201; body: %s", i, resp.StatusCode, body)
		}
		var profile struct {
			ID     string `json:"id"`
			Active bool   `json:"active"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
			t.Fatalf("tenant %d: decode: %v", i, err)
		}
		resp.Body.Close()

		wantActive := i <= 3
		if profile.Active != wantActive {
			t.Errorf("tenant %d: active = %v, want %v", i, profile.Active, wantActive)
		}
		lastTenantID = profile.ID
	}

	// The session must expose per-tenant active flags so the client can render
	// the waiting-activation state.
	req, _ := http.NewRequest(http.MethodGet, ts.URL+"/v1/auth/session", nil)
	req.AddCookie(cookie)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("get session: %v", err)
	}
	defer resp.Body.Close()
	var session struct {
		Memberships []struct {
			Tenant struct {
				ID     string `json:"id"`
				Active bool   `json:"active"`
			} `json:"tenant"`
		} `json:"memberships"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&session); err != nil {
		t.Fatalf("decode session: %v", err)
	}
	activeCount := 0
	lastSeen := false
	for _, mb := range session.Memberships {
		if mb.Tenant.Active {
			activeCount++
		}
		if mb.Tenant.ID == lastTenantID {
			lastSeen = true
			if mb.Tenant.Active {
				t.Errorf("4th tenant reported active in session memberships")
			}
		}
	}
	if !lastSeen {
		t.Fatalf("4th tenant missing from session memberships")
	}
	if activeCount != 3 {
		t.Errorf("active tenants in session = %d, want 3", activeCount)
	}
}
