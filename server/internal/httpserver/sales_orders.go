package httpserver

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/store"
)

// Sales orders are commitment to sell (glossary). Like purchase orders they move
// no stock: posting assigns the gapless number and flips status; reversal posts a
// cancelling number-only document.

func salesOrderToAPI(so store.SalesOrder, lines []store.SalesOrderLine, actors docActors) api.SalesOrder {
	apiLines := make([]api.SalesOrderLine, 0, len(lines))
	for _, l := range lines {
		apiLines = append(apiLines, api.SalesOrderLine{
			Id:        l.ID,
			LineNo:    int(l.LineNo),
			ProductId: l.ProductID,
			Uom:       l.Uom,
			Qty:       numericToString(l.Qty),
			UnitPrice: numericToString(l.UnitPrice),
		})
	}
	return api.SalesOrder{
		Id:           so.ID,
		DocNumber:    textPtr(so.DocNumber),
		Status:       api.DocumentStatus(so.Status),
		CustomerId:   so.CustomerID,
		WarehouseId:  so.WarehouseID,
		DocDate:      pgToDate(so.DocDate),
		Notes:        so.Notes,
		ReversesId:   pgUUIDPtr(so.ReversesID),
		ReversedById: pgUUIDPtr(so.ReversedByID),
		CreatedAt:    pgTimestamp(so.CreatedAt),
		CreatedBy:    actors.createdBy,
		PostedAt:     pgTimestampPtr(so.PostedAt),
		PostedBy:     actors.postedBy,
		Lines:        apiLines,
	}
}

func (s *Server) loadSalesOrder(ctx context.Context, q *store.Queries, tenantID, id uuid.UUID) (api.SalesOrder, error) {
	so, err := q.GetSalesOrder(ctx, store.GetSalesOrderParams{TenantID: tenantID, ID: id})
	if err != nil {
		return api.SalesOrder{}, err
	}
	lines, err := q.ListSalesOrderLines(ctx, store.ListSalesOrderLinesParams{TenantID: tenantID, SalesOrderID: id})
	if err != nil {
		return api.SalesOrder{}, err
	}
	actors, err := loadDocActors(ctx, q, so.CreatedBy, so.PostedBy)
	if err != nil {
		return api.SalesOrder{}, err
	}
	return salesOrderToAPI(so, lines, actors), nil
}

func (s *Server) ListSalesOrders(w http.ResponseWriter, r *http.Request, _ api.ListSalesOrdersParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var items []api.SalesOrder
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		rows, err := q.ListSalesOrders(r.Context(), tc.tenantID)
		if err != nil {
			return err
		}
		items = make([]api.SalesOrder, 0, len(rows))
		for _, so := range rows {
			lines, err := q.ListSalesOrderLines(r.Context(), store.ListSalesOrderLinesParams{TenantID: tc.tenantID, SalesOrderID: so.ID})
			if err != nil {
				return err
			}
			actors, err := loadDocActors(r.Context(), q, so.CreatedBy, so.PostedBy)
			if err != nil {
				return err
			}
			items = append(items, salesOrderToAPI(so, lines, actors))
		}
		return nil
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, api.SalesOrderList{Items: items})
}

func (s *Server) CreateSalesOrder(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.SalesOrderInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.SalesOrder
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		so, err := q.CreateSalesOrder(r.Context(), store.CreateSalesOrderParams{
			TenantID:    tc.tenantID,
			CustomerID:  req.CustomerId,
			WarehouseID: req.WarehouseId,
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
			Status:      statusDraft,
			CreatedBy:   tc.user.ID,
		})
		if err != nil {
			return err
		}
		if err := s.insertSalesOrderLines(r.Context(), q, tc.tenantID, so.ID, req.Lines); err != nil {
			return err
		}
		out, err = s.loadSalesOrder(r.Context(), q, tc.tenantID, so.ID)
		return err
	})
	if handleWriteErr(w, err) {
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) insertSalesOrderLines(ctx context.Context, q *store.Queries, tenantID, soID uuid.UUID, lines []api.SalesOrderLineInput) error {
	for i, l := range lines {
		qty, err := parseDecimal(l.Qty)
		if err != nil || !qty.IsPositive() {
			return errValidation{"line qty must be a positive decimal"}
		}
		qtyNum, _ := store.Numeric(qty)
		priceNum, _ := store.Numeric(decimalOrZero(l.UnitPrice))
		if _, err := q.InsertSalesOrderLine(ctx, store.InsertSalesOrderLineParams{
			TenantID:     tenantID,
			SalesOrderID: soID,
			LineNo:       int32(i + 1),
			ProductID:    l.ProductId,
			Uom:          l.Uom,
			Qty:          qtyNum,
			UnitPrice:    priceNum,
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) GetSalesOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var out api.SalesOrder
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		out, err = s.loadSalesOrder(r.Context(), q, tc.tenantID, id)
		return err
	})
	if writeStoreError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) UpdateSalesOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var req api.SalesOrderInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if len(req.Lines) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no_lines", "a document needs at least one line")
		return
	}
	var out api.SalesOrder
	var immutable bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetSalesOrder(r.Context(), store.GetSalesOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			immutable = true
			return nil
		}
		if _, err := q.UpdateSalesOrderHeader(r.Context(), store.UpdateSalesOrderHeaderParams{
			TenantID:    tc.tenantID,
			ID:          id,
			CustomerID:  req.CustomerId,
			WarehouseID: req.WarehouseId,
			DocDate:     dateToPg(req.DocDate),
			Notes:       derefNotes(req.Notes),
		}); err != nil {
			return err
		}
		if err := q.DeleteSalesOrderLines(r.Context(), store.DeleteSalesOrderLinesParams{TenantID: tc.tenantID, SalesOrderID: id}); err != nil {
			return err
		}
		if err := s.insertSalesOrderLines(r.Context(), q, tc.tenantID, id, req.Lines); err != nil {
			return err
		}
		out, err = s.loadSalesOrder(r.Context(), q, tc.tenantID, id)
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

func (s *Server) DeleteSalesOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var notDraft bool
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetSalesOrder(r.Context(), store.GetSalesOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			notDraft = true
			return nil
		}
		return q.DeleteSalesOrder(r.Context(), store.DeleteSalesOrderParams{TenantID: tc.tenantID, ID: id})
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

func (s *Server) PostSalesOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var out api.SalesOrder
	var conflict string
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		cur, err := q.GetSalesOrder(r.Context(), store.GetSalesOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if cur.Status != statusDraft {
			conflict = "only a draft can be posted"
			return nil
		}
		number, err := store.NewNumberer(q).Next(r.Context(), tc.tenantID, docTypeSalesOrder, cur.DocDate.Time.Year())
		if err != nil {
			return err
		}
		if _, err := q.MarkSalesOrderPosted(r.Context(), store.MarkSalesOrderPostedParams{TenantID: tc.tenantID, ID: id, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)}); err != nil {
			return err
		}
		out, err = s.loadSalesOrder(r.Context(), q, tc.tenantID, id)
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

func (s *Server) ReverseSalesOrder(w http.ResponseWriter, r *http.Request, id openapi_types.UUID) {
	tc, ok := s.requireDocumentWriter(w, r)
	if !ok {
		return
	}
	var out api.SalesOrder
	var conflict string
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		orig, err := q.GetSalesOrder(r.Context(), store.GetSalesOrderParams{TenantID: tc.tenantID, ID: id})
		if err != nil {
			return err
		}
		if orig.Status != statusPosted {
			conflict = "only a posted document can be reversed"
			return nil
		}
		lines, err := q.ListSalesOrderLines(r.Context(), store.ListSalesOrderLinesParams{TenantID: tc.tenantID, SalesOrderID: id})
		if err != nil {
			return err
		}
		rev, err := q.CreateSalesOrder(r.Context(), store.CreateSalesOrderParams{
			TenantID:    tc.tenantID,
			CustomerID:  orig.CustomerID,
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
			if _, err := q.InsertSalesOrderLine(r.Context(), store.InsertSalesOrderLineParams{
				TenantID: tc.tenantID, SalesOrderID: rev.ID, LineNo: l.LineNo,
				ProductID: l.ProductID, Uom: l.Uom, Qty: l.Qty, UnitPrice: l.UnitPrice,
			}); err != nil {
				return err
			}
		}
		number, err := store.NewNumberer(q).Next(r.Context(), tc.tenantID, docTypeSalesOrder, time.Now().UTC().Year())
		if err != nil {
			return err
		}
		if _, err := q.MarkSalesOrderPosted(r.Context(), store.MarkSalesOrderPostedParams{TenantID: tc.tenantID, ID: rev.ID, DocNumber: pgTextOf(number), PostedBy: toPostedByParam(tc.user.ID)}); err != nil {
			return err
		}
		if err := q.MarkSalesOrderReversed(r.Context(), store.MarkSalesOrderReversedParams{TenantID: tc.tenantID, ID: id, ReversedByID: pgUUID(rev.ID)}); err != nil {
			return err
		}
		out, err = s.loadSalesOrder(r.Context(), q, tc.tenantID, rev.ID)
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

func (s *Server) CancelSalesOrder(w http.ResponseWriter, r *http.Request, _ api.DocumentId) {
	writeError(w, http.StatusConflict, "not_implemented", "cancel not yet implemented")
}
