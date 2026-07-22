package httpserver_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"
)

// D14: the activation flag is the manual billing kill-switch - a deactivated
// tenant must be unusable.
func TestDeactivatedTenantIsForbidden(t *testing.T) {
	ts := newTestServer(t)
	cookie, tenantID := onboard(t, ts, "budi@toko-makmur.co.id")

	if _, err := testPool.Exec(context.Background(),
		"UPDATE tenants SET active = false WHERE id = $1", tenantID); err != nil {
		t.Fatalf("deactivate: %v", err)
	}

	resp := doJSON(t, ts, http.MethodGet, "/v1/tenant", cookie, "")
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("deactivated tenant status = %d, want 403", resp.StatusCode)
	}
}

// D15: FIFO is selectable once the engine exists (M2). Until then onboarding
// must refuse it rather than commit a tenant to a valuation that cannot run.
func TestCreateTenantRejectsFifoUntilEngineExists(t *testing.T) {
	ts := newTestServer(t)
	registerUser(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")
	cookie := login(t, ts, "budi@toko-makmur.co.id", "kata-sandi-panjang")

	resp := createTenant(t, ts, cookie, `{
		"name": "PT FIFO Dulu",
		"costingMethod": "fifo",
		"warehouse": {"code": "GD-01", "name": "Gudang Utama"}
	}`)
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("fifo onboarding status = %d, want 422", resp.StatusCode)
	}
}

func TestUpdateUnknownMemberIsNotFound(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := onboard(t, ts, "budi@toko-makmur.co.id")

	resp := doJSON(t, ts, http.MethodPatch,
		"/v1/tenant/members/"+uuid.NewString(), cookie, `{"role": "viewer"}`)
	resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("unknown member status = %d, want 404", resp.StatusCode)
	}
}

// Spec-first (ADR-0007): an out-of-enum role is a validation error, not a
// database CHECK violation surfacing as 500.
func TestInvalidRoleIsValidationError(t *testing.T) {
	ts := newTestServer(t)
	cookie, _ := onboard(t, ts, "budi@toko-makmur.co.id")

	resp := doJSON(t, ts, http.MethodPost, "/v1/tenant/invites", cookie,
		`{"role": "superadmin"}`)
	resp.Body.Close()
	if resp.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("invalid role status = %d, want 422", resp.StatusCode)
	}
}
