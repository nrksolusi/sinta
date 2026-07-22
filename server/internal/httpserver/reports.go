package httpserver

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/stock"
	"github.com/nrksolusi/sinta/internal/store"
)

// The reports are read-only views over the journal and its derived caches
// (docs/plans/m1-parallel.md, Track D). Stock on hand and valuation read the
// stock_levels cache; the stock card folds the append-only journal through the
// tenant's costing engine to produce a per-movement running balance - the stock
// audit trail (ADR-0001). Every read runs inside tenantTx so RLS scopes it to
// the active tenant (ADR-0004).

// tenantEngine returns the costing engine for a tenant's configured method. In
// M1 only weighted average is available (PLAN.md D15); onboarding refuses FIFO,
// so an unknown method here is a data error we surface rather than guess at.
func tenantEngine(method string) (costing.Engine, bool) {
	switch method {
	case "weighted_average":
		return costing.NewAverage(), true
	default:
		return nil, false
	}
}

func (s *Server) ReportStockOnHand(w http.ResponseWriter, r *http.Request, params api.ReportStockOnHandParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}

	var rows []store.StockOnHandRow
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.StockOnHand(r.Context(), store.StockOnHandParams{
			TenantID:    tc.tenantID,
			WarehouseID: optionalFilterUUID(params.WarehouseId),
			ProductID:   optionalFilterUUID(params.ProductId),
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read stock on hand")
		return
	}

	out := api.StockOnHandReport{Rows: make([]api.StockOnHandRow, 0, len(rows))}
	for _, row := range rows {
		qty, err := store.Decimal(row.QtyOnHand)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not decode quantity")
			return
		}
		item := api.StockOnHandRow{
			ProductId:     row.ProductID,
			Sku:           row.Sku,
			ProductName:   row.ProductName,
			WarehouseId:   row.WarehouseID,
			WarehouseCode: row.WarehouseCode,
			WarehouseName: row.WarehouseName,
			QtyOnHand:     qty.String(),
		}
		setBatch(&item.BatchId, &item.BatchNo, row.BatchID, row.BatchNo)
		out.Rows = append(out.Rows, item)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) ReportStockValuation(w http.ResponseWriter, r *http.Request, params api.ReportStockValuationParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}

	var rows []store.StockOnHandRow
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.StockOnHand(r.Context(), store.StockOnHandParams{
			TenantID:    tc.tenantID,
			WarehouseID: optionalFilterUUID(params.WarehouseId),
			ProductID:   optionalFilterUUID(params.ProductId),
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read stock valuation")
		return
	}

	// Value each key as qty_on_hand * avg_cost from the cache. The cache is a
	// faithful reduction of the journal (the Poster re-folds every posting
	// through the costing engine, ADR-0001), so this equals folding the journal
	// under the tenant's costing method (weighted average, M1) but avoids
	// re-reading the whole journal for a summary report.
	out := api.StockValuationReport{Rows: make([]api.StockValuationRow, 0, len(rows))}
	total := decimal.Zero
	for _, row := range rows {
		qty, err := store.Decimal(row.QtyOnHand)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not decode quantity")
			return
		}
		avg, err := store.Decimal(row.AvgCost)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "could not decode cost")
			return
		}
		value := qty.Mul(avg)
		total = total.Add(value)
		item := api.StockValuationRow{
			ProductId:     row.ProductID,
			Sku:           row.Sku,
			ProductName:   row.ProductName,
			WarehouseId:   row.WarehouseID,
			WarehouseCode: row.WarehouseCode,
			WarehouseName: row.WarehouseName,
			QtyOnHand:     qty.String(),
			AvgCost:       avg.String(),
			Value:         value.String(),
		}
		setBatch(&item.BatchId, &item.BatchNo, row.BatchID, row.BatchNo)
		out.Rows = append(out.Rows, item)
	}
	out.TotalValue = total.String()
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) ReportStockCard(w http.ResponseWriter, r *http.Request, params api.ReportStockCardParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}

	engine, ok := tenantEngine(tc.tenant.CostingMethod)
	if !ok {
		writeError(w, http.StatusInternalServerError, "unsupported_costing_method",
			"tenant costing method has no engine")
		return
	}

	var rows []store.StockCardMovementsRow
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.StockCardMovements(r.Context(), store.StockCardMovementsParams{
			TenantID:    tc.tenantID,
			ProductID:   params.ProductId,
			WarehouseID: optionalFilterUUID(params.WarehouseId),
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not read stock card")
		return
	}

	entries, err := buildStockCard(engine, rows)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not value stock card")
		return
	}

	writeJSON(w, http.StatusOK, api.StockCardReport{
		ProductId: params.ProductId,
		Entries:   entries,
	})
}

// buildStockCard folds the product's journal into per-movement entries carrying
// the running balance. The rows arrive ordered per stock key (warehouse, batch,
// effective_at, seq); the costing engine is stateless across keys, so each
// contiguous key run is folded independently and its valuations mapped back to
// the movements in order. The entries are emitted in the same query order so a
// product spanning several warehouses reads as one card grouped by key.
func buildStockCard(engine costing.Engine, rows []store.StockCardMovementsRow) ([]api.StockCardEntry, error) {
	entries := make([]api.StockCardEntry, 0, len(rows))

	i := 0
	for i < len(rows) {
		// Find the extent of the current (warehouse, batch) run.
		j := i + 1
		for j < len(rows) && sameKey(rows[i], rows[j]) {
			j++
		}
		run := rows[i:j]

		ordered := make([]stock.Movement, 0, len(run))
		for _, row := range run {
			qty, err := store.Decimal(row.QtyBase)
			if err != nil {
				return nil, err
			}
			cost, err := store.Decimal(row.UnitCost)
			if err != nil {
				return nil, err
			}
			ordered = append(ordered, stock.Movement{
				ID:          row.ID,
				Qty:         qty,
				UnitCost:    cost,
				Type:        stock.MovementType(row.MovementType),
				EffectiveAt: row.EffectiveAt.Time,
				Seq:         row.Seq,
				Provisional: row.IsProvisional,
			})
		}

		valuations, err := engine.Cost(ordered)
		if err != nil {
			return nil, err
		}

		for k, row := range run {
			val := valuations[k]
			qty, err := store.Decimal(row.QtyBase)
			if err != nil {
				return nil, err
			}
			entry := api.StockCardEntry{
				MovementId:   row.ID,
				WarehouseId:  row.WarehouseID,
				MovementType: api.StockCardEntryMovementType(row.MovementType),
				Qty:          qty.String(),
				UnitCost:     val.UnitCost.String(),
				EffectiveAt:  row.EffectiveAt.Time,
				Seq:          row.Seq,
				RunningQty:   val.QtyOnHand.String(),
				RunningValue: val.ValueOnHand.String(),
				Provisional:  val.Provisional,
			}
			if row.BatchID.Valid {
				id := openapi_types.UUID(row.BatchID.Bytes)
				entry.BatchId = &id
			}
			if row.DocType != "" {
				dt := row.DocType
				entry.DocType = &dt
			}
			if row.DocID != uuid.Nil {
				did := openapi_types.UUID(row.DocID)
				entry.DocId = &did
			}
			entries = append(entries, entry)
		}

		i = j
	}

	return entries, nil
}

// sameKey reports whether two journal rows belong to the same stock key
// (warehouse and batch); the product is fixed for the whole card.
func sameKey(a, b store.StockCardMovementsRow) bool {
	if a.WarehouseID != b.WarehouseID {
		return false
	}
	return a.BatchID.Valid == b.BatchID.Valid && a.BatchID.Bytes == b.BatchID.Bytes
}

// optionalFilterUUID maps an absent (nil) filter to an unset pgtype.UUID (the
// query treats NULL as "no filter") and a present one to a set value.
func optionalFilterUUID(id *openapi_types.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: *id, Valid: true}
}

// setBatch copies an optional batch id and number from the query row onto the
// wire row, leaving both nil for stock that is not batch-tracked.
func setBatch(dstID **openapi_types.UUID, dstNo **string, batchID pgtype.UUID, batchNo pgtype.Text) {
	if batchID.Valid {
		id := openapi_types.UUID(batchID.Bytes)
		*dstID = &id
	}
	if batchNo.Valid {
		no := batchNo.String
		*dstNo = &no
	}
}
