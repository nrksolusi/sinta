# Order fulfillment is server-computed, with tolerance-bounded over-receipt

**Status:** Proposed - not yet implemented (see fix-3/fix-4).

Received and delivered quantities are rolled up server-side per order line and
exposed as a fulfillment state (`open` / `partial` / `closed`); receiving or
delivering against an order line is guarded so cumulative fulfilled quantity
cannot exceed the ordered quantity beyond a tenant-configured tolerance, and a
closed line cannot be received again. Today there is no server rollup or guard -
the client reconstructs received/delivered quantities by joining posted
documents (INC-4), and over-receipt silently clamps to "fully received". We move
both the rollup and the guard to the server, because a quantity invariant
enforced only in the browser is not enforced at all.

## Considered Options

- **Client-side rollup only (status quo)**: cannot enforce a limit, re-joins on
  every screen, and does not scale.
- **Strict block, zero over-receipt**: rejected - suppliers over-ship; a hard
  block forces staff into workarounds that corrupt the data.
- **Tolerance-bounded over-receipt** (chosen): allowed up to a tenant tolerance
  (default 0 = strict), blocked beyond.

## Consequences

- The server computes `receivedQty` / `deliveredQty` per PO/SO line from posted,
  non-reversed linked receipt/delivery lines, and returns them plus a per-line
  fulfillment state and a document-level rollup (e.g. "3/5 received"). This
  removes the client joins in `-order-data.ts` / `-sales-order-data.ts`.
- Posting a goods receipt or delivery validates
  `cumulative_fulfilled + new_qty <= ordered * (1 + tolerance)` per linked line;
  a violation is rejected. A fully-closed line rejects further receipt.
- The guard is evaluated inside the posting transaction; an advisory lock on the
  order line (alongside the existing per-stock-key locks) prevents two concurrent
  receipts from both passing the check.
- Tolerance is a tenant setting (default 0); a per-product override is deferred.
- This is what makes the list `received`/`partial`/`open` tabs (ADR-0019) and the
  dashboard progress real without client recomputation.
- Reversing a receipt/delivery decrements the rollup, since it is computed from
  the live set of posted, non-reversed documents - not a stored counter.
