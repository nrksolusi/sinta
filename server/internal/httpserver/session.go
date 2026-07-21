package httpserver

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/store"
)

const (
	sessionCookieName = "sinta_session"
	sessionTTL        = 30 * 24 * time.Hour
)

func pgUUID(id uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: id, Valid: true}
}

// isSecureRequest reports whether the client reached us over TLS, either
// directly or via the TLS-terminating proxy (Caddy sets X-Forwarded-Proto).
// Secure cookies over plain http are silently dropped by browsers - Safari
// even on localhost - so the flag must follow the actual scheme.
func isSecureRequest(r *http.Request) bool {
	return r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https"
}

func setSessionCookie(w http.ResponseWriter, r *http.Request, sessionID uuid.UUID, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID.String(),
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
	})
}

func clearSessionCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   isSecureRequest(r),
	})
}

// currentSession resolves the session cookie to a live session and its user.
// The zero uuid parse and missing-cookie cases fold into the same "not
// authenticated" outcome the handlers translate to 401.
func (s *Server) currentSession(r *http.Request) (store.Session, store.User, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		return store.Session{}, store.User{}, err
	}
	sessionID, err := uuid.Parse(cookie.Value)
	if err != nil {
		return store.Session{}, store.User{}, err
	}
	session, err := s.queries.GetSession(r.Context(), sessionID)
	if err != nil {
		return store.Session{}, store.User{}, err
	}
	user, err := s.queries.GetUserByID(r.Context(), session.UserID)
	if err != nil {
		return store.Session{}, store.User{}, err
	}
	return session, user, nil
}

// sessionInfo assembles the SessionInfo payload shared by login, getSession,
// and switchTenant responses.
func (s *Server) sessionInfo(ctx context.Context, user store.User, activeTenantID *uuid.UUID) (api.SessionInfo, error) {
	rows, err := s.queries.ListMembershipsForUser(ctx, user.ID)
	if err != nil {
		return api.SessionInfo{}, err
	}

	memberships := make([]api.Membership, 0, len(rows))
	for _, row := range rows {
		memberships = append(memberships, api.Membership{
			Role:   api.Role(row.Role),
			Tenant: api.Tenant{Id: row.TenantID, Name: row.TenantName},
		})
	}

	return api.SessionInfo{
		User: api.User{
			Id:    user.ID,
			Email: openapi_types.Email(user.Email),
			Name:  user.Name,
		},
		Memberships:    memberships,
		ActiveTenantId: activeTenantID,
	}, nil
}
