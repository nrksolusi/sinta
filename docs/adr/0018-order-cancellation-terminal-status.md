# Order cancellation is a terminal status with short-close, distinct from reversal

**Status:** Proposed - not yet implemented (see fix-3/fix-4).

Purchase and sales orders gain a `cancelled` status reachable from `draft` or
`posted`; cancelling a partially-fulfilled order short-closes it - the remaining
un-received or un-delivered quantity is closed, while the fulfilled quantity and
its documents stand. Orders move no stock (they are intent-only), so the
reversal machinery built for stock documents - which posts opposite journal
movements, and for orders merely clones a posted twin and flips the original to
`reversed` - is the wrong model for them. A status transition with an explicit
short-close is the honest representation. Cancellation requires a reason and
owner/admin, mirroring reject (ADR-0011, ADR-0015).

## Considered Options

- **Reuse reversal for orders (status quo path)**: a posted order "reverses" by
  cloning a posted twin and flipping to `reversed` - opaque for partial
  fulfillment and confusing (a second posted order appears).
- **Delete only (drafts)**: fine for a never-posted draft (ADR-0013), but no
  answer for a posted order that must be stopped mid-fulfillment.
- **Terminal `cancelled` status + short-close** (chosen).

## Consequences

- PO/SO status domain gains `cancelled` (per-table CHECK extension, the
  mechanism migration `0300` used for `reversed`). Stock documents keep reversal
  and do **not** gain cancel.
- From `draft`: a never-posted draft is deleted (ADR-0013); an order that must be
  recorded as cancelled goes straight to `cancelled`. From `posted`: allowed only
  while not already fully fulfilled; sets `cancelled`, records reason + actor, and
  short-closes the remaining line quantity so fulfillment reads `closed` at
  less-than-ordered (ADR-0016).
- A cancelled order accepts no further receipts/deliveries - the fulfillment
  guard treats its lines as closed.
- Already-posted linked receipts/deliveries are untouched (immutable);
  cancellation stops only the remainder.
- `cancelled` is terminal: no submit/approve/post/reverse from it. Non-order
  documents are unaffected.
