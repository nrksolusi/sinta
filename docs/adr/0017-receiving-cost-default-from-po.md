# Receiving cost defaults from the purchase order, overridable only with permission

A goods receipt line's unit cost defaults from the linked purchase order line's
agreed price; changing it at receipt is restricted to owner/admin and the
override is recorded. Today the receipt line carries an independent `unit_cost`
defaulting to `0`, unrelated to the PO price, and any writer role can set it -
and since receipt cost is the authoritative input to weighted-average costing
(ADR-0002), an unconstrained free-text cost at the dock is a silent valuation
risk. Defaulting from the PO makes the common case confirm-not-type (ADR-0011)
while still letting a genuine landed-cost difference be captured deliberately.

## Considered Options

- **Lock cost to the PO price (no override)**: simplest and matches the first
  instinct, but cannot capture a real landed-cost or price change at receipt
  without a later correction entry.
- **Free cost, any role (status quo)**: flexible but unguarded; a mis-keyed cost
  quietly corrupts valuation.
- **Default from PO, permissioned override, recorded** (chosen).

## Consequences

- The receipt line `unit_cost` is pre-filled from the linked PO line's
  `unit_cost` (a smart default per ADR-0011), and stays editable.
- Editing the cost away from the PO default requires owner/admin; other writer
  roles see it read-only. The override (old -> new value, actor) is recorded for
  audit.
- A receipt not linked to a PO has no PO default; the cost must be entered by an
  owner/admin, or defaulted from last known cost (ADR-0003) - decided at
  implementation.
- The PO line price remains a separate reference field; costing keeps consuming
  the receipt cost, never the PO price. This ADR does not change the costing
  engine (ADR-0002), only the authority and default for the cost that feeds it.
