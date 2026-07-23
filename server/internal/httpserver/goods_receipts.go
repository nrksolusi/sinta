package httpserver

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// Goods receipt: posting produces receipt movements (stock in, cost enters the
// journal), linking PO lines when present. Reversal posts the opposite issue
// movements, so the original receipt is undone without editing the journal.

func goodsReceiptToAPI(gr store.GoodsReceipt, lines []store.GoodsReceiptLine, actors docActors) api.GoodsReceipt {
	apiLines := make([]api.GoodsReceiptLine, 0, len(lines))
	for _, l := range lines {
		apiLines = append(apiLines, api.GoodsReceiptLine{
			Id:                  l.ID,
			LineNo:              int(l.LineNo),
			PurchaseOrderLineId: pgUUIDPtr(l.PurchaseOrderLineID),
			ProductId:           l.ProductID,
			BatchId:             pgUUIDPtr(l.BatchID),
			Uom:                 l.Uom,
			Qty:                 numericToString(l.Qty),
			UnitCost:            numericToString(l.UnitCost),
		})
	}
	return api.GoodsReceipt{
		Id:              gr.ID,
		DocNumber:       textPtr(gr.DocNumber),
		Status:          api.DocumentStatus(gr.Status),
		PurchaseOrderId: pgUUIDPtr(gr.PurchaseOrderID),
		SupplierId:      gr.SupplierID,
		WarehouseId:     gr.WarehouseID,
		DocDate:         pgToDate(gr.DocDate),
		Notes:           gr.Notes,
		ReversesId:      pgUUIDPtr(gr.ReversesID),
		ReversedById:    pgUUIDPtr(gr.ReversedByID),
		CreatedAt:       pgTimestamp(gr.CreatedAt),
		CreatedBy:       actors.createdBy,
		PostedAt:        pgTimestampPtr(gr.PostedAt),
		PostedBy:        actors.postedBy,
		Lines:           apiLines,
	}
}

func (s *Server) loadGoodsReceipt(ctx context.Context, q *store.Queries, tenantID, id uuid.UUID) (api.GoodsReceipt, error) {
	gr, err := q.GetGoodsReceipt(ctx, store.GetGoodsReceiptParams{TenantID: tenantID, ID: id})
	if err != nil {
		return api.GoodsReceipt{}, err
	}
	lines, err := q.ListGoodsReceiptLines(ctx, store.ListGoodsReceiptLinesParams{TenantID: tenantID, GoodsReceiptID: id})
	if err != nil {
		return api.GoodsReceipt{}, err
	}
	actors, err := loadDocActors(ctx, q, gr.CreatedBy, gr.PostedBy)
	if err != nil {
		return api.GoodsReceipt{}, err
	}
	return goodsReceiptToAPI(gr, lines, actors), nil
}

func (s *Server) ListGoodsReceipts(w http.ResponseWriter, r *http.Request, params api.ListGoodsReceiptsParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	f, err := resolveDocListFilter(params.Status, params.WarehouseId, params.DateFrom, params.DateTo, params.Q, params.Cursor, params.Limit)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_cursor", "cursor is invalid")
		return
	}
	var items []api.GoodsReceipt
	var nextCursor *string
	err = s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		rows, err := q.ListGoodsReceipts(r.Context(), store.ListGoodsReceiptsParams{
			TenantID:          tc.tenantID,
			FilterStatus:      f.FilterStatus,
			FilterWarehouseID: f.FilterWarehouseID,
			FilterDateFrom:    f.FilterDateFrom,
			FilterDateTo:      f.FilterDateTo,
			FilterQ:           f.FilterQ,
			CursorTs:          f.CursorTs,
			CursorID:          f.CursorID,
			PageLimit:         f.PageLimit + 1,
		})
		if err != nil {
			return err
		}
		rows, nextCursor = nextCursorIfMore(rows, f.PageLimit,
			func(gr store.GoodsReceipt) pgtype.Timestamptz { return gr.CreatedAt },
			func(gr store.GoodsReceipt) uuid.UUID { return gr.ID })
		items = make([]api.GoodsReceipt, 0, len(rows))
		for _, gr := range rows {
			lines, err := q.ListGoodsReceiptLines(r.Context(), store.ListGoodsReceiptLinesParams{TenantID: tc.tenantID, GoodsReceiptID: gr.ID})
			if err != nil {
				return err
			}
			actors, err := loadDocActors(r.Context(), q, gr.CreatedBy, gr.PostedBy)
			if err != nil {
				return err
			}
			items = append(items, goodsReceiptToAPI(gr, lines, actors))
		}
		return nil
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, api.GoodsReceiptList{Items: items, NextCursor: nextCursor})
}

func (s *Server) CreateGoodsReceipt(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.GoodsReceiptInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.GoodsReceipt
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		gr, err := q.CreateGoodsReceipt(r.Context(), store.CreateGoodsReceiptParams{
			TenantID:        tc.tenantID,
			PurchaseOrderID: optUUID(req.PurchaseOrderId),
			SupplierID:      req.SupplierId,
			WarehouseID:     req.WarehouseId,
			DocDate:         dateToPg(req.DocDate),
			Notes:           derefNotes(req.Notes),
			Status:          statusDraft,
			CreatedBy:       tc.user.ID,
		})
		if err != nil {
			return err
		}
		if err := s.insertGoodsReceiptLines(r.Context(), q, tc.tenantID, gr.ID, req.Lines); err != nil {
			return err
		}
		out, err = s.loadGoodsReceipt(r.Context(), q, tc.tenantID, gr.ID)
		return err
	})
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) insertGoodsReceiptLines(ctx context.Context, q *store.Queries, tenantID, grID uuid.UUID, lines []api.GoodsReceiptLineInput) error {
	for i, l := range lines {
		qty, err := parseDecimal(l.Qty)
		if err != nil || !qty.IsPositive() {
			return errValidation{"line qty must be a positive decimal"}
		}
		qtyNum, _ := store.Numeric(qty)
		costNum, _ := store.Numeric(decimalOrZero(l.UnitCost))
		batch, _ := optBatch(l.BatchId)
		if _, err := q.InsertGoodsReceiptLine(ctx, store.InsertGoodsReceiptLineParams{
			TenantID:            tenantID,
			GoodsReceiptID:      grID,
			LineNo:              int32(i + 1),
			PurchaseOrderLineID: optUUID(l.PurchaseOrderLineId),
			ProductID:           l.ProductId,
			BatchID:             batch,
			Uom:                 l.Uom,
			Qty:                 qtyNum,
			UnitCost:            costNum,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) GetGoodsReceipt(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out api.GoodsReceipt
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		out, err = s.loadGoodsReceipt(r.Context(), q, tc.tenantID, id)
		return err
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) UpdateGoodsReceipt(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.GoodsReceiptInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.GoodsReceipt
	var immutable bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetGoodsReceipt(r.Context(), store.GetGoodsReceiptParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			immutable = true
			return nil
		}
		if _, err := q.UpdateGoodsReceiptHeader(r.Context(), store.UpdateGoodsReceiptHeaderParams{
			TenantID:        tc.tenantID,
			ID:              id,
			PurchaseOrderID: optUUID(req.PurchaseOrderId),
			SupplierID:      req.SupplierId,
			WarehouseID:     req.WarehouseId,
			DocDate:         dateToPg(req.DocDate),
			Notes:           derefNotes(req.Notes),
		}); err != nil {
			return err
		}
		if err := q.DeleteGoodsReceiptLines(r.Context(), store.DeleteGoodsReceiptLinesParams{TenantID: tc.tenantID, GoodsReceiptID: id}); err != nil {
			return err
		}
		if err := s.insertGoodsReceiptLines(r.Context(), q, tc.tenantID, id, req.Lines); err != nil {
			return err
		}
		out, err = s.loadGoodsReceipt(r.Context(), q, tc.tenantID, id)
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

func (s *Server) DeleteGoodsReceipt(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var notDraft bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetGoodsReceipt(r.Context(), store.GetGoodsReceiptParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			notDraft = true
			return nil
		}
		return q.DeleteGoodsReceipt(r.Context(), store.DeleteGoodsReceiptParams{TenantID: tc.tenantID, ID: id})
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

func (s *Server) PostGoodsReceipt(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	// Build receipt movements from the draft, post them through the Poster (which
	// assigns the number and moves stock), then flip the header to posted.
	s.postStockDocument(w, r, tc, id, docTypeGoodsReceipt,
		func(ctx context.Context, q *store.Queries) (string, []stock.Movement, int, error) {
			gr, err := q.GetGoodsReceipt(ctx, store.GetGoodsReceiptParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return "", nil, 0, err
			}
			if gr.Status != statusDraft {
				return "", nil, 0, errConflict{"only a draft can be posted"}
			}
			lines, err := q.ListGoodsReceiptLines(ctx, store.ListGoodsReceiptLinesParams{TenantID: tc.tenantID, GoodsReceiptID: id})
			if err != nil {
				return "", nil, 0, err
			}
			if err := s.checkOverReceipt(ctx, q, tc.tenantID, id, lines); err != nil {
				return "", nil, 0, err
			}
			movements, err := receiptMovements(tc, gr, lines, false)
			if err != nil {
				return "", nil, 0, err
			}
			return gr.Status, movements, gr.DocDate.Time.Year(), nil
		},
		func(ctx context.Context, q *store.Queries, number string) error {
			_, err := q.MarkGoodsReceiptPosted(ctx, store.MarkGoodsReceiptPostedParams{TenantID: tc.tenantID, ID: id, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
			return err
		},
		func(ctx context.Context, q *store.Queries) (any, error) {
			return s.loadGoodsReceipt(ctx, q, tc.tenantID, id)
		},
		http.StatusOK,
	)
}

func (s *Server) ReverseGoodsReceipt(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	s.reverseStockDocument(w, r, tc, id, docTypeGoodsReceipt,
		func(ctx context.Context, q *store.Queries) (reversalPlan, error) {
			orig, err := q.GetGoodsReceipt(ctx, store.GetGoodsReceiptParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			if orig.Status != statusPosted {
				return reversalPlan{}, errConflict{"only a posted document can be reversed"}
			}
			lines, err := q.ListGoodsReceiptLines(ctx, store.ListGoodsReceiptLinesParams{TenantID: tc.tenantID, GoodsReceiptID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			// A reversal issues the received quantity back out (opposite movements).
			rev, err := q.CreateGoodsReceipt(ctx, store.CreateGoodsReceiptParams{
				TenantID:        tc.tenantID,
				PurchaseOrderID: orig.PurchaseOrderID,
				SupplierID:      orig.SupplierID,
				WarehouseID:     orig.WarehouseID,
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
				if _, err := q.InsertGoodsReceiptLine(ctx, store.InsertGoodsReceiptLineParams{
					TenantID: tc.tenantID, GoodsReceiptID: rev.ID, LineNo: l.LineNo,
					PurchaseOrderLineID: l.PurchaseOrderLineID, ProductID: l.ProductID, BatchID: l.BatchID,
					Uom: l.Uom, Qty: l.Qty, UnitCost: l.UnitCost,
				}); err != nil {
					return reversalPlan{}, err
				}
			}
			movements, err := receiptMovements(tc, rev, lines, true)
			if err != nil {
				return reversalPlan{}, err
			}
			return reversalPlan{
				reversalID: rev.ID,
				movements:  movements,
				year:       rev.DocDate.Time.Year(),
				markPosted: func(ctx context.Context, q *store.Queries, number string) error {
					_, err := q.MarkGoodsReceiptPosted(ctx, store.MarkGoodsReceiptPostedParams{TenantID: tc.tenantID, ID: rev.ID, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
					return err
				},
				markReversed: func(ctx context.Context, q *store.Queries) error {
					return q.MarkGoodsReceiptReversed(ctx, store.MarkGoodsReceiptReversedParams{TenantID: tc.tenantID, ID: id, ReversedByID: pgUUID(rev.ID)})
				},
				render: func(ctx context.Context, q *store.Queries) (any, error) {
					return s.loadGoodsReceipt(ctx, q, tc.tenantID, rev.ID)
				},
			}, nil
		},
	)
}

// checkOverReceipt enforces ADR-0016: per linked PO line, the sum of already-
// received qty plus the new GR qty must not exceed ordered qty * (1 + tolerance).
// Lines without a PO link are unconstrained. Locks each PO line advisory-ly to
// prevent two concurrent receipts from both passing the check.
func (s *Server) checkOverReceipt(ctx context.Context, q *store.Queries, tenantID, grID uuid.UUID, lines []store.GoodsReceiptLine) error {
	toleranceRaw, err := q.GetTenantToleranceOverReceipt(ctx, tenantID)
	if err != nil {
		return err
	}
	tolerance, err := numericFromAny(toleranceRaw)
	if err != nil {
		return err
	}

	for _, l := range lines {
		if !l.PurchaseOrderLineID.Valid {
			continue
		}
		poLineID := uuid.UUID(l.PurchaseOrderLineID.Bytes)

		if err := q.LockPOLineForReceipt(ctx, poLineID.String()); err != nil {
			return err
		}

		pol, err := q.GetPurchaseOrderLineByID(ctx, store.GetPurchaseOrderLineByIDParams{TenantID: tenantID, ID: poLineID})
		if err != nil {
			return err
		}
		ordered, err := store.Decimal(pol.Qty)
		if err != nil {
			return err
		}

		alreadyRaw, err := q.SumReceivedForPOLine(ctx, store.SumReceivedForPOLineParams{
			TenantID:              tenantID,
			PurchaseOrderLineID:   pgtype.UUID{Bytes: poLineID, Valid: true},
			ExcludeGoodsReceiptID: grID,
		})
		if err != nil {
			return err
		}
		already, err := numericFromAny(alreadyRaw)
		if err != nil {
			return err
		}

		newQty, err := store.Decimal(l.Qty)
		if err != nil {
			return err
		}

		// Allowed ceiling: ordered * (1 + tolerance)
		ceiling := ordered.Mul(decimal.NewFromInt(1).Add(tolerance))
		if already.Add(newQty).GreaterThan(ceiling) {
			return errOverReceipt{msg: "receipt qty would exceed ordered qty beyond tolerance"}
		}
	}
	return nil
}

// receiptMovements builds one receipt movement per line (stock in at the line's
// unit cost). When negate is true (a reversal) the sign flips to an issue back
// out, so the reversal undoes exactly what the original posted.
func receiptMovements(tc tenantCtx, gr store.GoodsReceipt, lines []store.GoodsReceiptLine, negate bool) ([]stock.Movement, error) {
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
		mtype := stock.Receipt
		if negate {
			qty = qty.Neg()
			mtype = stock.Issue
		}
		movements = append(movements, stock.Movement{
			Key:         keyOf(l.ProductID, gr.WarehouseID, l.BatchID),
			Qty:         qty,
			UnitCost:    cost,
			Type:        mtype,
			DocLineID:   l.ID,
			EffectiveAt: effectiveAt(gr.DocDate),
			CreatedBy:   tc.user.ID,
		})
	}
	return movements, nil
}
