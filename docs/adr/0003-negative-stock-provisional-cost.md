# Negative stock allowed, valued at last known cost with correction entries

**Status:** Accepted - implemented.

Stock may go below zero. In the field, goods leave the dock before paperwork is
entered and waste factors are a fact of life, so blocking the transaction is a
churn risk. An issue that drives stock negative books at the last known cost and
is flagged `is_provisional`; when the reconciling receipt or adjustment arrives,
the engine posts a `cost_correction` movement for the difference. History is
never rewritten.

## Considered Options

- **Hard disallow**: cleanest ledger, but blocks real warehouse operations.
- **Zero cost until reconciled**: simple rule, but COGS and valuation reports
  are badly wrong until reconciliation, and SMEs reconcile late.
- **Rewrite history on reconciliation**: reports look correct but past report
  runs stop matching and the audit trail weakens.

## Consequences

- A per-tenant reconciliation worklist of provisional movements is a core
  feature, not an afterthought.
- Backdated receipts use the same forward-recompute-and-correct machinery,
  shared with the fiscal-year revaluation (ADR-0002).
