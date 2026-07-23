package httpserver

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/shopspring/decimal"

	"github.com/nrksolusi/sinta/internal/api"
	"github.com/nrksolusi/sinta/internal/store"
)

// errValidation is a store-callback error that maps to a 422; handlers detect it
// via handleWriteErr so line-level validation failures surface as the right code
// even when they happen deep inside a tenant transaction callback.
type errValidation struct{ msg string }

func (e errValidation) Error() string { return e.msg }

// decimalOrZero parses an optional decimal string, defaulting to zero.
func decimalOrZero(s *string) decimal.Decimal {
	if s == nil || *s == "" {
		return decimal.Zero
	}
	d, err := decimal.NewFromString(*s)
	if err != nil {
		return decimal.Zero
	}
	return d
}

// pgTextOf wraps a non-empty string in a valid pgtype.Text.
func pgTextOf(s string) pgtype.Text {
	return pgtype.Text{String: s, Valid: true}
}

// handleWriteErr maps a tenant-transaction error to an HTTP response. It
// distinguishes validation errors (422) from not-found (404) and generic
// failures (500). Returns true when it wrote a response.
func handleWriteErr(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	var ve errValidation
	if errors.As(err, &ve) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_line", ve.msg)
		return true
	}
	var or errOverReceipt
	if errors.As(err, &or) {
		writeError(w, http.StatusUnprocessableEntity, "over_receipt", or.msg)
		return true
	}
	var od errOverDelivery
	if errors.As(err, &od) {
		writeError(w, http.StatusUnprocessableEntity, "over_delivery", od.msg)
		return true
	}
	return writeStoreError(w, err)
}

// Document type tokens. These are the DocType carried on every movement and the
// key into the gapless-number counter (ADR-0010); the values match the store's
// docTypeCode switch so the rendered number uses the right prefix.
const (
	docTypePurchaseOrder   = "purchase_order"
	docTypeGoodsReceipt    = "goods_receipt"
	docTypeSalesOrder      = "sales_order"
	docTypeDelivery        = "delivery"
	docTypeStockTransfer   = "stock_transfer"
	docTypeStockAdjustment = "stock_adjustment"
	docTypeStockOpname     = "stock_opname"
)

// canWriteDocuments reports whether a role may create, edit, or post documents.
// Warehouse and sales staff run the order flows; viewers are read-only (D10).
func (tc tenantCtx) canWriteDocuments() bool {
	switch tc.role {
	case "owner", "admin", "warehouse", "sales":
		return true
	}
	return false
}

// requireDocumentWriter resolves the tenant context and enforces write access.
func (s *Server) requireDocumentWriter(w http.ResponseWriter, r *http.Request) (tenantCtx, bool) {
	tc, ok := s.requireTenant(w, r)
	if !ok {
		return tenantCtx{}, false
	}
	if !tc.canWriteDocuments() {
		writeError(w, http.StatusForbidden, "read_only", "your role cannot change documents")
		return tenantCtx{}, false
	}
	return tc, true
}

// parseDecimal converts a wire DecimalString to a domain decimal, reporting a
// validation error to the caller on a malformed value.
func parseDecimal(s string) (decimal.Decimal, error) {
	return decimal.NewFromString(s)
}

// dateToPg converts an OpenAPI date to a pgtype.Date.
func dateToPg(d openapi_types.Date) pgtype.Date {
	return pgtype.Date{Time: d.Time, Valid: true}
}

// pgToDate converts a stored pgtype.Date back to the wire date type.
func pgToDate(d pgtype.Date) openapi_types.Date {
	return openapi_types.Date{Time: d.Time}
}

// numericToString renders a stored numeric as its canonical decimal string, the
// wire representation for quantities and money (never float).
func numericToString(n pgtype.Numeric) string {
	d, err := store.Decimal(n)
	if err != nil {
		return "0"
	}
	return d.String()
}

// optBatch maps an optional wire batch UUID to the pgtype.UUID the store wants,
// and to the stock.Key batch (zero UUID means "no batch").
func optBatch(id *openapi_types.UUID) (pgtype.UUID, uuid.UUID) {
	if id == nil {
		return pgtype.UUID{}, uuid.Nil
	}
	return pgtype.UUID{Bytes: *id, Valid: true}, *id
}

// optUUID maps an optional wire UUID to a pgtype.UUID.
func optUUID(id *openapi_types.UUID) pgtype.UUID {
	if id == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: *id, Valid: true}
}

// pgUUIDPtr maps a stored optional UUID back to a wire pointer (nil when unset).
func pgUUIDPtr(u pgtype.UUID) *openapi_types.UUID {
	if !u.Valid {
		return nil
	}
	id := uuid.UUID(u.Bytes)
	return &id
}

// textPtr maps a stored optional doc_number to a wire pointer.
func textPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	v := t.String
	return &v
}

// derefNotes reads an optional notes field, defaulting to empty.
func derefNotes(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// Document lifecycle status values, kept as named constants so the posting and
// edit guards read uniformly across types. The 'reversed' status is written by
// the store's Mark*Reversed queries, so it has no constant here.
const (
	statusDraft  = "draft"
	statusPosted = "posted"
)

// docActors carries the actor data loaded alongside a document header.
type docActors struct {
	createdBy api.DocumentActor
	postedBy  *api.DocumentActor
}

// loadDocActors fetches the actors for a document's created_by and optional
// posted_by UUIDs. Callers use it inside a tenantTx callback.
func loadDocActors(ctx context.Context, q *store.Queries, createdByID uuid.UUID, postedByPg pgtype.UUID) (docActors, error) {
	cb, err := q.GetUserByID(ctx, createdByID)
	if err != nil {
		return docActors{}, err
	}
	a := docActors{createdBy: api.DocumentActor{Id: cb.ID, DisplayName: cb.Name}}
	if postedByPg.Valid {
		pb, err := q.GetUserByID(ctx, uuid.UUID(postedByPg.Bytes))
		if err != nil {
			return docActors{}, err
		}
		actor := api.DocumentActor{Id: pb.ID, DisplayName: pb.Name}
		a.postedBy = &actor
	}
	return a, nil
}

// pgTimestamp converts a stored timestamptz to a time.Time (zero if not valid).
func pgTimestamp(t pgtype.Timestamptz) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return t.Time
}

// pgTimestampPtr converts an optional stored timestamptz to a *time.Time.
func pgTimestampPtr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

// userID converts a pgtype.UUID to a plain uuid.UUID for the posted_by param.
func toPostedByParam(userID uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: userID, Valid: true}
}

// effectiveAt builds the movement business date from a document date. Documents
// carry a day-grained date; movements need a timestamptz, so we anchor at the
// start of that day in UTC (D7 backdating is by effective date, not clock time).
func effectiveAt(d pgtype.Date) time.Time {
	return time.Date(d.Time.Year(), d.Time.Month(), d.Time.Day(), 0, 0, 0, 0, time.UTC)
}

// numericFromAny decodes the interface{} that sqlc returns for aggregate
// expressions (COALESCE, SUM) where sqlc cannot infer the return type. pgx v5
// scans numeric columns into pgtype.Numeric; nil means SQL NULL (decoded as 0).
func numericFromAny(v interface{}) (decimal.Decimal, error) {
	if v == nil {
		return decimal.Zero, nil
	}
	n, ok := v.(pgtype.Numeric)
	if !ok {
		return decimal.Zero, nil
	}
	return store.Decimal(n)
}

// errOverReceipt is returned by the over-receipt guard when a goods receipt
// would exceed the ordered qty beyond the tenant tolerance (ADR-0016).
type errOverReceipt struct{ msg string }

func (e errOverReceipt) Error() string { return e.msg }

// errOverDelivery is the equivalent guard for sales order deliveries.
type errOverDelivery struct{ msg string }

func (e errOverDelivery) Error() string { return e.msg }

// cursorPayload is the JSON body of a keyset cursor.
type cursorPayload struct {
	Ts string `json:"ts"`
	ID string `json:"id"`
}

// encodeCursor encodes a (created_at, id) pair as an opaque base64url string.
func encodeCursor(ts pgtype.Timestamptz, id uuid.UUID) string {
	b, _ := json.Marshal(cursorPayload{
		Ts: ts.Time.UTC().Format(time.RFC3339Nano),
		ID: id.String(),
	})
	return base64.RawURLEncoding.EncodeToString(b)
}

// decodeCursor decodes the opaque cursor back into pgtype values for the SQL keyset condition.
func decodeCursor(s string) (pgtype.Timestamptz, pgtype.UUID, error) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, err
	}
	var p cursorPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, err
	}
	t, err := time.Parse(time.RFC3339Nano, p.Ts)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, err
	}
	id, err := uuid.Parse(p.ID)
	if err != nil {
		return pgtype.Timestamptz{}, pgtype.UUID{}, err
	}
	return pgtype.Timestamptz{Time: t, Valid: true}, pgtype.UUID{Bytes: id, Valid: true}, nil
}

// docListFilter holds the resolved filter + cursor + limit for any document list query.
type docListFilter struct {
	FilterStatus      pgtype.Text
	FilterWarehouseID pgtype.UUID
	FilterDateFrom    pgtype.Date
	FilterDateTo      pgtype.Date
	FilterQ           pgtype.Text
	CursorTs          pgtype.Timestamptz
	CursorID          pgtype.UUID
	PageLimit         int32
}

// resolveDocListFilter converts the generated API params into the docListFilter the SQL queries use.
func resolveDocListFilter(
	status *string,
	warehouseID *openapi_types.UUID,
	dateFrom, dateTo *openapi_types.Date,
	q, cursor *string,
	limit *int,
) (docListFilter, error) {
	f := docListFilter{PageLimit: 50}
	if limit != nil && *limit > 0 {
		if *limit > 200 {
			f.PageLimit = 200
		} else {
			f.PageLimit = int32(*limit)
		}
	}
	if status != nil {
		f.FilterStatus = pgtype.Text{String: *status, Valid: true}
	}
	if warehouseID != nil {
		f.FilterWarehouseID = pgtype.UUID{Bytes: *warehouseID, Valid: true}
	}
	if dateFrom != nil {
		f.FilterDateFrom = pgtype.Date{Time: dateFrom.Time, Valid: true}
	}
	if dateTo != nil {
		f.FilterDateTo = pgtype.Date{Time: dateTo.Time, Valid: true}
	}
	if q != nil && *q != "" {
		f.FilterQ = pgtype.Text{String: *q, Valid: true}
	}
	if cursor != nil && *cursor != "" {
		ts, id, err := decodeCursor(*cursor)
		if err != nil {
			return docListFilter{}, err
		}
		f.CursorTs = ts
		f.CursorID = id
	}
	return f, nil
}

// nextCursorIfMore returns a cursor string for the next page when rows > limit, and
// trims the slice to limit. The cursor encodes the last row's created_at and id.
// rows must be sorted created_at DESC, id DESC.
func nextCursorIfMore[T any](rows []T, limit int32, ts func(T) pgtype.Timestamptz, id func(T) uuid.UUID) ([]T, *string) {
	if int32(len(rows)) <= limit {
		return rows, nil
	}
	rows = rows[:limit]
	last := rows[len(rows)-1]
	c := encodeCursor(ts(last), id(last))
	return rows, &c
}

// pgTextFrom converts an optional string pointer to pgtype.Text.
func pgTextFrom(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{}
	}
	return pgtype.Text{String: *s, Valid: true}
}

// writeStoreError maps common store errors to HTTP responses. Returns true when
// it wrote a response.
func writeStoreError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "not_found", "no such document")
		return true
	}
	writeError(w, http.StatusInternalServerError, "internal", "document operation failed")
	return true
}
