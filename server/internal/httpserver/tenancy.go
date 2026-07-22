package httpserver

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/store"
)

// Wire enum (camelCase per CONVENTIONS.md) <-> database enum.
var costingToDB = map[api.CostingMethod]string{
	api.WeightedAverage: "weighted_average",
	api.Fifo:            "fifo",
}

var costingToAPI = map[string]api.CostingMethod{
	"weighted_average": api.WeightedAverage,
	"fifo":             api.Fifo,
}

func tenantProfile(tenant store.Tenant, role string) api.TenantProfile {
	return api.TenantProfile{
		Id:                   tenant.ID,
		Name:                 tenant.Name,
		LegalName:            tenant.LegalName,
		CostingMethod:        costingToAPI[tenant.CostingMethod],
		FiscalYearStartMonth: int(tenant.FiscalYearStartMonth),
		MyRole:               api.Role(role),
	}
}

func (s *Server) CreateTenant(w http.ResponseWriter, r *http.Request) {
	session, user, err := s.currentSession(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "no valid session")
		return
	}

	var req api.CreateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_body", "request body is not valid JSON")
		return
	}
	if req.Name == "" || req.Warehouse.Code == "" || req.Warehouse.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "missing_fields", "name and warehouse code/name are required")
		return
	}
	costing, ok := costingToDB[req.CostingMethod]
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, "invalid_costing_method", "costingMethod must be weightedAverage or fifo")
		return
	}
	// Temporary until the FIFO engine ships in M2 (PLAN.md D15): refuse to
	// commit a tenant to a valuation engine that cannot run yet.
	if req.CostingMethod == api.Fifo {
		writeError(w, http.StatusUnprocessableEntity, "fifo_not_yet_available", "FIFO costing will be available soon; choose weightedAverage for now")
		return
	}
	fiscalStart := int32(1)
	if req.FiscalYearStartMonth != nil {
		fiscalStart = int32(*req.FiscalYearStartMonth)
	}
	legalName := ""
	if req.LegalName != nil {
		legalName = *req.LegalName
	}

	// Tenant, owner membership, first warehouse, and session activation are one
	// atomic onboarding step - a tenant must never exist half-set-up.
	var tenant store.Tenant
	err = func() error {
		tx, err := s.pool.Begin(r.Context())
		if err != nil {
			return err
		}
		defer tx.Rollback(r.Context())
		q := s.queries.WithTx(tx)

		tenant, err = q.CreateTenant(r.Context(), store.CreateTenantParams{
			Name:                 req.Name,
			LegalName:            legalName,
			CostingMethod:        costing,
			FiscalYearStartMonth: fiscalStart,
		})
		if err != nil {
			return err
		}
		// The warehouses policy is fail-closed: tenant context must be set
		// before the first warehouse insert (ADR-0004).
		if _, err := tx.Exec(r.Context(), "SELECT set_config('app.tenant_id', $1, true)", tenant.ID.String()); err != nil {
			return err
		}
		if _, err := q.CreateMembership(r.Context(), store.CreateMembershipParams{
			UserID:   user.ID,
			TenantID: tenant.ID,
			Role:     "owner",
		}); err != nil {
			return err
		}
		if _, err := q.CreateWarehouse(r.Context(), store.CreateWarehouseParams{
			TenantID: tenant.ID,
			Code:     req.Warehouse.Code,
			Name:     req.Warehouse.Name,
		}); err != nil {
			return err
		}
		if err := q.SetSessionActiveTenant(r.Context(), store.SetSessionActiveTenantParams{
			ID:             session.ID,
			ActiveTenantID: pgUUID(tenant.ID),
		}); err != nil {
			return err
		}
		return tx.Commit(r.Context())
	}()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not onboard tenant")
		return
	}

	writeJSON(w, http.StatusCreated, tenantProfile(tenant, "owner"))
}

func (s *Server) GetTenant(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	// requireTenant already loaded the tenant row.
	writeJSON(w, http.StatusOK, tenantProfile(tc.tenant, tc.role))
}

func (s *Server) UpdateTenant(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	if !tc.isOwner() {
		writeError(w, http.StatusForbidden, "owner_only", "only the owner can update the tenant profile")
		return
	}

	var req api.UpdateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_body", "request body is not valid JSON")
		return
	}

	var tenant store.Tenant
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		current, err := q.GetTenant(r.Context(), tc.tenantID)
		if err != nil {
			return err
		}
		// Patch semantics: absent fields keep their current values.
		name := current.Name
		if req.Name != nil && *req.Name != "" {
			name = *req.Name
		}
		legalName := current.LegalName
		if req.LegalName != nil {
			legalName = *req.LegalName
		}
		fiscal := current.FiscalYearStartMonth
		if req.FiscalYearStartMonth != nil {
			fiscal = int32(*req.FiscalYearStartMonth)
		}
		tenant, err = q.UpdateTenant(r.Context(), store.UpdateTenantParams{
			ID:                   tc.tenantID,
			Name:                 name,
			LegalName:            legalName,
			FiscalYearStartMonth: fiscal,
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not update tenant")
		return
	}
	writeJSON(w, http.StatusOK, tenantProfile(tenant, tc.role))
}

func (s *Server) ListMembers(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}

	var rows []store.ListMembersRow
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.ListMembers(r.Context(), tc.tenantID)
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list members")
		return
	}

	members := make([]api.Member, 0, len(rows))
	for _, row := range rows {
		members = append(members, api.Member{
			UserId: row.UserID,
			Name:   row.Name,
			Email:  openapi_types.Email(row.Email),
			Role:   api.Role(row.Role),
		})
	}
	writeJSON(w, http.StatusOK, members)
}

// guardLastOwner returns a 409 error message when the change would leave the
// tenant with no owner; empty string means the change is safe.
func guardLastOwner(ctx context.Context, q *store.Queries, tc tenantCtx, targetUserID uuid.UUID, newRole string) (string, error) {
	target, err := q.GetMembership(ctx, store.GetMembershipParams{
		UserID:   targetUserID,
		TenantID: tc.tenantID,
	})
	if err != nil {
		return "", err
	}
	if target.Role != "owner" || newRole == "owner" {
		return "", nil
	}
	owners, err := q.CountOwners(ctx, tc.tenantID)
	if err != nil {
		return "", err
	}
	if owners <= 1 {
		return "a tenant must always have at least one owner", nil
	}
	return "", nil
}

func (s *Server) UpdateMember(w http.ResponseWriter, r *http.Request, userId openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	if !tc.isOwner() {
		writeError(w, http.StatusForbidden, "owner_only", "only the owner can change member roles")
		return
	}

	var req api.UpdateMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_body", "request body is not valid JSON")
		return
	}
	if !validRole(req.Role) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_role", "role must be one of owner, admin, warehouse, sales, viewer")
		return
	}

	var member api.Member
	var conflict string
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		conflict, err = guardLastOwner(r.Context(), q, tc, userId, string(req.Role))
		if err != nil || conflict != "" {
			return err
		}
		updated, err := q.UpdateMembershipRole(r.Context(), store.UpdateMembershipRoleParams{
			TenantID: tc.tenantID,
			UserID:   userId,
			Role:     string(req.Role),
		})
		if err != nil {
			return err
		}
		user, err := q.GetUserByID(r.Context(), updated.UserID)
		if err != nil {
			return err
		}
		member = api.Member{
			UserId: user.ID,
			Name:   user.Name,
			Email:  openapi_types.Email(user.Email),
			Role:   api.Role(updated.Role),
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "member_not_found", "no such member in this tenant")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not update member")
		return
	}
	if conflict != "" {
		writeError(w, http.StatusConflict, "last_owner", conflict)
		return
	}
	writeJSON(w, http.StatusOK, member)
}

func (s *Server) RemoveMember(w http.ResponseWriter, r *http.Request, userId openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	if !tc.isOwner() {
		writeError(w, http.StatusForbidden, "owner_only", "only the owner can remove members")
		return
	}

	var conflict string
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		// Removal is demotion to nothing: same last-owner rule applies.
		conflict, err = guardLastOwner(r.Context(), q, tc, userId, "")
		if err != nil || conflict != "" {
			return err
		}
		_, err = q.DeleteMembership(r.Context(), store.DeleteMembershipParams{
			TenantID: tc.tenantID,
			UserID:   userId,
		})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "member_not_found", "no such member in this tenant")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not remove member")
		return
	}
	if conflict != "" {
		writeError(w, http.StatusConflict, "last_owner", conflict)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

const inviteTTL = 7 * 24 * time.Hour

func newInviteToken() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func validRole(role api.Role) bool {
	switch role {
	case api.RoleOwner, api.RoleAdmin, api.RoleWarehouse, api.RoleSales, api.RoleViewer:
		return true
	}
	return false
}

func inviteToAPI(inv store.Invitation) api.Invite {
	return api.Invite{
		Id:        inv.ID,
		Role:      api.Role(inv.Role),
		Token:     inv.Token,
		ExpiresAt: inv.ExpiresAt.Time,
	}
}

func (s *Server) ListInvites(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	if !tc.canManageInvites() {
		writeError(w, http.StatusForbidden, "owner_or_admin_only", "only owners and admins manage invites")
		return
	}

	var rows []store.Invitation
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.ListInvitations(r.Context(), tc.tenantID)
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list invites")
		return
	}

	invites := make([]api.Invite, 0, len(rows))
	for _, row := range rows {
		invites = append(invites, inviteToAPI(row))
	}
	writeJSON(w, http.StatusOK, invites)
}

func (s *Server) CreateInvite(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	if !tc.canManageInvites() {
		writeError(w, http.StatusForbidden, "owner_or_admin_only", "only owners and admins manage invites")
		return
	}

	var req api.CreateInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_body", "request body is not valid JSON")
		return
	}
	if !validRole(req.Role) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_role", "role must be one of owner, admin, warehouse, sales, viewer")
		return
	}

	token, err := newInviteToken()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create invite")
		return
	}

	var invite store.Invitation
	err = s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		invite, err = q.CreateInvitation(r.Context(), store.CreateInvitationParams{
			TenantID:  tc.tenantID,
			Role:      string(req.Role),
			Token:     token,
			CreatedBy: tc.user.ID,
			ExpiresAt: pgtype.Timestamptz{Time: time.Now().Add(inviteTTL), Valid: true},
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not create invite")
		return
	}
	writeJSON(w, http.StatusCreated, inviteToAPI(invite))
}

func (s *Server) RevokeInvite(w http.ResponseWriter, r *http.Request, inviteId openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	if !tc.canManageInvites() {
		writeError(w, http.StatusForbidden, "owner_or_admin_only", "only owners and admins manage invites")
		return
	}

	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		_, err := q.DeleteInvitation(r.Context(), store.DeleteInvitationParams{
			TenantID: tc.tenantID,
			ID:       inviteId,
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not revoke invite")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// lookupInvite fetches an invite by token, translating not-found and expiry
// into the right HTTP status. ok=false means the response is already written.
func (s *Server) lookupInvite(w http.ResponseWriter, r *http.Request, token string) (store.GetInvitationByTokenRow, bool) {
	invite, err := s.queries.GetInvitationByToken(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusNotFound, "invite_not_found", "this invite does not exist or was revoked")
		return store.GetInvitationByTokenRow{}, false
	}
	if invite.ExpiresAt.Time.Before(time.Now()) {
		writeError(w, http.StatusGone, "invite_expired", "this invite has expired")
		return store.GetInvitationByTokenRow{}, false
	}
	return invite, true
}

func (s *Server) GetInvite(w http.ResponseWriter, r *http.Request, token string) {
	invite, ok := s.lookupInvite(w, r, token)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, api.InvitePublic{
		TenantName: invite.TenantName,
		Role:       api.Role(invite.Role),
	})
}

func (s *Server) AcceptInvite(w http.ResponseWriter, r *http.Request, token string) {
	session, user, err := s.currentSession(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "no valid session")
		return
	}

	invite, ok := s.lookupInvite(w, r, token)
	if !ok {
		return
	}

	// Joining and activating are one atomic step, mirroring onboarding.
	err = func() error {
		tx, err := s.pool.Begin(r.Context())
		if err != nil {
			return err
		}
		defer tx.Rollback(r.Context())
		q := s.queries.WithTx(tx)

		// Idempotent: an existing membership keeps its current role.
		if _, err := q.GetMembership(r.Context(), store.GetMembershipParams{
			UserID:   user.ID,
			TenantID: invite.TenantID,
		}); err != nil {
			if _, err := q.CreateMembership(r.Context(), store.CreateMembershipParams{
				UserID:   user.ID,
				TenantID: invite.TenantID,
				Role:     invite.Role,
			}); err != nil {
				return err
			}
		}
		if err := q.SetSessionActiveTenant(r.Context(), store.SetSessionActiveTenantParams{
			ID:             session.ID,
			ActiveTenantID: pgUUID(invite.TenantID),
		}); err != nil {
			return err
		}
		return tx.Commit(r.Context())
	}()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not join tenant")
		return
	}

	tenantID := invite.TenantID
	info, err := s.sessionInfo(r.Context(), user, &tenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load session")
		return
	}
	writeJSON(w, http.StatusOK, info)
}
