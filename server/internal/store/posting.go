package store

import (
	"context"
	"fmt"
	"sort"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/nrksolusi/sinta/internal/domain/costing"
	"github.com/nrksolusi/sinta/internal/domain/posting"
	"github.com/nrksolusi/sinta/internal/domain/stock"
)

// Poster is the store-side implementation of posting.Poster (Track B). It
// finalizes a draft document into the append-only journal in one transaction:
// it takes a per-key Postgres advisory lock, appends the document's movements
// with per-key seq, re-folds each affected key through the costing engine to
// refresh stock_levels, and assigns the gapless document number (ADR-0010).
//
// It re-folds the whole journal per key rather than incrementally adjusting the
// cache, so stock_levels is always a faithful reduction of the journal and can
// never drift from the source of truth (ADR-0001). At M1 pilot scale this is
// well within budget.
type Poster struct {
	pool    *pgxpool.Pool
	queries *Queries
	engine  costing.Engine
}

// NewPoster builds a Poster over a connection pool and a costing engine (the
// weighted-average engine in M1). The pool is used to open the posting
// transaction; the tenant GUC is set inside it so RLS applies (ADR-0004).
func NewPoster(pool *pgxpool.Pool, engine costing.Engine) *Poster {
	return &Poster{pool: pool, queries: New(pool), engine: engine}
}

// Post implements posting.Poster.
func (p *Poster) Post(ctx context.Context, req posting.Request) (posting.Result, error) {
	if len(req.Movements) == 0 {
		return posting.Result{}, fmt.Errorf("posting: request has no movements")
	}

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return posting.Result{}, err
	}
	defer tx.Rollback(ctx)

	// RLS second line of defense: scope the transaction to the tenant (ADR-0004).
	if _, err := tx.Exec(ctx, "SELECT set_config('app.tenant_id', $1, true)", req.TenantID.String()); err != nil {
		return posting.Result{}, err
	}
	q := p.queries.WithTx(tx)

	// Group the request's movements by stock key, preserving input order within
	// a key (that order becomes the per-key seq order for this posting).
	groups := groupByKey(req.Movements)

	// Acquire every key's advisory lock up front, in a deterministic key order,
	// so concurrent postings that share keys serialize and can never deadlock by
	// grabbing the same locks in opposite orders (PLAN.md section 3).
	for _, key := range sortedKeys(groups) {
		if err := q.LockStockKey(ctx, LockStockKeyParams{
			TenantID:    req.TenantID.String(),
			ProductID:   key.ProductID.String(),
			WarehouseID: key.WarehouseID.String(),
		}); err != nil {
			return posting.Result{}, fmt.Errorf("posting: lock key %v: %w", key, err)
		}
	}

	for _, key := range sortedKeys(groups) {
		if err := p.postKey(ctx, q, req, key, groups[key]); err != nil {
			return posting.Result{}, err
		}
	}

	// Assign the gapless document number last, so a costing failure never burns a
	// number (the counter row is only advanced on a committing transaction).
	seq, err := q.NextDocumentNumber(ctx, NextDocumentNumberParams{
		TenantID: req.TenantID,
		DocType:  req.DocType,
		Year:     int32(req.Year),
	})
	if err != nil {
		return posting.Result{}, fmt.Errorf("posting: assign document number: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return posting.Result{}, err
	}
	return posting.Result{DocNumber: renderDocNumber(req.DocType, req.Year, seq)}, nil
}

// postKey appends one key's new movements and refreshes its stock level. It
// assigns per-key seq (max existing + 1, incrementing), inserts each movement,
// then re-folds the full ordered journal for the key through the costing engine
// and upserts the resulting on-hand quantity and average cost.
func (p *Poster) postKey(ctx context.Context, q *Queries, req posting.Request, key stock.Key, movements []stock.Movement) error {
	batch := optionalUUID(key.BatchID)

	maxSeq, err := q.MaxMovementSeq(ctx, MaxMovementSeqParams{
		TenantID:    req.TenantID,
		ProductID:   key.ProductID,
		WarehouseID: key.WarehouseID,
		BatchID:     batch,
	})
	if err != nil {
		return fmt.Errorf("posting: max seq for key %v: %w", key, err)
	}

	for i, m := range movements {
		qtyBase, err := Numeric(m.Qty)
		if err != nil {
			return err
		}
		unitCost, err := Numeric(m.UnitCost)
		if err != nil {
			return err
		}
		if _, err := q.InsertMovement(ctx, InsertMovementParams{
			ID:            movementID(m),
			TenantID:      req.TenantID,
			ProductID:     key.ProductID,
			WarehouseID:   key.WarehouseID,
			BatchID:       batch,
			QtyBase:       qtyBase,
			UnitCost:      unitCost,
			MovementType:  string(m.Type),
			DocType:       req.DocType,
			DocID:         req.DocID,
			DocLineID:     optionalUUID(m.DocLineID),
			EffectiveAt:   pgtype.Timestamptz{Time: m.EffectiveAt, Valid: true},
			Seq:           maxSeq + int64(i) + 1,
			IsProvisional: m.Provisional,
			CreatedBy:     m.CreatedBy,
		}); err != nil {
			return fmt.Errorf("posting: insert movement for key %v: %w", key, err)
		}
	}

	// Re-fold the whole journal for this key to derive the fresh level. Reading
	// after the inserts (same transaction) includes the movements just appended.
	rows, err := q.KeyMovements(ctx, KeyMovementsParams{
		TenantID:    req.TenantID,
		ProductID:   key.ProductID,
		WarehouseID: key.WarehouseID,
		BatchID:     batch,
	})
	if err != nil {
		return fmt.Errorf("posting: read journal for key %v: %w", key, err)
	}

	ordered := make([]stock.Movement, 0, len(rows))
	for _, r := range rows {
		qty, err := Decimal(r.QtyBase)
		if err != nil {
			return err
		}
		cost, err := Decimal(r.UnitCost)
		if err != nil {
			return err
		}
		ordered = append(ordered, stock.Movement{
			ID:          r.ID,
			Key:         key,
			Qty:         qty,
			UnitCost:    cost,
			Type:        stock.MovementType(r.MovementType),
			EffectiveAt: r.EffectiveAt.Time,
			Seq:         r.Seq,
			Provisional: r.IsProvisional,
		})
	}

	valuations, err := p.engine.Cost(ordered)
	if err != nil {
		return fmt.Errorf("posting: cost key %v: %w", key, err)
	}

	// stock_levels stores the running average, which is value/qty from the final
	// valuation - not the last movement's booked UnitCost (for a receipt that is
	// the entering cost, not the resulting average).
	qtyOnHand, avgCost := decimalZero, decimalZero
	if n := len(valuations); n > 0 {
		final := valuations[n-1]
		qtyOnHand = final.QtyOnHand
		if !final.QtyOnHand.IsZero() {
			avgCost = final.ValueOnHand.DivRound(final.QtyOnHand, avgCostScale)
		}
	}

	qtyNum, err := Numeric(qtyOnHand)
	if err != nil {
		return err
	}
	avgNum, err := Numeric(avgCost)
	if err != nil {
		return err
	}
	if err := q.UpsertStockLevel(ctx, UpsertStockLevelParams{
		TenantID:    req.TenantID,
		ProductID:   key.ProductID,
		WarehouseID: key.WarehouseID,
		BatchID:     batch,
		QtyOnHand:   qtyNum,
		AvgCost:     avgNum,
	}); err != nil {
		return fmt.Errorf("posting: upsert level for key %v: %w", key, err)
	}
	return nil
}

// groupByKey buckets movements by stock key, preserving input order per key.
func groupByKey(movements []stock.Movement) map[stock.Key][]stock.Movement {
	groups := make(map[stock.Key][]stock.Movement)
	for _, m := range movements {
		groups[m.Key] = append(groups[m.Key], m)
	}
	return groups
}

// sortedKeys returns the map's keys in a deterministic order (by product, then
// warehouse, then batch UUID) so advisory locks are always taken in the same
// order across concurrent postings, avoiding deadlock.
func sortedKeys(groups map[stock.Key][]stock.Movement) []stock.Key {
	keys := make([]stock.Key, 0, len(groups))
	for k := range groups {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		a, b := keys[i], keys[j]
		if c := a.ProductID.String(); c != b.ProductID.String() {
			return c < b.ProductID.String()
		}
		if c := a.WarehouseID.String(); c != b.WarehouseID.String() {
			return c < b.WarehouseID.String()
		}
		return a.BatchID.String() < b.BatchID.String()
	})
	return keys
}

// renderDocNumber applies the default M1 template {TYPE}-{YYYY}-{NNNNN}
// (ADR-0010). The type is upper-cased; the sequence is zero-padded to five
// digits and grows past five for very high counts.
func renderDocNumber(docType string, year int, seq int64) string {
	return fmt.Sprintf("%s-%04d-%05d", docTypeCode(docType), year, seq)
}

// optionalUUID maps the zero UUID (meaning "absent") to a NULL pgtype.UUID and
// any other value to a set one. The journal and level tables use NULL batch_id
// for non-batch stock and NULL doc_line_id for document-level movements.
func optionalUUID(id uuid.UUID) pgtype.UUID {
	if id == uuid.Nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID{Bytes: id, Valid: true}
}

// movementID keeps a caller-supplied movement ID when present, otherwise mints
// a fresh UUIDv7 (ADR-0009). The database also defaults to uuidv7(), but
// assigning here keeps the ID stable if the caller wants to reference it.
func movementID(m stock.Movement) uuid.UUID {
	if m.ID == uuid.Nil {
		id, err := uuid.NewV7()
		if err != nil {
			return uuid.New()
		}
		return id
	}
	return m.ID
}

var _ posting.Poster = (*Poster)(nil)
