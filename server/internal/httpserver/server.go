// Package httpserver implements the generated OpenAPI ServerInterface
// (ADR-0007): thin handlers over sqlc queries and internal/auth.
package httpserver

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/auth"
	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/store"
)

type Server struct {
	pool                *pgxpool.Pool
	queries             *store.Queries
	loginLimiter        *auth.RateLimiter
	createTenantLimiter *auth.RateLimiter
	// poster finalizes a draft document into the journal (Track B): it appends
	// movements, assigns the gapless number, and refreshes stock levels in one
	// transaction under a per-key advisory lock (ADR-0010).
	poster posting.Poster
}

// New wires the server with the M1 weighted-average posting path. Document
// handlers build a posting.Request and call the poster to post (Track C).
func New(pool *pgxpool.Pool) *Server {
	return &Server{
		pool:         pool,
		queries:      store.New(pool),
		loginLimiter: auth.NewRateLimiter(5, 15*time.Minute),
		// ADR-0012: the soft cap handles free-tenant abuse; this only has to
		// stop someone scripting bulk creations.
		createTenantLimiter: auth.NewRateLimiter(5, time.Hour),
		poster:              store.NewPoster(pool, costing.NewAverage()),
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

// writeInternal logs the underlying error before answering with an opaque
// 500 - the client never sees internals, but the server log always does.
func writeInternal(w http.ResponseWriter, err error, message string) {
	log.Printf("internal error: %s: %v", message, err)
	writeError(w, http.StatusInternalServerError, "internal", message)
}
