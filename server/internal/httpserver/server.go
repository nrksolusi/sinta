// Package httpserver implements the generated OpenAPI ServerInterface
// (ADR-0007): thin handlers over sqlc queries and internal/auth.
package httpserver

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/store"
)

type Server struct {
	pool    *pgxpool.Pool
	queries *store.Queries
}

func New(pool *pgxpool.Pool) *Server {
	return &Server{pool: pool, queries: store.New(pool)}
}

// Handler mounts the API under /v1 as declared in the OpenAPI spec.
func (s *Server) Handler() http.Handler {
	return api.HandlerWithOptions(s, api.StdHTTPServerOptions{BaseURL: "/v1"})
}

var _ api.ServerInterface = (*Server)(nil)

func (s *Server) GetHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, api.Health{Status: api.Ok})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, api.Error{Code: code, Message: message})
}
