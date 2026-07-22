package httpserver

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// Stock opname: a physical count against the system (glossary). Posting computes
// the variance per line (counted qty minus current on-hand) and produces one
// adjustment movement per nonzero variance; lines that match need no movement.
// The variance is valued at the current average (the engine handles it). A count
// with no discrepancies posts and numbers the document but writes no movements -
// so an all-matching opname cannot be posted through the Poster (which rejects an
// empty request); those are numbered directly. Reversal negates every variance.

func stockOpnameToAPI(o store.StockOpname, lines []store.StockOpnameLine, actors docActors) api.StockOpname {
	apiLines := make([]api.StockOpnameLine, 0, len(lines))
	for _, l := range lines {
		line := api.StockOpnameLine{
			Id:         l.ID,
			LineNo:     int(l.LineNo),
			ProductId:  l.ProductID,
			BatchId:    pgUUIDPtr(l.BatchID),
			Uom:        l.Uom,
			CountedQty: numericToString(l.CountedQty),
		}
		if l.SystemQty.Valid {
			s := numericToString(l.SystemQty)
			line.SystemQty = &s
		}
		apiLines = append(apiLines, line)
	}
	return api.StockOpname{
		Id:           o.ID,
		DocNumber:    textPtr(o.DocNumber),
		Status:       api.DocumentStatus(o.Status),
		WarehouseId:  o.WarehouseID,
		DocDate:      pgToDate(o.DocDate),
		Notes:        o.Notes,
		ReversesId:   pgUUIDPtr(o.ReversesID),
		ReversedById: pgUUIDPtr(o.ReversedByID),
		CreatedAt:    pgTimestamp(o.CreatedAt),
		CreatedBy:    actors.createdBy,
		PostedAt:     pgTimestampPtr(o.PostedAt),
		PostedBy:     actors.postedBy,
		Lines:        apiLines,
	}
}

func (s *Server) loadStockOpname(ctx context.Context, q *store.Queries, tenantID, id uuid.UUID) (api.StockOpname, error) {
	o, err := q.GetStockOpname(ctx, store.GetStockOpnameParams{TenantID: tenantID, ID: id})
	if err != nil {
		return api.StockOpname{}, err
	}
	lines, err := q.ListStockOpnameLines(ctx, store.ListStockOpnameLinesParams{TenantID: tenantID, StockOpnameID: id})
	if err != nil {
		return api.StockOpname{}, err
	}
	actors, err := loadDocActors(ctx, q, o.CreatedBy, o.PostedBy)
	if err != nil {
		return api.StockOpname{}, err
	}
	return stockOpnameToAPI(o, lines, actors), nil
}

func (s *Server) ListStockOpnames(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out []api.StockOpname
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		rows, err := q.ListStockOpnames(r.Context(), tc.tenantID)
		if err != nil {
			return err
		}
		out = make([]api.StockOpname, 0, len(rows))
		for _, o := range rows {
			lines, err := q.ListStockOpnameLines(r.Context(), store.ListStockOpnameLinesParams{TenantID: tc.tenantID, StockOpnameID: o.ID})
			if err != nil {
				return err
			}
			actors, err := loadDocActors(r.Context(), q, o.CreatedBy, o.PostedBy)
			if err != nil {
				return err
			}
			out = append(out, stockOpnameToAPI(o, lines, actors))
		}
		return nil
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) CreateStockOpname(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.StockOpnameInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.StockOpname
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		o, err := q.CreateStockOpname(r.Context(), store.CreateStockOpnameParams{
			TenantID:    tc.tenantID,
			WarehouseID: req.WarehouseId,
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
			Status:      statusDraft,
			CreatedBy:   tc.user.ID,
		})
		if err != nil {
			return err
		}
		if err := s.insertStockOpnameLines(r.Context(), q, tc.tenantID, o.ID, req.Lines); err != nil {
			return err
		}
		out, err = s.loadStockOpname(r.Context(), q, tc.tenantID, o.ID)
		return err
	})
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) insertStockOpnameLines(ctx context.Context, q *store.Queries, tenantID, oID uuid.UUID, lines []api.StockOpnameLineInput) error {
	for i, l := range lines {
		counted, err := parseDecimal(l.CountedQty)
		if err != nil || counted.IsNegative() {
			return errValidation{"counted qty must be a non-negative decimal"}
		}
		countedNum, _ := store.Numeric(counted)
		batch, _ := optBatch(l.BatchId)
		if _, err := q.InsertStockOpnameLine(ctx, store.InsertStockOpnameLineParams{
			TenantID:      tenantID,
			StockOpnameID: oID,
			LineNo:        int32(i + 1),
			ProductID:     l.ProductId,
			BatchID:       batch,
			Uom:           l.Uom,
			CountedQty:    countedNum,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) GetStockOpname(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out api.StockOpname
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		out, err = s.loadStockOpname(r.Context(), q, tc.tenantID, id)
		return err
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) UpdateStockOpname(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.StockOpnameInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.StockOpname
	var immutable bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetStockOpname(r.Context(), store.GetStockOpnameParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			immutable = true
			return nil
		}
		if _, err := q.UpdateStockOpnameHeader(r.Context(), store.UpdateStockOpnameHeaderParams{
			TenantID:    tc.tenantID,
			ID:          id,
			WarehouseID: req.WarehouseId,
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
		}); err != nil {
			return err
		}
		if err := q.DeleteStockOpnameLines(r.Context(), store.DeleteStockOpnameLinesParams{TenantID: tc.tenantID, StockOpnameID: id}); err != nil {
			return err
		}
		if err := s.insertStockOpnameLines(r.Context(), q, tc.tenantID, id, req.Lines); err != nil {
			return err
		}
		out, err = s.loadStockOpname(r.Context(), q, tc.tenantID, id)
		return err
	})
	if immutable {
		writeError(w, http.StatusConflict, "not_draft", "a posted document is immutable")
		return
	}
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) DeleteStockOpname(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var notDraft bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetStockOpname(r.Context(), store.GetStockOpnameParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			notDraft = true
			return nil
		}
		return q.DeleteStockOpname(r.Context(), store.DeleteStockOpnameParams{TenantID: tc.tenantID, ID: id})
	})
	if notDraft {
		writeError(w, http.StatusConflict, "not_draft", "only draft documents can be deleted")
		return
	}
	if handleWriteErr(w, err) {
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// PostStockOpname posts the count: it reads the current on-hand for each line,
// builds an adjustment movement for the nonzero variance, and posts them. When
// every line matches (no variance) there are no movements, so it numbers the
// document directly rather than calling the Poster (which needs movements).
func (s *Server) PostStockOpname(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	ctx := r.Context()

	// Phase 1: read the draft, compute variances against current stock levels.
	var movements []stock.Movement
	var year int
	var noVariance bool
	if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
		o, err := q.GetStockOpname(ctx, store.GetStockOpnameParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if o.Status != statusDraft {
			return errConflict{"only a draft can be posted"}
		}
		lines, err := q.ListStockOpnameLines(ctx, store.ListStockOpnameLinesParams{TenantID: tc.tenantID, StockOpnameID: id})
		if err != nil {
			return err
		}
		year = o.DocDate.Time.Year()
		movements, err = s.opnameMovements(ctx, q, tc, o, lines, false)
		if err != nil {
			return err
		}
		noVariance = len(movements) == 0
		return nil
	}); err != nil {
		writeTransitionErr(w, err)
		return
	}

	// A count with no discrepancies still posts and numbers, but writes nothing.
	if noVariance {
		var out api.StockOpname
		if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
			number, err := store.NewNumberer(q).Next(ctx, tc.tenantID, docTypeStockOpname, year)
			if err != nil {
				return err
			}
			if _, err := q.MarkStockOpnamePosted(ctx, store.MarkStockOpnamePostedParams{TenantID: tc.tenantID, ID: id, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)}); err != nil {
				return err
			}
			out, err = s.loadStockOpname(ctx, q, tc.tenantID, id)
			return err
		}); err != nil {
			writeTransitionErr(w, err)
			return
		}
		writeJSON(w, http.StatusOK, out)
		return
	}

	s.postStockDocument(w, r, tc, id, docTypeStockOpname,
		func(ctx context.Context, q *store.Queries) (string, []stock.Movement, int, error) {
			// Re-guard status under the posting flow's own transaction.
			o, err := q.GetStockOpname(ctx, store.GetStockOpnameParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return "", nil, 0, err
			}
			if o.Status != statusDraft {
				return "", nil, 0, errConflict{"only a draft can be posted"}
			}
			return o.Status, movements, year, nil
		},
		func(ctx context.Context, q *store.Queries, number string) error {
			_, err := q.MarkStockOpnamePosted(ctx, store.MarkStockOpnamePostedParams{TenantID: tc.tenantID, ID: id, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
			return err
		},
		func(ctx context.Context, q *store.Queries) (any, error) {
			return s.loadStockOpname(ctx, q, tc.tenantID, id)
		},
		http.StatusOK,
	)
}

func (s *Server) ReverseStockOpname(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	ctx := r.Context()

	// Phase 1: build the reversal draft and its negated variance movements. If the
	// original had no variance (no movements posted), the reversal is number-only.
	var plan reversalPlan
	var noVariance bool
	var revID uuid.UUID
	var year int
	if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
		orig, err := q.GetStockOpname(ctx, store.GetStockOpnameParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if orig.Status != statusPosted {
			return errConflict{"only a posted document can be reversed"}
		}
		lines, err := q.ListStockOpnameLines(ctx, store.ListStockOpnameLinesParams{TenantID: tc.tenantID, StockOpnameID: id})
		if err != nil {
			return err
		}
		rev, err := q.CreateStockOpname(ctx, store.CreateStockOpnameParams{
			TenantID:    tc.tenantID,
			WarehouseID: orig.WarehouseID,
			DocDate:     orig.DocDate,
			Notes:       "reversal of " + orig.DocNumber.String,
			ReversesID:  pgUUID(id),
			Status:      statusDraft,
			CreatedBy:   tc.user.ID,
		})
		if err != nil {
			return err
		}
		for _, l := range lines {
			if _, err := q.InsertStockOpnameLine(ctx, store.InsertStockOpnameLineParams{
				TenantID: tc.tenantID, StockOpnameID: rev.ID, LineNo: l.LineNo,
				ProductID: l.ProductID, BatchID: l.BatchID, Uom: l.Uom, CountedQty: l.CountedQty,
			}); err != nil {
				return err
			}
		}
		revID = rev.ID
		year = rev.DocDate.Time.Year()
		// The reversal negates the variance that the original posted, recomputed
		// against the original counts and the current levels.
		movements, err := s.opnameMovements(ctx, q, tc, orig, lines, true)
		if err != nil {
			return err
		}
		noVariance = len(movements) == 0
		plan = reversalPlan{
			reversalID: rev.ID,
			movements:  movements,
			year:       year,
			markPosted: func(ctx context.Context, q *store.Queries, number string) error {
				_, err := q.MarkStockOpnamePosted(ctx, store.MarkStockOpnamePostedParams{TenantID: tc.tenantID, ID: rev.ID, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
				return err
			},
			markReversed: func(ctx context.Context, q *store.Queries) error {
				return q.MarkStockOpnameReversed(ctx, store.MarkStockOpnameReversedParams{TenantID: tc.tenantID, ID: id, ReversedByID: pgUUID(rev.ID)})
			},
			render: func(ctx context.Context, q *store.Queries) (any, error) {
				return s.loadStockOpname(ctx, q, tc.tenantID, rev.ID)
			},
		}
		return nil
	}); err != nil {
		writeTransitionErr(w, err)
		return
	}

	if noVariance {
		var out api.StockOpname
		if err := s.tenantTx(ctx, tc.tenantID, func(q *store.Queries) error {
			number, err := store.NewNumberer(q).Next(ctx, tc.tenantID, docTypeStockOpname, year)
			if err != nil {
				return err
			}
			if err := plan.markPosted(ctx, q, number); err != nil {
				return err
			}
			if err := plan.markReversed(ctx, q); err != nil {
				return err
			}
			out, err = s.loadStockOpname(ctx, q, tc.tenantID, revID)
			return err
		}); err != nil {
			writeTransitionErr(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, out)
		return
	}

	s.reverseStockDocument(w, r, tc, id, docTypeStockOpname,
		func(ctx context.Context, q *store.Queries) (reversalPlan, error) {
			return plan, nil
		},
	)
}

// opnameMovements computes the variance per line (counted minus current on-hand)
// and returns one adjustment movement per nonzero variance. Lines that match need
// no movement. When negate is true (a reversal) each variance flips sign, so the
// reversal restores the pre-opname on-hand.
func (s *Server) opnameMovements(ctx context.Context, q *store.Queries, tc tenantCtx, o store.StockOpname, lines []store.StockOpnameLine, negate bool) ([]stock.Movement, error) {
	movements := make([]stock.Movement, 0, len(lines))
	for _, l := range lines {
		counted, err := store.Decimal(l.CountedQty)
		if err != nil {
			return nil, err
		}
		onHand := decimal.Zero
		cost := decimal.Zero
		lvl, lvlErr := q.GetStockLevelForDoc(ctx, store.GetStockLevelForDocParams{
			TenantID: tc.tenantID, ProductID: l.ProductID, WarehouseID: o.WarehouseID, BatchID: l.BatchID,
		})
		if lvlErr == nil {
			onHand, _ = store.Decimal(lvl.QtyOnHand)
			cost, _ = store.Decimal(lvl.AvgCost)
		} else if !errors.Is(lvlErr, pgx.ErrNoRows) {
			return nil, lvlErr
		}
		// Snapshot on-hand at post time for the berita acara (INC-3). Only on the
		// original post (not negation/reversal) to avoid overwriting the snapshot.
		if !negate {
			sysQtyNum, err := store.Numeric(onHand)
			if err != nil {
				return nil, err
			}
			if err := q.SetStockOpnameLineSystemQty(ctx, store.SetStockOpnameLineSystemQtyParams{
				TenantID: tc.tenantID, ID: l.ID, SystemQty: sysQtyNum,
			}); err != nil {
				return nil, err
			}
		}
		variance := counted.Sub(onHand)
		if variance.IsZero() {
			continue
		}
		if negate {
			variance = variance.Neg()
		}
		movements = append(movements, stock.Movement{
			Key:         keyOf(l.ProductID, o.WarehouseID, l.BatchID),
			Qty:         variance,
			UnitCost:    cost,
			Type:        stock.Adjustment,
			DocLineID:   l.ID,
			EffectiveAt: effectiveAt(o.DocDate),
			CreatedBy:   tc.user.ID,
		})
	}
	return movements, nil
}
