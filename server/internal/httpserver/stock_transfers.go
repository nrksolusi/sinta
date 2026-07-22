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

// decimalZeroValue is the cost used when a source key has no cached level yet.
func decimalZeroValue() decimal.Decimal { return decimal.Zero }

// Stock transfer: posting produces a transfer_out + transfer_in movement pair
// across two warehouses. The out leg is valued at the from-warehouse average by
// the engine; the in leg carries that same cost so value is conserved. Reversal
// swaps the pair (out becomes in and vice versa).

func stockTransferToAPI(tr store.StockTransfer, lines []store.StockTransferLine, actors docActors) api.StockTransfer {
	apiLines := make([]api.StockTransferLine, 0, len(lines))
	for _, l := range lines {
		apiLines = append(apiLines, api.StockTransferLine{
			Id:        l.ID,
			LineNo:    int(l.LineNo),
			ProductId: l.ProductID,
			BatchId:   pgUUIDPtr(l.BatchID),
			Uom:       l.Uom,
			Qty:       numericToString(l.Qty),
		})
	}
	return api.StockTransfer{
		Id:              tr.ID,
		DocNumber:       textPtr(tr.DocNumber),
		Status:          api.DocumentStatus(tr.Status),
		FromWarehouseId: tr.FromWarehouseID,
		ToWarehouseId:   tr.ToWarehouseID,
		DocDate:         pgToDate(tr.DocDate),
		Notes:           tr.Notes,
		ReversesId:      pgUUIDPtr(tr.ReversesID),
		ReversedById:    pgUUIDPtr(tr.ReversedByID),
		CreatedAt:       pgTimestamp(tr.CreatedAt),
		CreatedBy:       actors.createdBy,
		PostedAt:        pgTimestampPtr(tr.PostedAt),
		PostedBy:        actors.postedBy,
		Lines:           apiLines,
	}
}

func (s *Server) loadStockTransfer(ctx context.Context, q *store.Queries, tenantID, id uuid.UUID) (api.StockTransfer, error) {
	tr, err := q.GetStockTransfer(ctx, store.GetStockTransferParams{TenantID: tenantID, ID: id})
	if err != nil {
		return api.StockTransfer{}, err
	}
	lines, err := q.ListStockTransferLines(ctx, store.ListStockTransferLinesParams{TenantID: tenantID, StockTransferID: id})
	if err != nil {
		return api.StockTransfer{}, err
	}
	actors, err := loadDocActors(ctx, q, tr.CreatedBy, tr.PostedBy)
	if err != nil {
		return api.StockTransfer{}, err
	}
	return stockTransferToAPI(tr, lines, actors), nil
}

func (s *Server) ListStockTransfers(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out []api.StockTransfer
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		rows, err := q.ListStockTransfers(r.Context(), tc.tenantID)
		if err != nil {
			return err
		}
		out = make([]api.StockTransfer, 0, len(rows))
		for _, tr := range rows {
			lines, err := q.ListStockTransferLines(r.Context(), store.ListStockTransferLinesParams{TenantID: tc.tenantID, StockTransferID: tr.ID})
			if err != nil {
				return err
			}
			actors, err := loadDocActors(r.Context(), q, tr.CreatedBy, tr.PostedBy)
			if err != nil {
				return err
			}
			out = append(out, stockTransferToAPI(tr, lines, actors))
		}
		return nil
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) CreateStockTransfer(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.StockTransferInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	if req.FromWarehouseId == req.ToWarehouseId {
		writeError(w, http.StatusUnprocessableEntity, "same_warehouse", "a transfer needs two different warehouses")
		return
	}
	var out api.StockTransfer
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		tr, err := q.CreateStockTransfer(r.Context(), store.CreateStockTransferParams{
			TenantID:        tc.tenantID,
			FromWarehouseID: req.FromWarehouseId,
			ToWarehouseID:   req.ToWarehouseId,
			DocDate:         dateToPg(req.DocDate),
			Notes:           derefNotes(req.Notes),
			Status:          statusDraft,
			CreatedBy:       tc.user.ID,
		})
		if err != nil {
			return err
		}
		if err := s.insertStockTransferLines(r.Context(), q, tc.tenantID, tr.ID, req.Lines); err != nil {
			return err
		}
		out, err = s.loadStockTransfer(r.Context(), q, tc.tenantID, tr.ID)
		return err
	})
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) insertStockTransferLines(ctx context.Context, q *store.Queries, tenantID, trID uuid.UUID, lines []api.StockTransferLineInput) error {
	for i, l := range lines {
		qty, err := parseDecimal(l.Qty)
		if err != nil || !qty.IsPositive() {
			return errValidation{"line qty must be a positive decimal"}
		}
		qtyNum, _ := store.Numeric(qty)
		batch, _ := optBatch(l.BatchId)
		if _, err := q.InsertStockTransferLine(ctx, store.InsertStockTransferLineParams{
			TenantID:        tenantID,
			StockTransferID: trID,
			LineNo:          int32(i + 1),
			ProductID:       l.ProductId,
			BatchID:         batch,
			Uom:             l.Uom,
			Qty:             qtyNum,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) GetStockTransfer(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out api.StockTransfer
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		out, err = s.loadStockTransfer(r.Context(), q, tc.tenantID, id)
		return err
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) UpdateStockTransfer(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.StockTransferInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	if req.FromWarehouseId == req.ToWarehouseId {
		writeError(w, http.StatusUnprocessableEntity, "same_warehouse", "a transfer needs two different warehouses")
		return
	}
	var out api.StockTransfer
	var immutable bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetStockTransfer(r.Context(), store.GetStockTransferParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			immutable = true
			return nil
		}
		if _, err := q.UpdateStockTransferHeader(r.Context(), store.UpdateStockTransferHeaderParams{
			TenantID:        tc.tenantID,
			ID:              id,
			FromWarehouseID: req.FromWarehouseId,
			ToWarehouseID:   req.ToWarehouseId,
			DocDate:         dateToPg(req.DocDate),
			Notes:           derefNotes(req.Notes),
		}); err != nil {
			return err
		}
		if err := q.DeleteStockTransferLines(r.Context(), store.DeleteStockTransferLinesParams{TenantID: tc.tenantID, StockTransferID: id}); err != nil {
			return err
		}
		if err := s.insertStockTransferLines(r.Context(), q, tc.tenantID, id, req.Lines); err != nil {
			return err
		}
		out, err = s.loadStockTransfer(r.Context(), q, tc.tenantID, id)
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

func (s *Server) DeleteStockTransfer(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var notDraft bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetStockTransfer(r.Context(), store.GetStockTransferParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			notDraft = true
			return nil
		}
		return q.DeleteStockTransfer(r.Context(), store.DeleteStockTransferParams{TenantID: tc.tenantID, ID: id})
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

func (s *Server) PostStockTransfer(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	s.postStockDocument(w, r, tc, id, docTypeStockTransfer,
		func(ctx context.Context, q *store.Queries) (string, []stock.Movement, int, error) {
			tr, err := q.GetStockTransfer(ctx, store.GetStockTransferParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return "", nil, 0, err
			}
			if tr.Status != statusDraft {
				return "", nil, 0, errConflict{"only a draft can be posted"}
			}
			lines, err := q.ListStockTransferLines(ctx, store.ListStockTransferLinesParams{TenantID: tc.tenantID, StockTransferID: id})
			if err != nil {
				return "", nil, 0, err
			}
			movements, err := s.transferMovements(ctx, q, tc, tr, lines, false)
			if err != nil {
				return "", nil, 0, err
			}
			return tr.Status, movements, tr.DocDate.Time.Year(), nil
		},
		func(ctx context.Context, q *store.Queries, number string) error {
			_, err := q.MarkStockTransferPosted(ctx, store.MarkStockTransferPostedParams{TenantID: tc.tenantID, ID: id, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
			return err
		},
		func(ctx context.Context, q *store.Queries) (any, error) {
			return s.loadStockTransfer(ctx, q, tc.tenantID, id)
		},
		http.StatusOK,
	)
}

func (s *Server) ReverseStockTransfer(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	s.reverseStockDocument(w, r, tc, id, docTypeStockTransfer,
		func(ctx context.Context, q *store.Queries) (reversalPlan, error) {
			orig, err := q.GetStockTransfer(ctx, store.GetStockTransferParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			if orig.Status != statusPosted {
				return reversalPlan{}, errConflict{"only a posted document can be reversed"}
			}
			lines, err := q.ListStockTransferLines(ctx, store.ListStockTransferLinesParams{TenantID: tc.tenantID, StockTransferID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			rev, err := q.CreateStockTransfer(ctx, store.CreateStockTransferParams{
				TenantID:        tc.tenantID,
				FromWarehouseID: orig.FromWarehouseID,
				ToWarehouseID:   orig.ToWarehouseID,
				DocDate:         orig.DocDate,
				Notes:           "reversal of " + orig.DocNumber.String,
				ReversesID:      pgUUID(id),
				Status:          statusDraft,
				CreatedBy:       tc.user.ID,
			})
			if err != nil {
				return reversalPlan{}, err
			}
			for _, l := range lines {
				if _, err := q.InsertStockTransferLine(ctx, store.InsertStockTransferLineParams{
					TenantID: tc.tenantID, StockTransferID: rev.ID, LineNo: l.LineNo,
					ProductID: l.ProductID, BatchID: l.BatchID, Uom: l.Uom, Qty: l.Qty,
				}); err != nil {
					return reversalPlan{}, err
				}
			}
			// Reversal swaps the pair: stock flows back from the to-warehouse.
			movements, err := s.transferMovements(ctx, q, tc, rev, lines, true)
			if err != nil {
				return reversalPlan{}, err
			}
			return reversalPlan{
				reversalID: rev.ID,
				movements:  movements,
				year:       rev.DocDate.Time.Year(),
				markPosted: func(ctx context.Context, q *store.Queries, number string) error {
					_, err := q.MarkStockTransferPosted(ctx, store.MarkStockTransferPostedParams{TenantID: tc.tenantID, ID: rev.ID, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
					return err
				},
				markReversed: func(ctx context.Context, q *store.Queries) error {
					return q.MarkStockTransferReversed(ctx, store.MarkStockTransferReversedParams{TenantID: tc.tenantID, ID: id, ReversedByID: pgUUID(rev.ID)})
				},
				render: func(ctx context.Context, q *store.Queries) (any, error) {
					return s.loadStockTransfer(ctx, q, tc.tenantID, rev.ID)
				},
			}, nil
		},
	)
}

// transferMovements builds a transfer_out (from warehouse, qty negative) and a
// transfer_in (to warehouse, qty positive) per line. The in leg carries the
// from-warehouse average cost read from the level cache so value is conserved
// across the move (the out leg's cost is assigned by the engine). When negate is
// true (a reversal) the from/to warehouses swap so stock flows back.
func (s *Server) transferMovements(ctx context.Context, q *store.Queries, tc tenantCtx, tr store.StockTransfer, lines []store.StockTransferLine, negate bool) ([]stock.Movement, error) {
	from, to := tr.FromWarehouseID, tr.ToWarehouseID
	if negate {
		from, to = to, from
	}
	movements := make([]stock.Movement, 0, len(lines)*2)
	for _, l := range lines {
		qty, err := store.Decimal(l.Qty)
		if err != nil {
			return nil, err
		}
		// Read the source warehouse average so the in leg conserves value. A key
		// with no level yet (no prior receipt) means cost zero.
		cost := decimalZeroValue()
		lvl, lvlErr := q.GetStockLevelForDoc(ctx, store.GetStockLevelForDocParams{
			TenantID: tc.tenantID, ProductID: l.ProductID, WarehouseID: from, BatchID: l.BatchID,
		})
		if lvlErr == nil {
			cost, _ = store.Decimal(lvl.AvgCost)
		} else if !errors.Is(lvlErr, pgx.ErrNoRows) {
			return nil, lvlErr
		}
		movements = append(movements,
			stock.Movement{
				Key:         keyOf(l.ProductID, from, l.BatchID),
				Qty:         qty.Neg(),
				UnitCost:    cost,
				Type:        stock.TransferOut,
				DocLineID:   l.ID,
				EffectiveAt: effectiveAt(tr.DocDate),
				CreatedBy:   tc.user.ID,
			},
			stock.Movement{
				Key:         keyOf(l.ProductID, to, l.BatchID),
				Qty:         qty,
				UnitCost:    cost,
				Type:        stock.TransferIn,
				DocLineID:   l.ID,
				EffectiveAt: effectiveAt(tr.DocDate),
				CreatedBy:   tc.user.ID,
			},
		)
	}
	return movements, nil
}
