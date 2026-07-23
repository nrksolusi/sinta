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

// Delivery: posting produces issue movements (stock out) against SO lines. The
// engine values the issue at current average (or last known cost below zero,
// D6); the handler leaves UnitCost zero so the engine assigns it. FEFO batch
// suggestion is M2; a manual batch selection per line is accepted here. Reversal
// posts receipt movements to put the issued stock back.

func deliveryToAPI(d store.Delivery, lines []store.DeliveryLine, actors docActors) api.Delivery {
	apiLines := make([]api.DeliveryLine, 0, len(lines))
	for _, l := range lines {
		apiLines = append(apiLines, api.DeliveryLine{
			Id:               l.ID,
			LineNo:           int(l.LineNo),
			SalesOrderLineId: pgUUIDPtr(l.SalesOrderLineID),
			ProductId:        l.ProductID,
			BatchId:          pgUUIDPtr(l.BatchID),
			Uom:              l.Uom,
			Qty:              numericToString(l.Qty),
		})
	}
	return api.Delivery{
		Id:           d.ID,
		DocNumber:    textPtr(d.DocNumber),
		Status:       api.DocumentStatus(d.Status),
		SalesOrderId: pgUUIDPtr(d.SalesOrderID),
		CustomerId:   d.CustomerID,
		WarehouseId:  d.WarehouseID,
		DocDate:      pgToDate(d.DocDate),
		Notes:        d.Notes,
		ReversesId:   pgUUIDPtr(d.ReversesID),
		ReversedById: pgUUIDPtr(d.ReversedByID),
		CreatedAt:    pgTimestamp(d.CreatedAt),
		CreatedBy:    actors.createdBy,
		PostedAt:     pgTimestampPtr(d.PostedAt),
		PostedBy:     actors.postedBy,
		Lines:        apiLines,
	}
}

func (s *Server) loadDelivery(ctx context.Context, q *store.Queries, tenantID, id uuid.UUID) (api.Delivery, error) {
	d, err := q.GetDelivery(ctx, store.GetDeliveryParams{TenantID: tenantID, ID: id})
	if err != nil {
		return api.Delivery{}, err
	}
	lines, err := q.ListDeliveryLines(ctx, store.ListDeliveryLinesParams{TenantID: tenantID, DeliveryID: id})
	if err != nil {
		return api.Delivery{}, err
	}
	actors, err := loadDocActors(ctx, q, d.CreatedBy, d.PostedBy)
	if err != nil {
		return api.Delivery{}, err
	}
	return deliveryToAPI(d, lines, actors), nil
}

func (s *Server) ListDeliveries(w http.ResponseWriter, r *http.Request, _ api.ListDeliveriesParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var items []api.Delivery
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		rows, err := q.ListDeliveries(r.Context(), tc.tenantID)
		if err != nil {
			return err
		}
		items = make([]api.Delivery, 0, len(rows))
		for _, d := range rows {
			lines, err := q.ListDeliveryLines(r.Context(), store.ListDeliveryLinesParams{TenantID: tc.tenantID, DeliveryID: d.ID})
			if err != nil {
				return err
			}
			actors, err := loadDocActors(r.Context(), q, d.CreatedBy, d.PostedBy)
			if err != nil {
				return err
			}
			items = append(items, deliveryToAPI(d, lines, actors))
		}
		return nil
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, api.DeliveryList{Items: items})
}

func (s *Server) CreateDelivery(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.DeliveryInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.Delivery
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		d, err := q.CreateDelivery(r.Context(), store.CreateDeliveryParams{
			TenantID:     tc.tenantID,
			SalesOrderID: optUUID(req.SalesOrderId),
			CustomerID:   req.CustomerId,
			WarehouseID:  req.WarehouseId,
			DocDate:      dateToPg(req.DocDate),
			Notes:        derefNotes(req.Notes),
			Status:       statusDraft,
			CreatedBy:    tc.user.ID,
		})
		if err != nil {
			return err
		}
		if err := s.insertDeliveryLines(r.Context(), q, tc.tenantID, d.ID, req.Lines); err != nil {
			return err
		}
		out, err = s.loadDelivery(r.Context(), q, tc.tenantID, d.ID)
		return err
	})
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) insertDeliveryLines(ctx context.Context, q *store.Queries, tenantID, dID uuid.UUID, lines []api.DeliveryLineInput) error {
	for i, l := range lines {
		qty, err := parseDecimal(l.Qty)
		if err != nil || !qty.IsPositive() {
			return errValidation{"line qty must be a positive decimal"}
		}
		qtyNum, _ := store.Numeric(qty)
		batch, _ := optBatch(l.BatchId)
		if _, err := q.InsertDeliveryLine(ctx, store.InsertDeliveryLineParams{
			TenantID:         tenantID,
			DeliveryID:       dID,
			LineNo:           int32(i + 1),
			SalesOrderLineID: optUUID(l.SalesOrderLineId),
			ProductID:        l.ProductId,
			BatchID:          batch,
			Uom:              l.Uom,
			Qty:              qtyNum,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) GetDelivery(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out api.Delivery
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		out, err = s.loadDelivery(r.Context(), q, tc.tenantID, id)
		return err
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) UpdateDelivery(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.DeliveryInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.Delivery
	var immutable bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetDelivery(r.Context(), store.GetDeliveryParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			immutable = true
			return nil
		}
		if _, err := q.UpdateDeliveryHeader(r.Context(), store.UpdateDeliveryHeaderParams{
			TenantID:     tc.tenantID,
			ID:           id,
			SalesOrderID: optUUID(req.SalesOrderId),
			CustomerID:   req.CustomerId,
			WarehouseID:  req.WarehouseId,
			DocDate:      dateToPg(req.DocDate),
			Notes:        derefNotes(req.Notes),
		}); err != nil {
			return err
		}
		if err := q.DeleteDeliveryLines(r.Context(), store.DeleteDeliveryLinesParams{TenantID: tc.tenantID, DeliveryID: id}); err != nil {
			return err
		}
		if err := s.insertDeliveryLines(r.Context(), q, tc.tenantID, id, req.Lines); err != nil {
			return err
		}
		out, err = s.loadDelivery(r.Context(), q, tc.tenantID, id)
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

func (s *Server) DeleteDelivery(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var notDraft bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetDelivery(r.Context(), store.GetDeliveryParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			notDraft = true
			return nil
		}
		return q.DeleteDelivery(r.Context(), store.DeleteDeliveryParams{TenantID: tc.tenantID, ID: id})
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

func (s *Server) PostDelivery(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	s.postStockDocument(w, r, tc, id, docTypeDelivery,
		func(ctx context.Context, q *store.Queries) (string, []stock.Movement, int, error) {
			d, err := q.GetDelivery(ctx, store.GetDeliveryParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return "", nil, 0, err
			}
			if d.Status != statusDraft {
				return "", nil, 0, errConflict{"only a draft can be posted"}
			}
			lines, err := q.ListDeliveryLines(ctx, store.ListDeliveryLinesParams{TenantID: tc.tenantID, DeliveryID: id})
			if err != nil {
				return "", nil, 0, err
			}
			if err := s.checkOverDelivery(ctx, q, tc.tenantID, id, lines); err != nil {
				return "", nil, 0, err
			}
			movements, err := deliveryMovements(tc, d, lines, false)
			if err != nil {
				return "", nil, 0, err
			}
			return d.Status, movements, d.DocDate.Time.Year(), nil
		},
		func(ctx context.Context, q *store.Queries, number string) error {
			_, err := q.MarkDeliveryPosted(ctx, store.MarkDeliveryPostedParams{TenantID: tc.tenantID, ID: id, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
			return err
		},
		func(ctx context.Context, q *store.Queries) (any, error) {
			return s.loadDelivery(ctx, q, tc.tenantID, id)
		},
		http.StatusOK,
	)
}

func (s *Server) ReverseDelivery(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	s.reverseStockDocument(w, r, tc, id, docTypeDelivery,
		func(ctx context.Context, q *store.Queries) (reversalPlan, error) {
			orig, err := q.GetDelivery(ctx, store.GetDeliveryParams{TenantID: tc.tenantID, ID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			if orig.Status != statusPosted {
				return reversalPlan{}, errConflict{"only a posted document can be reversed"}
			}
			lines, err := q.ListDeliveryLines(ctx, store.ListDeliveryLinesParams{TenantID: tc.tenantID, DeliveryID: id})
			if err != nil {
				return reversalPlan{}, err
			}
			rev, err := q.CreateDelivery(ctx, store.CreateDeliveryParams{
				TenantID:     tc.tenantID,
				SalesOrderID: orig.SalesOrderID,
				CustomerID:   orig.CustomerID,
				WarehouseID:  orig.WarehouseID,
				DocDate:      orig.DocDate,
				Notes:        "reversal of " + orig.DocNumber.String,
				ReversesID:   pgUUID(id),
				Status:       statusDraft,
				CreatedBy:    tc.user.ID,
			})
			if err != nil {
				return reversalPlan{}, err
			}
			for _, l := range lines {
				if _, err := q.InsertDeliveryLine(ctx, store.InsertDeliveryLineParams{
					TenantID: tc.tenantID, DeliveryID: rev.ID, LineNo: l.LineNo,
					SalesOrderLineID: l.SalesOrderLineID, ProductID: l.ProductID, BatchID: l.BatchID,
					Uom: l.Uom, Qty: l.Qty,
				}); err != nil {
					return reversalPlan{}, err
				}
			}
			// A reversal receives the delivered quantity back in.
			movements, err := deliveryMovements(tc, rev, lines, true)
			if err != nil {
				return reversalPlan{}, err
			}
			return reversalPlan{
				reversalID: rev.ID,
				movements:  movements,
				year:       rev.DocDate.Time.Year(),
				markPosted: func(ctx context.Context, q *store.Queries, number string) error {
					_, err := q.MarkDeliveryPosted(ctx, store.MarkDeliveryPostedParams{TenantID: tc.tenantID, ID: rev.ID, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)})
					return err
				},
				markReversed: func(ctx context.Context, q *store.Queries) error {
					return q.MarkDeliveryReversed(ctx, store.MarkDeliveryReversedParams{TenantID: tc.tenantID, ID: id, ReversedByID: pgUUID(rev.ID)})
				},
				render: func(ctx context.Context, q *store.Queries) (any, error) {
					return s.loadDelivery(ctx, q, tc.tenantID, rev.ID)
				},
			}, nil
		},
	)
}

// checkOverDelivery enforces ADR-0016 for the sales side: per linked SO line, the
// sum of already-delivered qty plus the new delivery qty must not exceed ordered
// qty * (1 + tolerance). Lines without an SO link are unconstrained.
func (s *Server) checkOverDelivery(ctx context.Context, q *store.Queries, tenantID, dID uuid.UUID, lines []store.DeliveryLine) error {
	toleranceRaw, err := q.GetTenantToleranceOverReceipt(ctx, tenantID)
	if err != nil {
		return err
	}
	tolerance, err := numericFromAny(toleranceRaw)
	if err != nil {
		return err
	}

	for _, l := range lines {
		if !l.SalesOrderLineID.Valid {
			continue
		}
		soLineID := uuid.UUID(l.SalesOrderLineID.Bytes)

		if err := q.LockSOLineForDelivery(ctx, soLineID.String()); err != nil {
			return err
		}

		sol, err := q.GetSalesOrderLineByID(ctx, store.GetSalesOrderLineByIDParams{TenantID: tenantID, ID: soLineID})
		if err != nil {
			return err
		}
		ordered, err := store.Decimal(sol.Qty)
		if err != nil {
			return err
		}

		alreadyRaw, err := q.SumDeliveredForSOLine(ctx, store.SumDeliveredForSOLineParams{
			TenantID:          tenantID,
			SalesOrderLineID:  pgtype.UUID{Bytes: soLineID, Valid: true},
			ExcludeDeliveryID: dID,
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

		ceiling := ordered.Mul(decimal.NewFromInt(1).Add(tolerance))
		if already.Add(newQty).GreaterThan(ceiling) {
			return errOverDelivery{msg: "delivery qty would exceed ordered qty beyond tolerance"}
		}
	}
	return nil
}

// deliveryMovements builds one issue movement per line (stock out, qty negative).
// UnitCost is left zero so the costing engine assigns the issue cost from the
// running average (or last known cost below zero, D6). When negate is true (a
// reversal) it becomes a receipt back in; the reversal receipt carries the
// average cost so re-averaging is a no-op at that cost.
func deliveryMovements(tc tenantCtx, d store.Delivery, lines []store.DeliveryLine, negate bool) ([]stock.Movement, error) {
	movements := make([]stock.Movement, 0, len(lines))
	for _, l := range lines {
		qty, err := store.Decimal(l.Qty)
		if err != nil {
			return nil, err
		}
		mtype := stock.Issue
		signed := qty.Neg()
		if negate {
			mtype = stock.Receipt
			signed = qty
		}
		movements = append(movements, stock.Movement{
			Key:         keyOf(l.ProductID, d.WarehouseID, l.BatchID),
			Qty:         signed,
			Type:        mtype,
			DocLineID:   l.ID,
			EffectiveAt: effectiveAt(d.DocDate),
			CreatedBy:   tc.user.ID,
		})
	}
	return movements, nil
}
