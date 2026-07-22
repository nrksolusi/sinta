# Money stays as document totals - no accounting ledger

**Status:** Accepted - implemented.

Purchase and sales documents carry monetary totals, but Sinta has no general
ledger, no AR/AP, no payment tracking, and no tax handling (PPN, e-Faktur). The
boundary was drawn deliberately: order flows are required for distributors to
use the product at all, but full order-to-cash drags the domain into Indonesian
tax rules and doubles the schema before validation.

## Consequences

- Stock valuation reports are the accounting-facing output; everything beyond
  them is an export or integration concern (Accurate, Jurnal.id) later.
- Requests to "just add invoicing/payments" are a scope change against this
  ADR and PLAN.md D2, not a feature ticket.
