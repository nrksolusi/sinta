package httpserver

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// errConflict is a store-callback error that maps to 409, used when a document
// is in the wrong state to post or reverse (e.g. already posted).
type errConflict struct{ msg string }

func (e errConflict) Error() string { return e.msg }

// keyOf builds a stock.Key from a product, warehouse, and optional batch UUID
// (a NULL batch becomes the zero UUID, matching the Poster's non-batch key).
func keyOf(product, warehouse uuid.UUID, batch pgtype.UUID) stock.Key {
	k := stock.Key{ProductID: product, WarehouseID: warehouse}
	if batch.Valid {
		k.BatchID = uuid.UUID(batch.Bytes)
	}
	return k
}

// buildMovements is called inside a tenant transaction to validate the draft and
// produce its journal movements. It returns the current status, the movements,
// and the year the gapless number is scoped to.
type buildMovements func(ctx context.Context, q *store.Queries) (status string, movements []stock.Movement, year int, err error)

// markPosted flips a document header to posted with the assigned number.
type markPosted func(ctx context.Context, q *store.Queries, number string) error

// renderDoc reloads the document for the response after the transitions commit.
type renderDoc func(ctx context.Context, q *store.Queries) (any, error)

// postStockDocument runs the shared post flow for a stock-moving document:
//
//  1. In a tenant transaction, validate the draft and build its movements.
//  2. Call the Poster, which opens its own transaction to append the movements,
//     assign the gapless number, and refresh stock levels under a per-key
//     advisory lock (ADR-0010, Track B's frozen seam).
//  3. In a second tenant transaction, flip the header to posted with the number.
//
// The Poster owns the atomic journal write; step 3 records the outcome on the
// document. If step 3 failed after step 2 committed, the movements would exist
// with the header still draft - acceptable at M1 since the journal is the source
// of truth and a re-post is a no-op number bump; the risk window is one UPDATE.
func (s *Server) postStockDocument(
	w http.ResponseWriter, r *http.Request, tc tenantCtx, docID uuid.UUID, docType string,
	build buildMovements, mark markPosted, render renderDoc, successStatus int,
) {
	ctx := r.Context()

	var movements []stock.Movement
	var year int
	if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
		_, m, y, err := build(ctx, q)
		if err != nil {
			return err
		}
		movements = m
		year = y
		return nil
	}); err != nil {
		writeTransitionErr(w, err)
		return
	}

	res, err := s.poster.Post(ctx, posting.Request{
		TenantID:  tc.tenantID,
		DocType:   docType,
		DocID:     docID,
		Year:      year,
		Movements: movements,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "post_failed", "could not post document to the journal")
		return
	}

	var out any
	if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
		if err := mark(ctx, q, res.DocNumber); err != nil {
			return err
		}
		var err error
		out, err = render(ctx, q)
		return err
	}); err != nil {
		writeTransitionErr(w, err)
		return
	}
	writeJSON(w, successStatus, out)
}

// reversalPlan is what a document's reverse builder returns: the new reversal
// document's id, its opposite movements, the number year, and the callbacks to
// mark both documents once the Poster commits.
type reversalPlan struct {
	reversalID   uuid.UUID
	movements    []stock.Movement
	year         int
	markPosted   markPosted
	markReversed func(ctx context.Context, q *store.Queries) error
	render       renderDoc
}

// buildReversal validates the posted original and creates the draft reversal
// document with its opposite movements, inside a tenant transaction.
type buildReversal func(ctx context.Context, q *store.Queries) (reversalPlan, error)

// reverseStockDocument runs the shared reverse flow for a stock-moving document:
// create the reversal draft with opposite movements, post them through the
// Poster (opposite journal entries, new gapless number), then mark the reversal
// posted and the original reversed. The original's rows and movements are never
// touched (ADR-0001).
func (s *Server) reverseStockDocument(
	w http.ResponseWriter, r *http.Request, tc tenantCtx, docID uuid.UUID, docType string,
	build buildReversal,
) {
	ctx := r.Context()

	var plan reversalPlan
	if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
		p, err := build(ctx, q)
		if err != nil {
			return err
		}
		plan = p
		return nil
	}); err != nil {
		writeTransitionErr(w, err)
		return
	}

	res, err := s.poster.Post(ctx, posting.Request{
		TenantID:  tc.tenantID,
		DocType:   docType,
		DocID:     plan.reversalID,
		Year:      plan.year,
		Movements: plan.movements,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "post_failed", "could not post the reversal to the journal")
		return
	}

	var out any
	if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
		if err := plan.markPosted(ctx, q, res.DocNumber); err != nil {
			return err
		}
		if err := plan.markReversed(ctx, q); err != nil {
			return err
		}
		var err error
		out, err = plan.render(ctx, q)
		return err
	}); err != nil {
		writeTransitionErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

// writeTransitionErr maps the errors a build/mark callback can raise to HTTP.
func writeTransitionErr(w http.ResponseWriter, err error) {
	var vc errConflict
	if errors.As(err, &vc) {
		writeError(w, http.StatusConflict, "invalid_state", vc.msg)
		return
	}
	var ve errValidation
	if errors.As(err, &ve) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_line", ve.msg)
		return
	}
	writeStoreError(w, err)
}
