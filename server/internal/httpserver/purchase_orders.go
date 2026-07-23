package httpserver

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/store"
)

// Purchase orders are intent to buy (glossary). Posting assigns the gapless
// number and flips status to posted; it writes no journal movements. Reversal
// posts a cancelling document (also number-only) and marks the original reversed.

func purchaseOrderToAPI(po store.PurchaseOrder, lines []store.PurchaseOrderLine, actors docActors, rollup map[uuid.UUID]string) api.PurchaseOrder {
	apiLines := make([]api.PurchaseOrderLine, 0, len(lines))
	for _, l := range lines {
		line := api.PurchaseOrderLine{
			Id:        l.ID,
			LineNo:    int(l.LineNo),
			ProductId: l.ProductID,
			Uom:       l.Uom,
			Qty:       numericToString(l.Qty),
			UnitCost:  numericToString(l.UnitCost),
		}
		if rollup != nil {
			if recvd, ok := rollup[l.ID]; ok {
				line.ReceivedQty = &recvd
				state := fulfillmentState(numericToString(l.Qty), recvd)
				line.FulfillmentState = &state
			}
		}
		apiLines = append(apiLines, line)
	}
	return api.PurchaseOrder{
		Id:           po.ID,
		DocNumber:    textPtr(po.DocNumber),
		Status:       api.DocumentStatus(po.Status),
		SupplierId:   po.SupplierID,
		WarehouseId:  po.WarehouseID,
		DocDate:      pgToDate(po.DocDate),
		Notes:        po.Notes,
		ReversesId:   pgUUIDPtr(po.ReversesID),
		ReversedById: pgUUIDPtr(po.ReversedByID),
		CreatedAt:    pgTimestamp(po.CreatedAt),
		CreatedBy:    actors.createdBy,
		PostedAt:     pgTimestampPtr(po.PostedAt),
		PostedBy:     actors.postedBy,
		Lines:        apiLines,
	}
}

// fulfillmentState computes open/partial/closed from ordered and fulfilled string quantities.
func fulfillmentState(orderedStr, fulfilledStr string) api.FulfillmentState {
	ordered, _ := decimal.NewFromString(orderedStr)
	fulfilled, _ := decimal.NewFromString(fulfilledStr)
	if fulfilled.IsZero() || ordered.IsZero() {
		return api.Open
	}
	if fulfilled.GreaterThanOrEqual(ordered) {
		return api.Closed
	}
	return api.Partial
}

func (s *Server) loadPurchaseOrder(ctx context.Context, q *store.Queries, tenantID, id uuid.UUID) (api.PurchaseOrder, error) {
	po, err := q.GetPurchaseOrder(ctx, store.GetPurchaseOrderParams{TenantID: tenantID, ID: id})
	if err != nil {
		return api.PurchaseOrder{}, err
	}
	lines, err := q.ListPurchaseOrderLines(ctx, store.ListPurchaseOrderLinesParams{TenantID: tenantID, PurchaseOrderID: id})
	if err != nil {
		return api.PurchaseOrder{}, err
	}
	actors, err := loadDocActors(ctx, q, po.CreatedBy, po.PostedBy)
	if err != nil {
		return api.PurchaseOrder{}, err
	}
	rollup, err := poLineRollup(ctx, q, tenantID, id)
	if err != nil {
		return api.PurchaseOrder{}, err
	}
	return purchaseOrderToAPI(po, lines, actors, rollup), nil
}

// poLineRollup returns a map of PO line ID -> received qty string for all
// posted non-reversal goods receipts linked to the given PO.
func poLineRollup(ctx context.Context, q *store.Queries, tenantID, poID uuid.UUID) (map[uuid.UUID]string, error) {
	rows, err := q.GetPOLineRollups(ctx, store.GetPOLineRollupsParams{TenantID: tenantID, PurchaseOrderID: poID})
	if err != nil {
		return nil, err
	}
	m := make(map[uuid.UUID]string, len(rows))
	for _, r := range rows {
		qty, err := numericFromAny(r.ReceivedQty)
		if err != nil {
			return nil, err
		}
		m[r.ID] = qty.String()
	}
	return m, nil
}

func (s *Server) ListPurchaseOrders(w http.ResponseWriter, r *http.Request, params api.ListPurchaseOrdersParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	f, err := resolveDocListFilter(params.Status, params.WarehouseId, params.DateFrom, params.DateTo, params.Q, params.Cursor, params.Limit)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_cursor", "cursor is invalid")
		return
	}
	var items []api.PurchaseOrder
	var nextCursor *string
	err = s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		rows, err := q.ListPurchaseOrders(r.Context(), store.ListPurchaseOrdersParams{
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
			func(po store.PurchaseOrder) pgtype.Timestamptz { return po.CreatedAt },
			func(po store.PurchaseOrder) uuid.UUID { return po.ID })
		items = make([]api.PurchaseOrder, 0, len(rows))
		for _, po := range rows {
			lines, err := q.ListPurchaseOrderLines(r.Context(), store.ListPurchaseOrderLinesParams{TenantID: tc.tenantID, PurchaseOrderID: po.ID})
			if err != nil {
				return err
			}
			actors, err := loadDocActors(r.Context(), q, po.CreatedBy, po.PostedBy)
			if err != nil {
				return err
			}
			items = append(items, purchaseOrderToAPI(po, lines, actors, nil))
		}
		return nil
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, api.PurchaseOrderList{Items: items, NextCursor: nextCursor})
}

func (s *Server) CreatePurchaseOrder(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.PurchaseOrderInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}

	var out api.PurchaseOrder
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		po, err := q.CreatePurchaseOrder(r.Context(), store.CreatePurchaseOrderParams{
			TenantID:    tc.tenantID,
			SupplierID:  req.SupplierId,
			WarehouseID: req.WarehouseId,
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
			Status:      statusDraft,
			CreatedBy:   tc.user.ID,
		})
		if err != nil {
			return err
		}
		for i, l := range req.Lines {
			qty, err := parseDecimal(l.Qty)
			if err != nil {
				return errValidation{"line qty is not a valid decimal"}
			}
			cost := decimalOrZero(l.UnitCost)
			qtyNum, _ := store.Numeric(qty)
			costNum, _ := store.Numeric(cost)
			if _, err := q.InsertPurchaseOrderLine(r.Context(), store.InsertPurchaseOrderLineParams{
				TenantID:        tc.tenantID,
				PurchaseOrderID: po.ID,
				LineNo:          int32(i + 1),
				ProductID:       l.ProductId,
				Uom:             l.Uom,
				Qty:             qtyNum,
				UnitCost:        costNum,
			}); err != nil {
				return err
			}
		}
		out, err = s.loadPurchaseOrder(r.Context(), q, tc.tenantID, po.ID)
		return err
	})
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) GetPurchaseOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out api.PurchaseOrder
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		out, err = s.loadPurchaseOrder(r.Context(), q, tc.tenantID, id)
		return err
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) UpdatePurchaseOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.PurchaseOrderInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}

	var out api.PurchaseOrder
	var immutable bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetPurchaseOrder(r.Context(), store.GetPurchaseOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			immutable = true
			return nil
		}
		if _, err := q.UpdatePurchaseOrderHeader(r.Context(), store.UpdatePurchaseOrderHeaderParams{
			TenantID:    tc.tenantID,
			ID:          id,
			SupplierID:  req.SupplierId,
			WarehouseID: req.WarehouseId,
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
		}); err != nil {
			return err
		}
		if err := q.DeletePurchaseOrderLines(r.Context(), store.DeletePurchaseOrderLinesParams{TenantID: tc.tenantID, PurchaseOrderID: id}); err != nil {
			return err
		}
		for i, l := range req.Lines {
			qty, err := parseDecimal(l.Qty)
			if err != nil {
				return errValidation{"line qty is not a valid decimal"}
			}
			qtyNum, _ := store.Numeric(qty)
			costNum, _ := store.Numeric(decimalOrZero(l.UnitCost))
			if _, err := q.InsertPurchaseOrderLine(r.Context(), store.InsertPurchaseOrderLineParams{
				TenantID:        tc.tenantID,
				PurchaseOrderID: id,
				LineNo:          int32(i + 1),
				ProductID:       l.ProductId,
				Uom:             l.Uom,
				Qty:             qtyNum,
				UnitCost:        costNum,
			}); err != nil {
				return err
			}
		}
		out, err = s.loadPurchaseOrder(r.Context(), q, tc.tenantID, id)
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

func (s *Server) DeletePurchaseOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var notDraft bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetPurchaseOrder(r.Context(), store.GetPurchaseOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			notDraft = true
			return nil
		}
		return q.DeletePurchaseOrder(r.Context(), store.DeletePurchaseOrderParams{TenantID: tc.tenantID, ID: id})
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

func (s *Server) PostPurchaseOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var out api.PurchaseOrder
	var conflict string
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetPurchaseOrder(r.Context(), store.GetPurchaseOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			conflict = "only a draft can be posted"
			return nil
		}
		// Intent only: assign the gapless number and flip status, no movements.
		number, err := store.NewNumberer(q).Next(r.Context(), tc.tenantID, docTypePurchaseOrder, cur.DocDate.Time.Year())
		if err != nil {
			return err
		}
		if _, err := q.MarkPurchaseOrderPosted(r.Context(), store.MarkPurchaseOrderPostedParams{
			TenantID:  tc.tenantID,
			ID:        id,
			DocNumber: pgTextOf(number),
			PostedBy:  toPostedByParam(tc.user.ID),
		}); err != nil {
			return err
		}
		out, err = s.loadPurchaseOrder(r.Context(), q, tc.tenantID, id)
		return err
	})
	if conflict != "" {
		writeError(w, http.StatusConflict, "not_draft", conflict)
		return
	}
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) ReversePurchaseOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var out api.PurchaseOrder
	var conflict string
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		orig, err := q.GetPurchaseOrder(r.Context(), store.GetPurchaseOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if orig.Status != statusPosted {
			conflict = "only a posted document can be reversed"
			return nil
		}
		lines, err := q.ListPurchaseOrderLines(r.Context(), store.ListPurchaseOrderLinesParams{TenantID: tc.tenantID, PurchaseOrderID: id})
		if err != nil {
			return err
		}
		// The reversal is a new posted document linked to the original; a PO moves
		// no stock, so it is number-only like the original.
		rev, err := q.CreatePurchaseOrder(r.Context(), store.CreatePurchaseOrderParams{
			TenantID:    tc.tenantID,
			SupplierID:  orig.SupplierID,
			WarehouseID: orig.WarehouseID,
			DocDate:     dateToPg(pgToDate(orig.DocDate)),
			Notes:       "reversal of " + orig.DocNumber.String,
			ReversesID:  pgUUID(id),
			Status:      statusDraft,
			CreatedBy:   tc.user.ID,
		})
		if err != nil {
			return err
		}
		for _, l := range lines {
			if _, err := q.InsertPurchaseOrderLine(r.Context(), store.InsertPurchaseOrderLineParams{
				TenantID:        tc.tenantID,
				PurchaseOrderID: rev.ID,
				LineNo:          l.LineNo,
				ProductID:       l.ProductID,
				Uom:             l.Uom,
				Qty:             l.Qty,
				UnitCost:        l.UnitCost,
			}); err != nil {
				return err
			}
		}
		number, err := store.NewNumberer(q).Next(r.Context(), tc.tenantID, docTypePurchaseOrder, time.Now().UTC().Year())
		if err != nil {
			return err
		}
		if _, err := q.MarkPurchaseOrderPosted(r.Context(), store.MarkPurchaseOrderPostedParams{TenantID: tc.tenantID, ID: rev.ID, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)}); err != nil {
			return err
		}
		if err := q.MarkPurchaseOrderReversed(r.Context(), store.MarkPurchaseOrderReversedParams{TenantID: tc.tenantID, ID: id, ReversedByID: pgUUID(rev.ID)}); err != nil {
			return err
		}
		out, err = s.loadPurchaseOrder(r.Context(), q, tc.tenantID, rev.ID)
		return err
	})
	if conflict != "" {
		writeError(w, http.StatusConflict, "not_posted", conflict)
		return
	}
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) CancelPurchaseOrder(w http.ResponseWriter, r *http.Request, _ api.DocumentId) {
	writeError(w, http.StatusConflict, "not_implemented", "cancel not yet implemented")
}
