package httpserver

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/jackc/pgerrcode"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/domain/catalog"
	"github.com/nrksolusi/sinta/internal/store"
)

// ---------------------------------------------------------------------------
// Shared conversion helpers between the store boundary (pgtype) and the wire.
// ---------------------------------------------------------------------------

// optText maps a nullable database text column to an omit-when-absent pointer.
func optText(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

// pgText builds a pgtype.Text; a nil or empty pointer becomes SQL NULL, so a
// blank barcode/code is stored as absent rather than an empty string (keeping
// the partial unique indexes clean).
func pgText(p *string) pgtype.Text {
	if p == nil || *p == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *p, Valid: true}
}

// numericFromDecimal converts a domain decimal to pgtype.Numeric at the store
// boundary. Quantities and money are numeric, never float (CLAUDE.md).
func numericFromDecimal(d decimal.Decimal) (pgtype.Numeric, error) {
	var n pgtype.Numeric
	if err := n.Scan(d.String()); err != nil {
		return pgtype.Numeric{}, err
	}
	return n, nil
}

func optDate(d pgtype.Date) *openapi_types.Date {
	if !d.Valid {
		return nil
	}
	return &openapi_types.Date{Time: d.Time}
}

func pgDate(d *openapi_types.Date) pgtype.Date {
	if d == nil {
		return pgtype.Date{}
	}
	return pgtype.Date{Time: d.Time, Valid: true}
}

// isUniqueViolation reports whether err is a Postgres unique-constraint error,
// so handlers can surface a DB conflict as 409 instead of 500 (mirrors auth.go).
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == pgerrcode.UniqueViolation
}

// isCheckViolation reports whether err is a Postgres CHECK-constraint failure,
// surfaced as 422 (e.g. a partner that is neither supplier nor customer).
func isCheckViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == pgerrcode.CheckViolation
}

// ---------------------------------------------------------------------------
// Wire mappers
// ---------------------------------------------------------------------------

func productToAPI(p store.Product) api.Product {
	return api.Product{
		Id:             p.ID,
		Sku:            p.Sku,
		Name:           p.Name,
		BaseUom:        p.BaseUom,
		IsBatchTracked: p.IsBatchTracked,
		Barcode:        optText(p.Barcode),
		Status:         api.CatalogStatus(p.Status),
	}
}

func productUomToAPI(u store.ProductUom) api.ProductUom {
	return api.ProductUom{
		Id:           u.ID,
		ProductId:    u.ProductID,
		Uom:          u.Uom,
		FactorToBase: numericToString(u.FactorToBase),
	}
}

func batchToAPI(b store.Batch) api.Batch {
	return api.Batch{
		Id:         b.ID,
		ProductId:  b.ProductID,
		BatchNo:    b.BatchNo,
		ExpiryDate: optDate(b.ExpiryDate),
	}
}

func partnerToAPI(p store.Partner) api.Partner {
	return api.Partner{
		Id:         p.ID,
		Code:       optText(p.Code),
		Name:       p.Name,
		IsSupplier: p.IsSupplier,
		IsCustomer: p.IsCustomer,
		Status:     api.CatalogStatus(p.Status),
	}
}

func warehouseToAPI(w store.Warehouse) api.Warehouse {
	return api.Warehouse{Id: w.ID, Code: w.Code, Name: w.Name}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_body", "request body is not valid JSON")
		return false
	}
	return true
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

func (s *Server) ListProducts(w http.ResponseWriter, r *http.Request, params api.ListProductsParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}

	statusFilter := pgtype.Text{}
	if params.Status != nil {
		statusFilter = pgtype.Text{String: string(*params.Status), Valid: true}
	}

	var rows []store.Product
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.ListProducts(r.Context(), store.ListProductsParams{
			TenantID: tc.tenantID,
			Status:   statusFilter,
			Q:        pgTextFrom(params.Q),
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list products")
		return
	}
	out := make([]api.Product, 0, len(rows))
	for _, p := range rows {
		out = append(out, productToAPI(p))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) CreateProduct(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.CreateProductRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Sku == "" || req.Name == "" || req.BaseUom == "" {
		writeError(w, http.StatusUnprocessableEntity, "missing_fields", "sku, name and baseUom are required")
		return
	}
	batchTracked := false
	if req.IsBatchTracked != nil {
		batchTracked = *req.IsBatchTracked
	}

	var product store.Product
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		product, err = q.CreateProduct(r.Context(), store.CreateProductParams{
			TenantID:       tc.tenantID,
			Sku:            req.Sku,
			Name:           req.Name,
			BaseUom:        req.BaseUom,
			IsBatchTracked: batchTracked,
			Barcode:        pgText(req.Barcode),
		})
		return err
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "product_exists", "a product with this SKU or barcode already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create product")
		return
	}
	writeJSON(w, http.StatusCreated, productToAPI(product))
}

func (s *Server) GetProduct(w http.ResponseWriter, r *http.Request, productId api.ProductId) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var product store.Product
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		product, err = q.GetProduct(r.Context(), store.GetProductParams{TenantID: tc.tenantID, ID: productId})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product_not_found", "no such product")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load product")
		return
	}
	writeJSON(w, http.StatusOK, productToAPI(product))
}

func (s *Server) UpdateProduct(w http.ResponseWriter, r *http.Request, productId api.ProductId) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.UpdateProductRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	var product store.Product
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		current, err := q.GetProduct(r.Context(), store.GetProductParams{TenantID: tc.tenantID, ID: productId})
		if err != nil {
			return err
		}
		// Patch semantics: absent fields keep their current value.
		name := current.Name
		if req.Name != nil && *req.Name != "" {
			name = *req.Name
		}
		baseUom := current.BaseUom
		if req.BaseUom != nil && *req.BaseUom != "" {
			baseUom = *req.BaseUom
		}
		batchTracked := current.IsBatchTracked
		if req.IsBatchTracked != nil {
			batchTracked = *req.IsBatchTracked
		}
		barcode := current.Barcode
		if req.Barcode != nil {
			barcode = pgText(req.Barcode) // empty string clears it
		}
		status := current.Status
		if req.Status != nil {
			status = string(*req.Status)
		}
		product, err = q.UpdateProduct(r.Context(), store.UpdateProductParams{
			TenantID:       tc.tenantID,
			ID:             productId,
			Name:           name,
			BaseUom:        baseUom,
			IsBatchTracked: batchTracked,
			Barcode:        barcode,
			Status:         status,
		})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product_not_found", "no such product")
			return
		}
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "product_exists", "a product with this barcode already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not update product")
		return
	}
	writeJSON(w, http.StatusOK, productToAPI(product))
}

// ---------------------------------------------------------------------------
// Product unit conversions
// ---------------------------------------------------------------------------

func (s *Server) ListProductUoms(w http.ResponseWriter, r *http.Request, productId api.ProductId) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var rows []store.ProductUom
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		if _, err := q.GetProduct(r.Context(), store.GetProductParams{TenantID: tc.tenantID, ID: productId}); err != nil {
			return err
		}
		var e error
		rows, e = q.ListProductUoms(r.Context(), store.ListProductUomsParams{TenantID: tc.tenantID, ProductID: productId})
		return e
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product_not_found", "no such product")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not list unit conversions")
		return
	}
	out := make([]api.ProductUom, 0, len(rows))
	for _, u := range rows {
		out = append(out, productUomToAPI(u))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) CreateProductUom(w http.ResponseWriter, r *http.Request, productId api.ProductId) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.CreateProductUomRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Uom == "" {
		writeError(w, http.StatusUnprocessableEntity, "missing_fields", "uom is required")
		return
	}
	factor, err := decimal.NewFromString(req.FactorToBase)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_factor", "factorToBase must be a decimal number")
		return
	}
	// Validate through the pure domain rule (ToBase rejects non-positive factors)
	// so the same constraint holds here and at the store CHECK.
	if _, err := catalog.ToBase(decimal.NewFromInt(1), factor); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_factor", "factorToBase must be positive")
		return
	}
	factorNum, err := numericFromDecimal(factor)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_factor", "factorToBase must be a decimal number")
		return
	}

	var uom store.ProductUom
	err = s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		if _, err := q.GetProduct(r.Context(), store.GetProductParams{TenantID: tc.tenantID, ID: productId}); err != nil {
			return err
		}
		var e error
		uom, e = q.CreateProductUom(r.Context(), store.CreateProductUomParams{
			TenantID:     tc.tenantID,
			ProductID:    productId,
			Uom:          req.Uom,
			FactorToBase: factorNum,
		})
		return e
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product_not_found", "no such product")
			return
		}
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "uom_exists", "this unit is already defined for the product")
			return
		}
		if isCheckViolation(err) {
			writeError(w, http.StatusUnprocessableEntity, "invalid_factor", "factorToBase must be positive")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create unit conversion")
		return
	}
	writeJSON(w, http.StatusCreated, productUomToAPI(uom))
}

func (s *Server) DeleteProductUom(w http.ResponseWriter, r *http.Request, productId api.ProductId, uomId openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		_, err := q.DeleteProductUom(r.Context(), store.DeleteProductUomParams{
			TenantID:  tc.tenantID,
			ProductID: productId,
			ID:        uomId,
		})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "uom_not_found", "no such unit conversion")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not delete unit conversion")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

func (s *Server) ListProductBatches(w http.ResponseWriter, r *http.Request, productId api.ProductId) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var rows []store.Batch
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		if _, err := q.GetProduct(r.Context(), store.GetProductParams{TenantID: tc.tenantID, ID: productId}); err != nil {
			return err
		}
		var e error
		rows, e = q.ListBatches(r.Context(), store.ListBatchesParams{TenantID: tc.tenantID, ProductID: productId})
		return e
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product_not_found", "no such product")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not list batches")
		return
	}
	out := make([]api.Batch, 0, len(rows))
	for _, b := range rows {
		out = append(out, batchToAPI(b))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) CreateBatch(w http.ResponseWriter, r *http.Request, productId api.ProductId) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.CreateBatchRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.BatchNo == "" {
		writeError(w, http.StatusUnprocessableEntity, "missing_fields", "batchNo is required")
		return
	}

	var batch store.Batch
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		if _, err := q.GetProduct(r.Context(), store.GetProductParams{TenantID: tc.tenantID, ID: productId}); err != nil {
			return err
		}
		var e error
		batch, e = q.CreateBatch(r.Context(), store.CreateBatchParams{
			TenantID:   tc.tenantID,
			ProductID:  productId,
			BatchNo:    req.BatchNo,
			ExpiryDate: pgDate(req.ExpiryDate),
		})
		return e
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "product_not_found", "no such product")
			return
		}
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "batch_exists", "this batch number already exists for the product")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create batch")
		return
	}
	writeJSON(w, http.StatusCreated, batchToAPI(batch))
}

// ---------------------------------------------------------------------------
// Partners
// ---------------------------------------------------------------------------

func (s *Server) ListPartners(w http.ResponseWriter, r *http.Request, params api.ListPartnersParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	statusFilter := pgtype.Text{}
	if params.Status != nil {
		statusFilter = pgtype.Text{String: string(*params.Status), Valid: true}
	}
	onlySupplier := params.Role != nil && *params.Role == api.Supplier
	onlyCustomer := params.Role != nil && *params.Role == api.Customer

	var rows []store.Partner
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.ListPartners(r.Context(), store.ListPartnersParams{
			TenantID:     tc.tenantID,
			Status:       statusFilter,
			OnlySupplier: onlySupplier,
			OnlyCustomer: onlyCustomer,
			Q:            pgTextFrom(params.Q),
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list partners")
		return
	}
	out := make([]api.Partner, 0, len(rows))
	for _, p := range rows {
		out = append(out, partnerToAPI(p))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) CreatePartner(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.CreatePartnerRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "missing_fields", "name is required")
		return
	}
	isSupplier := req.IsSupplier != nil && *req.IsSupplier
	isCustomer := req.IsCustomer != nil && *req.IsCustomer
	if !isSupplier && !isCustomer {
		writeError(w, http.StatusUnprocessableEntity, "no_partner_role", "a partner must be a supplier, a customer, or both")
		return
	}

	var partner store.Partner
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		partner, err = q.CreatePartner(r.Context(), store.CreatePartnerParams{
			TenantID:   tc.tenantID,
			Code:       pgText(req.Code),
			Name:       req.Name,
			IsSupplier: isSupplier,
			IsCustomer: isCustomer,
		})
		return err
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "partner_exists", "a partner with this code already exists")
			return
		}
		if isCheckViolation(err) {
			writeError(w, http.StatusUnprocessableEntity, "no_partner_role", "a partner must be a supplier, a customer, or both")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create partner")
		return
	}
	writeJSON(w, http.StatusCreated, partnerToAPI(partner))
}

func (s *Server) GetPartner(w http.ResponseWriter, r *http.Request, partnerId openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var partner store.Partner
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		partner, err = q.GetPartner(r.Context(), store.GetPartnerParams{TenantID: tc.tenantID, ID: partnerId})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "partner_not_found", "no such partner")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not load partner")
		return
	}
	writeJSON(w, http.StatusOK, partnerToAPI(partner))
}

func (s *Server) UpdatePartner(w http.ResponseWriter, r *http.Request, partnerId openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.UpdatePartnerRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	var partner store.Partner
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		current, err := q.GetPartner(r.Context(), store.GetPartnerParams{TenantID: tc.tenantID, ID: partnerId})
		if err != nil {
			return err
		}
		code := current.Code
		if req.Code != nil {
			code = pgText(req.Code)
		}
		name := current.Name
		if req.Name != nil && *req.Name != "" {
			name = *req.Name
		}
		isSupplier := current.IsSupplier
		if req.IsSupplier != nil {
			isSupplier = *req.IsSupplier
		}
		isCustomer := current.IsCustomer
		if req.IsCustomer != nil {
			isCustomer = *req.IsCustomer
		}
		status := current.Status
		if req.Status != nil {
			status = string(*req.Status)
		}
		partner, err = q.UpdatePartner(r.Context(), store.UpdatePartnerParams{
			TenantID:   tc.tenantID,
			ID:         partnerId,
			Code:       code,
			Name:       name,
			IsSupplier: isSupplier,
			IsCustomer: isCustomer,
			Status:     status,
		})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "partner_not_found", "no such partner")
			return
		}
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "partner_exists", "a partner with this code already exists")
			return
		}
		if isCheckViolation(err) {
			writeError(w, http.StatusUnprocessableEntity, "no_partner_role", "a partner must be a supplier, a customer, or both")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not update partner")
		return
	}
	writeJSON(w, http.StatusOK, partnerToAPI(partner))
}

// ---------------------------------------------------------------------------
// Warehouses
// ---------------------------------------------------------------------------

func (s *Server) ListWarehouses(w http.ResponseWriter, r *http.Request, params api.ListWarehousesParams) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var rows []store.Warehouse
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		rows, err = q.ListWarehouses(r.Context(), store.ListWarehousesParams{
			TenantID: tc.tenantID,
			Q:        pgTextFrom(params.Q),
		})
		return err
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "could not list warehouses")
		return
	}
	out := make([]api.Warehouse, 0, len(rows))
	for _, wh := range rows {
		out = append(out, warehouseToAPI(wh))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) CreateWarehouse(w http.ResponseWriter, r *http.Request) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.WarehouseInput
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Code == "" || req.Name == "" {
		writeError(w, http.StatusUnprocessableEntity, "missing_fields", "code and name are required")
		return
	}

	var wh store.Warehouse
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		var err error
		wh, err = q.CreateWarehouse(r.Context(), store.CreateWarehouseParams{
			TenantID: tc.tenantID,
			Code:     req.Code,
			Name:     req.Name,
		})
		return err
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "warehouse_exists", "a warehouse with this code already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not create warehouse")
		return
	}
	writeJSON(w, http.StatusCreated, warehouseToAPI(wh))
}

func (s *Server) UpdateWarehouse(w http.ResponseWriter, r *http.Request, warehouseId openapi_types.UUID) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return
	}
	var req api.UpdateWarehouseRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	var wh store.Warehouse
	err := s.tenantTx(r.Context(), tc.tenantID, func(q *store.Queries) error {
		current, err := q.GetWarehouse(r.Context(), store.GetWarehouseParams{TenantID: tc.tenantID, ID: warehouseId})
		if err != nil {
			return err
		}
		code := current.Code
		if req.Code != nil && *req.Code != "" {
			code = *req.Code
		}
		name := current.Name
		if req.Name != nil && *req.Name != "" {
			name = *req.Name
		}
		wh, err = q.UpdateWarehouse(r.Context(), store.UpdateWarehouseParams{
			TenantID: tc.tenantID,
			ID:       warehouseId,
			Code:     code,
			Name:     name,
		})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "warehouse_not_found", "no such warehouse")
			return
		}
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "warehouse_exists", "a warehouse with this code already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not update warehouse")
		return
	}
	writeJSON(w, http.StatusOK, warehouseToAPI(wh))
}
