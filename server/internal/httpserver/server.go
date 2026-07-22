// Package httpserver implements the generated OpenAPI ServerInterface
// (ADR-0007): thin handlers over sqlc queries and internal/auth.
package httpserver

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/store"
)

type Server struct {
	pool    *pgxpool.Pool
	queries *store.Queries
	// poster finalizes a draft document into the journal (Track B): it appends
	// movements, assigns the gapless number, and refreshes stock levels in one
	// transaction under a per-key advisory lock (ADR-0010).
	poster posting.Poster
}

// New wires the server with the M1 weighted-average posting path. Document
// handlers build a posting.Request and call the poster to post (Track C).
func New(pool *pgxpool.Pool) *Server {
	return &Server{
		pool:    pool,
		queries: store.New(pool),
		poster:  store.NewPoster(pool, costing.NewAverage()),
	}
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
