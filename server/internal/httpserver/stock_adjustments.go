package httpserver

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// Stock adjustment: posting produces signed adjustment movements (positive is
// found stock, negative is waste/damage). The engine values a positive
// adjustment at the line's unit cost (re-averaging) and a negative one at the
// running average. Reversal posts the negated movements.

func stockAdjustmentToAPI(a store.StockAdjustment, lines []store.StockAdjustmentLine, actors docActors) api.StockAdjustment {
	apiLines := make([]api.StockAdjustmentLine, 0, len(lines))
	for _, l := range lines {
		apiLines = append(apiLines, api.StockAdjustmentLine{
			Id:        l.ID,
			LineNo:    int(l.LineNo),
			ProductId: l.ProductID,
			BatchId:   pgUUIDPtr(l.BatchID),
			Uom:       l.Uom,
			Qty:       numericToString(l.Qty),
			UnitCost:  numericToString(l.UnitCost),
		})
	}
	return api.StockAdjustment{
		Id:           a.ID,
		DocNumber:    textPtr(a.DocNumber),
		Status:       api.DocumentStatus(a.Status),
		WarehouseId:  a.WarehouseID,
		Reason:       a.Reason,
		DocDate:      pgToDate(a.DocDate),
		Notes:        a.Notes,
		ReversesId:   pgUUIDPtr(a.ReversesID),
		ReversedById: pgUUIDPtr(a.ReversedByID),
		CreatedAt:    pgTimestamp(a.CreatedAt),
		CreatedBy:    actors.createdBy,
		PostedAt:     pgTimestampPtr(a.PostedAt),
		PostedBy:     actors.postedBy,
		Lines:        apiLines,
	}
}

func (s *Server) loadStockAdjustment(ctx context.Context, q *store.Queries, tenantID, id uuid.UUID) (api.StockAdjustment, error) {
	a, err := q.GetStockAdjustment(ctx, store.GetStockAdjustmentParams{TenantID: tenantID, ID: id})
	if err != nil {
		return api.StockAdjustment{}, err
	}
	lines, err := q.ListStockAdjustmentLines(ctx, store.ListStockAdjustmentLinesParams{TenantID: tenantID, StockAdjustmentID: id})
	if err != nil {
		return api.StockAdjustment{}, err
	}
	actors, err := loadDocActors(ctx, q, a.CreatedBy, a.PostedBy)
	if err != nil {
		return api.StockAdjustment{}, err
	}
	return stockAdjustmentToAPI(a, lines, actors), nil
}

func (s *Server) ListStockAdjustments(w http.ResponseWriter, r *http.Request, _ api.ListStockAdjustmentsParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var items []api.StockAdjustment
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		rows, err := q.ListStockAdjustments(r.Context(), tc.tenantID)
		if err != nil {
			return err
		}
		items = make([]api.StockAdjustment, 0, len(rows))
		for _, a := range rows {
			lines, err := q.ListStockAdjustmentLines(r.Context(), store.ListStockAdjustmentLinesParams{TenantID: tc.tenantID, StockAdjustmentID: a.ID})
			if err != nil {
				return err
			}
			actors, err := loadDocActors(r.Context(), q, a.CreatedBy, a.PostedBy)
			if err != nil {
				return err
			}
			items = append(items, stockAdjustmentToAPI(a, lines, actors))
		}
		return nil
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, api.StockAdjustmentList{Items: items})
}

func (s *Server) CreateStockAdjustment(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.StockAdjustmentInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.StockAdjustment
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		a, err := q.CreateStockAdjustment(r.Context(), store.CreateStockAdjustmentParams{
			TenantID:    tc.tenantID,
			WarehouseID: req.WarehouseId,
			Reason:      derefNotes(req.Reason),
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
			Status:      statusDraft,
			CreatedBy:   tc.user.ID,
		})
		if err != nil {
			return err
		}
		if err := s.insertStockAdjustmentLines(r.Context(), q, tc.tenantID, a.ID, req.Lines); err != nil {
			return err
		}
		out, err = s.loadStockAdjustment(r.Context(), q, tc.tenantID, a.ID)
		return err
	})
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) insertStockAdjustmentLines(ctx context.Context, q *store.Queries, tenantID, aID uuid.UUID, lines []api.StockAdjustmentLineInput) error {
	for i, l := range lines {
		qty, err := parseDecimal(l.Qty)
		if err != nil || qty.IsZero() {
			return errValidation{"adjustment line qty must be a nonzero decimal"}
		}
		qtyNum, _ := store.Numeric(qty)
		costNum, _ := store.Numeric(decimalOrZero(l.UnitCost))
		batch, _ := optBatch(l.BatchId)
		if _, err := q.InsertStockAdjustmentLine(ctx, store.InsertStockAdjustmentLineParams{
			TenantID:          tenantID,
			StockAdjustmentID: aID,
			LineNo:            int32(i + 1),
			ProductID:         l.ProductId,
			BatchID:           batch,
			Uom:               l.Uom,
			Qty:               qtyNum,
			UnitCost:          costNum,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) GetStockAdjustment(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out api.StockAdjustment
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		out, err = s.loadStockAdjustment(r.Context(), q, tc.tenantID, id)
		return err
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) UpdateStockAdjustment(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.StockAdjustmentInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.StockAdjustment
	var immutable bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetStockAdjustment(r.Context(), store.GetStockAdjustmentParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			immutable = true
			return nil
		}
		if _, err := q.UpdateStockAdjustmentHeader(r.Context(), store.UpdateStockAdjustmentHeaderParams{
			TenantID:    tc.tenantID,
			ID:          id,
			WarehouseID: req.WarehouseId,
			Reason:      derefNotes(req.Reason),
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
		}); err != nil {
			return err
		}
		if err := q.DeleteStockAdjustmentLines(r.Context(), store.DeleteStockAdjustmentLinesParams{TenantID: tc.tenantID, StockAdjustmentID: id}); err != nil {
			return err
		}
		if err := s.insertStockAdjustmentLines(r.Context(), q, tc.tenantID, id, req.Lines); err != nil {
			return err
		}
		out, err = s.loadStockAdjustment(r.Context(), q, tc.tenantID, id)
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

func (s *Server) DeleteStockAdjustment(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var notDraft bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetStockAdjustment(r.Context(), store.GetStockAdjustmentParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			notDraft = true
			return nil
		}
		return q.DeleteStockAdjustment(r.Context(), store.DeleteStockAdjustmentParams{TenantID: tc.tenantID, ID: id})
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

func (s *Server) PostStockAdjustment(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	s.postStockDocument(w, r, tc, id, docTypeStockAdjustment,
		func(ctx context.Context, q *store.Queries) (string, []stock.Movement, int, error) {
			a, err := q.GetStockAdjustment(ctx, store.GetStockAdjustmentParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return "", nil, 0, err
			}
			if a.Status != statusDraft {
				return "", nil, 0, errConflict{"only a draft can be posted"}
			}
			lines, err := q.ListStockAdjustmentLines(ctx, store.ListStockAdjustmentLinesParams{TenantID: tc.tenantID, StockAdjustmentID: id})
			if err != nil {
				return "", nil, 0, err
			}
			movements, err := adjustmentMovements(tc, a, lines, false)
			if err != nil {
				return "", nil, 0, err
			}
			return a.Status, movements, a.DocDate.Time.Year(), nil
		},
		func(ctx context.Context, q *store.Queries, number string) error {
			_, err := q.MarkStockAdjustmentPosted(ctx, store.MarkStockAdjustmentPostedParams{TenantID: tc.tenantID, ID: id, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
			return err
		},
		func(ctx context.Context, q *store.Queries) (any, error) {
			return s.loadStockAdjustment(ctx, q, tc.tenantID, id)
		},
		http.StatusOK,
	)
}

func (s *Server) ReverseStockAdjustment(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	s.reverseStockDocument(w, r, tc, id, docTypeStockAdjustment,
		func(ctx context.Context, q *store.Queries) (reversalPlan, error) {
			orig, err := q.GetStockAdjustment(ctx, store.GetStockAdjustmentParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			if orig.Status != statusPosted {
				return reversalPlan{}, errConflict{"only a posted document can be reversed"}
			}
			lines, err := q.ListStockAdjustmentLines(ctx, store.ListStockAdjustmentLinesParams{TenantID: tc.tenantID, StockAdjustmentID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			rev, err := q.CreateStockAdjustment(ctx, store.CreateStockAdjustmentParams{
				TenantID:    tc.tenantID,
				WarehouseID: orig.WarehouseID,
				Reason:      "reversal of " + orig.DocNumber.String,
				DocDate:     orig.DocDate,
				Notes:       orig.Notes,
				ReversesID:  pgUUID(id),
				Status:      statusDraft,
				CreatedBy:   tc.user.ID,
			})
			if err != nil {
				return reversalPlan{}, err
			}
			for _, l := range lines {
				if _, err := q.InsertStockAdjustmentLine(ctx, store.InsertStockAdjustmentLineParams{
					TenantID: tc.tenantID, StockAdjustmentID: rev.ID, LineNo: l.LineNo,
					ProductID: l.ProductID, BatchID: l.BatchID, Uom: l.Uom, Qty: l.Qty, UnitCost: l.UnitCost,
				}); err != nil {
					return reversalPlan{}, err
				}
			}
			movements, err := adjustmentMovements(tc, rev, lines, true)
			if err != nil {
				return reversalPlan{}, err
			}
			return reversalPlan{
				reversalID: rev.ID,
				movements:  movements,
				year:       rev.DocDate.Time.Year(),
				markPosted: func(ctx context.Context, q *store.Queries, number string) error {
					_, err := q.MarkStockAdjustmentPosted(ctx, store.MarkStockAdjustmentPostedParams{TenantID: tc.tenantID, ID: rev.ID, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
					return err
				},
				markReversed: func(ctx context.Context, q *store.Queries) error {
					return q.MarkStockAdjustmentReversed(ctx, store.MarkStockAdjustmentReversedParams{TenantID: tc.tenantID, ID: id, ReversedByID: pgUUID(rev.ID)})
				},
				render: func(ctx context.Context, q *store.Queries) (any, error) {
					return s.loadStockAdjustment(ctx, q, tc.tenantID, rev.ID)
				},
			}, nil
		},
	)
}

// adjustmentMovements builds one signed adjustment movement per line. When negate
// is true (a reversal) each qty flips so the reversal undoes the original.
func adjustmentMovements(tc tenantCtx, a store.StockAdjustment, lines []store.StockAdjustmentLine, negate bool) ([]stock.Movement, error) {
	movements := make([]stock.Movement, 0, len(lines))
	for _, l := range lines {
		qty, err := store.Decimal(l.Qty)
		if err != nil {
			return nil, err
		}
		cost, err := store.Decimal(l.UnitCost)
		if err != nil {
			return nil, err
		}
		if negate {
			qty = qty.Neg()
		}
		movements = append(movements, stock.Movement{
			Key:         keyOf(l.ProductID, a.WarehouseID, l.BatchID),
			Qty:         qty,
			UnitCost:    cost,
			Type:        stock.Adjustment,
			DocLineID:   l.ID,
			EffectiveAt: effectiveAt(a.DocDate),
			CreatedBy:   tc.user.ID,
		})
	}
	return movements, nil
}
