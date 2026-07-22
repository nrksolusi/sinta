package httpserver

import (
	"context"
	"net/http"

	"github.com/google/uuid"

	"github.com/nrksolusi/sinta/internal/store"
)

// tenantCtx is the resolved authorization context for tenant-scoped requests:
// who is asking, which tenant is active, and their role in it (ADR-0005).
type tenantCtx struct {
	session  store.Session
	user     store.User
	tenant   store.Tenant
	tenantID uuid.UUID
	role     string
}

func (tc tenantCtx) isOwner() bool { return tc.role == "owner" }

func (tc tenantCtx) canManageInvites() bool {
	return tc.role == "owner" || tc.role == "admin"
}

// requireTenant authenticates the request and resolves the active tenant
// membership. On failure it writes the response and returns ok=false.
func (s *Server) requireTenant(w http.ResponseWriter, r *http.Request) (tenantCtx, bool) {
	session, user, err := s.currentSession(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "no valid session")
		return tenantCtx{}, false
	}
	if !session.ActiveTenantID.Valid {
		writeError(w, http.StatusForbidden, "no_active_tenant", "select a tenant first")
		return tenantCtx{}, false
	}
	tenantID := uuid.UUID(session.ActiveTenantID.Bytes)

	membership, err := s.queries.GetMembership(r.Context(), store.GetMembershipParams{
		UserID:   user.ID,
		TenantID: tenantID,
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "not_a_member", "you are not a member of this tenant")
		return tenantCtx{}, false
	}

	tenant, err := s.queries.GetTenant(r.Context(), tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load tenant")
		return tenantCtx{}, false
	}
	// D14: the activation flag is the manual billing kill-switch.
	if !tenant.Active {
		writeError(w, http.StatusForbidden, "tenant_inactive", "this tenant is deactivated")
		return tenantCtx{}, false
	}

	return tenantCtx{session: session, user: user, tenant: tenant, tenantID: tenantID, role: membership.Role}, true
}

// tenantTx runs fn inside a transaction with app.tenant_id set, so the RLS
// policies act as a second line of defense under the app-level scoping
// (ADR-0004). All tenant-scoped queries must go through this.
func (s *Server) tenantTx(ctx context.Context, tenantID uuid.UUID, fn func(q *store.Queries) error) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", tenantID.String()); err != nil {
		return err
	}
	if err := fn(s.queries.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
