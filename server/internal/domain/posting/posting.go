// Package posting defines the contract for finalizing a draft document into the
// journal. Posting appends the document's movements, assigns the gapless
// document number, and refreshes the derived stock levels - all in one
// transaction that takes a per-key advisory lock, so journal seq and
// stock_levels stay consistent under concurrent posting (PLAN.md section 3,
// ADR-0010).
//
// This is the Track 0 seam between Track C and Track B: document handlers build
// a Request from a draft document and call Post; the implementation lives in
// Track B over the store. The types below stay DB-agnostic (context is not a
// database import) so both sides compile independently.
package posting

import (
	"context"

	"github.com/google/uuid"

	"github.com/nrksolusi/sinta/internal/domain/stock"
)

// Request is a draft document ready to post. Movements are what the document
// contributes to the journal; every movement carries the document's DocType and
// DocID. Year scopes the gapless number (reset per tenant, type, and year).
type Request struct {
	TenantID  uuid.UUID
	DocType   string
	DocID     uuid.UUID
	Year      int
	Movements []stock.Movement
}

// Result reports the outcome of a successful posting.
type Result struct {
	// DocNumber is the gapless number assigned at posting, rendered through the
	// tenant's numbering template (default {TYPE}-{YYYY}-{NNNNN} in M1, ADR-0010).
	DocNumber string
}

// Poster finalizes a document atomically. Implementations take the per-key
// advisory lock, append the movements, assign the gapless number, and update
// stock levels within a single transaction. Posting is only ever additive to
// the journal; nothing already posted is mutated (ADR-0001).
type Poster interface {
	Post(ctx context.Context, req Request) (Result, error)
}
