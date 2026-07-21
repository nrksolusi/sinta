package httpserver

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/auth"
	"github.com/nrksolusi/sinta/internal/store"
)

func (s *Server) Register(w http.ResponseWriter, r *http.Request) {
	var req api.RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_body", "request body is not valid JSON")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not process password")
		return
	}

	user, err := s.queries.CreateUser(r.Context(), store.CreateUserParams{
		Email:        string(req.Email),
		PasswordHash: hash,
		Name:         req.Name,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == pgerrcode.UniqueViolation {
			writeError(w, http.StatusConflict, "email_taken", "an account with this email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create account")
		return
	}

	writeJSON(w, http.StatusCreated, api.User{
		Id:    user.ID,
		Email: openapi_types.Email(user.Email),
		Name:  user.Name,
	})
}

func (s *Server) Login(w http.ResponseWriter, r *http.Request) {
	var req api.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "email or password is incorrect")
		return
	}

	user, err := s.queries.GetUserByEmail(r.Context(), string(req.Email))
	if err != nil {
		// Same response as a wrong password so accounts cannot be enumerated.
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "email or password is incorrect")
		return
	}

	ok, err := auth.VerifyPassword(user.PasswordHash, req.Password)
	if err != nil || !ok {
		writeError(w, http.StatusUnauthorized, "invalid_credentials", "email or password is incorrect")
		return
	}

	expires := time.Now().Add(sessionTTL)
	session, err := s.queries.CreateSession(r.Context(), store.CreateSessionParams{
		UserID:    user.ID,
		ExpiresAt: pgtype.Timestamptz{Time: expires, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not start session")
		return
	}

	info, err := s.sessionInfo(r.Context(), user, nil)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load session")
		return
	}

	setSessionCookie(w, session.ID, expires)
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) Logout(w http.ResponseWriter, r *http.Request) {
	session, _, err := s.currentSession(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "no valid session")
		return
	}
	if err := s.queries.DeleteSession(r.Context(), session.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not end session")
		return
	}
	clearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) GetSession(w http.ResponseWriter, r *http.Request) {
	session, user, err := s.currentSession(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthenticated", "no valid session")
		return
	}

	var activeTenantID *uuid.UUID
	if session.ActiveTenantID.Valid {
		id := uuid.UUID(session.ActiveTenantID.Bytes)
		activeTenantID = &id
	}

	info, err := s.sessionInfo(r.Context(), user, activeTenantID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not load session")
		return
	}
	writeJSON(w, http.StatusOK, info)
}

func (s *Server) SwitchTenant(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotImplemented, "not_implemented", "not implemented")
}
