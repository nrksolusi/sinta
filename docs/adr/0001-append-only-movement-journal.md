# Append-only stock movement journal as the sole source of truth

**Status:** Accepted - implemented.

Stock on hand, stock cards, and all valuation are computed from an append-only
`stock_movements` journal; there is no authoritative "quantity" column. We chose
this over a mutable stock-balance table because the product must support two
costing engines, backdated receipts, negative-stock reconciliation, and a
fiscal-year revaluation - all of which are recomputations over ordered history
and are impossible to do correctly against mutable balances.

## Consequences

- Journal rows are never updated or deleted (enforced by trigger). All
  corrections - reconciliation, backdating fallout, revaluation - are new
  entries (`cost_correction`, `revaluation`).
- `stock_levels` exists only as a transactionally maintained read cache and must
  always be rebuildable from the journal.
- The batch/expiry dimension lives on the journal from day one (nullable
  `batch_id`, opt-in per product), because retrofitting batches into a live
  ledger was judged the worst migration in this domain.
