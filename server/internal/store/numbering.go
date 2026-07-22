package store

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// Numberer assigns a gapless document number without moving stock. Purchase and
// sales orders are intent only (glossary): posting them assigns the next gapless
// number for the tenant/type/year and renders it through the default template
// (ADR-0010), but writes no journal movements. It shares the same counter and
// rendering as the Poster, so numbers are gapless and formatted identically
// whether or not a document moves stock.
type Numberer struct {
	queries *Queries
}

// NewNumberer builds a Numberer over the shared query set. It runs inside a
// caller-provided tenant transaction (via WithTx) so the counter advance commits
// atomically with the document's status flip.
func NewNumberer(q *Queries) *Numberer {
	return &Numberer{queries: q}
}

// Next reserves and renders the next gapless number for a (tenant, docType,
// year). The counter row advances only when the surrounding transaction commits,
// keeping the posted sequence gapless (ADR-0010).
func (n *Numberer) Next(ctx context.Context, tenantID uuid.UUID, docType string, year int) (string, error) {
	seq, err := n.queries.NextDocumentNumber(ctx, NextDocumentNumberParams{
		TenantID: tenantID,
		DocType:  docType,
		Year:     int32(year),
	})
	if err != nil {
		return "", fmt.Errorf("numbering: assign %s number: %w", docType, err)
	}
	return renderDocNumber(docType, year, seq), nil
}
