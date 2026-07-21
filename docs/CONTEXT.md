# Sinta

Multi-tenant inventory management for Indonesian SME distributors. One context:
stock and the order documents that move it. Money appears only as document
totals; accounting is outside this context (ADR-0008).

## Language

### Tenancy and identity

**Tenant**:
One legal company (PT/CV) using Sinta. Exactly one company, never a group or a
sub-space.
_Avoid_: organization, workspace, company, client

**User**:
A global person account, one per email, existing independently of any tenant.
_Avoid_: member, account

**Membership**:
The link between a User and a Tenant, carrying that user's Role there. A user
may hold memberships in many tenants.
_Avoid_: staff, assignment

**Role**:
One of the fixed permission levels on a membership: owner, admin, warehouse,
sales, viewer.
_Avoid_: permission, group, access level

**Warehouse scoping**:
An optional restriction of a membership to specific warehouses.

### Catalog

**Product**:
A purchasable or sellable good, identified within a tenant by its SKU.
_Avoid_: item, article, goods

**Base unit**:
The unit a product's stock is counted in. All quantities are stored in base
units.
_Avoid_: default unit, smallest unit

**Unit conversion**:
A named alternative unit with a fixed factor to the base unit (carton = 24 pcs).
_Avoid_: packaging, UOM class

**Batch**:
A lot of a batch-tracked product sharing one batch number and expiry date.
Batch tracking is opt-in per product.
_Avoid_: lot

**Partner**:
A company the tenant trades with - a supplier, a customer, or both.
_Avoid_: vendor, contact, relation

### Stock

**Movement**:
One append-only journal entry that changes stock quantity or cost. Movements
are never edited or deleted; mistakes are corrected by new movements.
_Avoid_: transaction, mutation, stock change

**Journal**:
The ordered, append-only sequence of movements. The sole source of truth for
stock; everything else is derived from it.
_Avoid_: ledger, log, history

**Stock level**:
The derived on-hand quantity and cost for a product in a warehouse (per batch
where tracked). A cache over the journal, never authoritative.
_Avoid_: balance, inventory count

**Effective date**:
The business date a movement counts from, distinct from the moment it was
entered. Backdating means entering a movement with a past effective date.
_Avoid_: transaction date

**Provisional movement**:
An issue booked while stock was below zero, valued at last known cost, awaiting
reconciliation.

**Reconciliation**:
Resolving provisional movements once the missing receipt or adjustment arrives,
by posting a correction entry for the cost difference.
_Avoid_: fixing, rebalancing

**Correction entry**:
A movement that adjusts previously booked cost. The only way history is ever
"changed".
_Avoid_: amendment, edit

**Transfer**:
Stock moved between two warehouses of the same tenant.
_Avoid_: relocation, move

**Adjustment**:
A manual stock change outside the order flows - waste, damage, found stock.
_Avoid_: write-off, correction (that word is reserved for cost)

**Opname**:
A physical count of actual stock against the system, producing adjustments for
the variance. Standard Indonesian trade term.
_Avoid_: stocktake, cycle count, physical inventory

### Documents

**Document**:
A business record (PO, goods receipt, SO, delivery, transfer, adjustment,
opname) with a lifecycle of draft, then posted. Posted documents are immutable.
_Avoid_: form, record, entry

**Posting**:
Finalizing a draft document, which atomically writes its movements to the
journal.
_Avoid_: submitting, finalizing, approving

**Reversal**:
A document that cancels a posted document by posting opposite movements.
Nothing posted is ever deleted.
_Avoid_: void, cancellation, rollback

**Document number**:
The gapless, human-facing number a document receives at posting, rendered
through the tenant's numbering template. Drafts have none.
_Avoid_: reference number, document ID

**Purchase order (PO)**:
Intent to buy from a supplier. Does not move stock.

**Goods receipt**:
Receipt of stock against a purchase order; the moment cost enters the journal.
_Avoid_: GRN, inbound, receiving note

**Sales order (SO)**:
Commitment to sell to a customer. Does not move stock.

**Delivery**:
Issue of stock against a sales order (Indonesian: surat jalan).
_Avoid_: shipment, delivery order

### Costing

**Costing method**:
The tenant-level choice of valuation engine - weighted average or FIFO - set at
onboarding, switchable only at a fiscal year boundary.

**Weighted average**:
Costing where each receipt re-averages the unit cost of stock on hand.
_Avoid_: moving average, MAC

**FIFO layer**:
A cost slice created by one receipt and consumed oldest-first under FIFO
costing.

**FEFO**:
First-expired-first-out - the picking order for batch goods. A warehouse
consumption rule, not a costing method.

**Valuation**:
The monetary value of stock, computed from the journal by the tenant's costing
engine.

**Last known cost**:
The most recent cost for a product in a warehouse, used to value provisional
movements.

**Revaluation**:
The audited recomputation of stock value when a tenant switches costing method
at a fiscal year boundary.
