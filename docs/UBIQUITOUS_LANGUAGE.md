# Ubiquitous Language

Canonical vocabulary for Sinta - multi-tenant inventory management for
Indonesian SME distributors. Companion to `CONTEXT.md` (quick glossary) and
`adr/` (why the model is shaped this way).

## Tenancy and people

| Term                  | Definition                                                                  | Aliases to avoid                 |
| --------------------- | --------------------------------------------------------------------------- | -------------------------------- |
| **Tenant**            | One legal company (PT/CV) subscribed to Sinta                               | Organization, workspace, client  |
| **User**              | A global login identity, one per email, independent of any tenant           | Member, account                  |
| **Membership**        | The link granting a User a Role inside one Tenant                           | Staff, assignment                |
| **Role**              | A fixed permission level on a membership: owner, admin, warehouse, sales, viewer | Permission, group           |
| **Warehouse scoping** | An optional restriction of a membership to specific warehouses              | Branch access                    |
| **Partner**           | A company a tenant trades with, as supplier, customer, or both              | Vendor, contact, client          |

## Catalog

| Term                | Definition                                                         | Aliases to avoid        |
| ------------------- | ------------------------------------------------------------------ | ----------------------- |
| **Product**         | A purchasable or sellable good, identified per tenant by its SKU   | Item, article, goods    |
| **Base unit**       | The unit a product's stock is counted and stored in                | Default unit            |
| **Unit conversion** | A named alternative unit with a fixed factor to base (carton = 24 pcs) | Packaging, UOM class |
| **Batch**           | A lot of a batch-tracked product sharing one batch number and expiry date | Lot               |
| **Warehouse**       | A physical stock location belonging to one tenant (Indonesian: gudang) | Location, branch, site |

## Stock and the journal

| Term                     | Definition                                                                      | Aliases to avoid            |
| ------------------------ | ------------------------------------------------------------------------------- | --------------------------- |
| **Movement**             | One append-only journal entry changing stock quantity or cost                   | Transaction, mutation       |
| **Journal**              | The ordered, append-only sequence of movements; the sole source of truth for stock | Ledger, log, history     |
| **Stock level**          | The derived on-hand quantity and cost per product, warehouse, and batch         | Balance, inventory count    |
| **Effective date**       | The business date a movement counts from, distinct from when it was entered     | Transaction date            |
| **Backdating**           | Entering a movement with a past effective date, triggering forward recomputation | Retro-entry                |
| **Provisional movement** | An issue booked while stock was below zero, valued at last known cost, awaiting reconciliation | Unresolved issue |
| **Reconciliation**       | Resolving provisional movements once the missing receipt or adjustment arrives  | Fixing, rebalancing         |
| **Correction entry**     | A movement adjusting previously booked cost; the only way history ever "changes" | Amendment, edit            |
| **Transfer**             | Stock moved between two warehouses of the same tenant                           | Relocation                  |
| **Adjustment**           | A manual quantity change outside order flows: waste, damage, found stock        | Write-off, correction       |
| **Opname**               | A physical count against system stock, producing adjustments for the variance   | Stocktake, cycle count      |
| **Count sheet**          | An opname's line list, seeded from stock on hand for the chosen warehouse and scope | Checklist, count list   |
| **Blind count**          | An opname mode that hides system quantities from the counter until variance review | Hidden count             |
| **System quantity**      | The on-hand quantity per the journal at counting time; the baseline an opname counts against | Book stock, expected quantity |
| **Counted quantity**     | The physically counted quantity entered on an opname line                       | Actual quantity             |
| **Variance (selisih)**   | The difference between counted and system quantity, becoming the opname's movements at posting | Discrepancy, difference |
| **Stock card**           | The per-product report of movements over time                                   | Stock ledger, item history  |

## Documents

| Term                    | Definition                                                                | Aliases to avoid              |
| ----------------------- | ------------------------------------------------------------------------- | ----------------------------- |
| **Document**            | A business record (PO, goods receipt, SO, delivery, transfer, adjustment, opname) with a draft-then-posted lifecycle | Form, record |
| **Draft**               | A saved but unposted document: freely editable, deletable, moving no stock, holding no document number | Unsaved form, pending |
| **Posting**             | Finalizing a draft document, atomically writing its movements to the journal | Submitting, approving      |
| **Reversal**            | A document cancelling a posted one by posting opposite movements          | Void, rollback, delete        |
| **Purchase order (PO)** | Intent to buy from a supplier; moves no stock                             | Purchase, PO invoice          |
| **Goods receipt**       | Receipt of stock against a PO; the moment cost enters the journal         | GRN, inbound, receiving note  |
| **Sales order (SO)**    | Commitment to sell to a customer; moves no stock                          | Sale, order                   |
| **Delivery**            | Issue of stock against a sales order                                      | Shipment, delivery order, DO  |
| **Fulfillment**         | The degree to which an order's lines are covered by its posted goods receipts or deliveries | Progress, completion |
| **Surat jalan**         | The price-free printout of a posted delivery, with signature blocks for sender, driver, and receiver | Delivery note, packing slip |
| **Berita acara**        | The formal printout of a posted opname, recording counted quantities and variances for sign-off | Opname report, minutes |
| **Document number**     | The gapless human-facing number assigned at posting via the tenant's numbering template; drafts have none | Reference number, document ID |
| **Numbering template**  | A tenant's format for rendering document numbers, editable with effect at year rollover only | Number format, mask |

## Costing

| Term                 | Definition                                                                      | Aliases to avoid    |
| -------------------- | ------------------------------------------------------------------------------- | ------------------- |
| **Costing method**   | The tenant-level valuation choice, weighted average or FIFO, set at onboarding  | Valuation mode      |
| **Weighted average** | Costing where each receipt re-averages the unit cost of stock on hand           | Moving average, MAC |
| **FIFO layer**       | A cost slice created by one receipt and consumed oldest-first under FIFO        | Cost bucket         |
| **FEFO**             | First-expired-first-out picking order for batch goods; a consumption rule, not a costing method | Expiry picking |
| **Valuation**        | The monetary value of stock, computed from the journal by the costing engine    | Stock worth         |
| **Last known cost**  | The most recent cost for a product in a warehouse, used to value provisional movements | Fallback cost |
| **Revaluation**      | The audited recomputation of stock value when a tenant switches costing method at a fiscal year boundary | Re-costing |

## Relationships

- A **User** holds many **Memberships**; each **Membership** belongs to exactly one **Tenant** and may be scoped to specific **Warehouses**
- A **Tenant** owns its **Warehouses**, **Products**, **Partners**, and **Documents**; nothing is shared across tenants
- A **Product** has exactly one **Base unit** and any number of **Unit conversions**; if batch-tracked, its stock exists only as **Batches**
- Posting a **Document** produces one or more **Movements**; every **Movement** traces back to exactly one document line
- A **Stock level** is derived from **Movements** per product, warehouse, and batch - never stored authoritatively
- A **Purchase order** is fulfilled by one or more **Goods receipts**; a **Sales order** is fulfilled by one or more **Deliveries**; **Fulfillment** is derived from those links, never stored
- An **Opname** owns one **Count sheet** seeded from **Stock levels**; at posting, each line's **Variance** becomes movements
- A posted **Delivery** prints as a **Surat jalan**; a posted **Opname** prints as a **Berita acara** - printouts are artifacts of documents, never documents themselves
- A **Provisional movement** is resolved by **Reconciliation**, which posts a **Correction entry**
- A **Tenant** has exactly one **Costing method** at a time; switching it triggers a **Revaluation**

## Example dialogue

> **Dev:** "A delivery just took warehouse B to minus 40 pieces. Do I block the posting?"
>
> **Domain expert:** "No - negative stock is allowed. Book the issue at the **last known cost** and flag those **movements** as **provisional**. The gudang shipped goods whose **goods receipt** hasn't been entered yet; that's normal."
>
> **Dev:** "And when the admin finally enters the receipt, do I re-cost the delivery?"
>
> **Domain expert:** "Never edit the **journal**. **Reconciliation** posts a **correction entry** for the cost difference. The original movement stays exactly as booked - the **stock card** shows both."
>
> **Dev:** "What if the count is still off after that? Say some cartons were damaged."
>
> **Domain expert:** "That's not a correction, that's an **adjustment** - a quantity change. Run an **opname**, count the racks, and post the variance. **Correction** is for money, **adjustment** is for pieces. Don't mix the words."
>
> **Dev:** "One more: this product is batch-tracked. Which batch does the picker take?"
>
> **Domain expert:** "**FEFO** - earliest expiry first. That's a picking rule for the warehouse; it has nothing to do with whether the tenant's **costing method** is FIFO."
>
> **Dev:** "For the **opname** screen: the counter adds products one by one and I compare against stock?"
>
> **Domain expert:** "Backwards. The **count sheet** is seeded from **stock levels** for the gudang - otherwise vanished stock is never counted. In a **blind count** the counter sees no **system quantity**, only enters the **counted quantity**; the **selisih** appears at review, and posting turns it into movements. The signed **berita acara** is the printout of that posted opname, not a separate document."
>
> **Dev:** "Same for shipping? The driver's paper is its own record?"
>
> **Domain expert:** "No - the **delivery** is the document. The **surat jalan** is just its price-free printout with signature blocks. While the delivery is still a **draft** you can edit or delete it freely; once posted, it's immutable and only a **reversal** undoes it."

## Flagged ambiguities

- **"Customer" means two different things.** The SaaS's paying customer is a
  **Tenant**; the company a tenant sells to is a **Partner** (in its customer
  role). In code and docs, never say "customer" for a tenant.
- **"Ledger" is banned.** During planning it drifted between the movement
  journal (storage), the stock card (report), and a general ledger
  (accounting, out of scope per ADR-0008). Use **Journal**, **Stock card**,
  or nothing.
- **"Correction" vs "adjustment".** Both were used loosely for "fixing stock".
  They are disjoint: **Correction entry** changes cost, **Adjustment** changes
  quantity. Negative-stock code becomes unreadable if these blur.
- **"Waste".** Used in conversation as the reason stock goes negative. Model it
  precisely: unrecorded waste discovered at count time is an **Adjustment**
  (via **Opname**); shipping before paperwork is a **Provisional movement**.
  Different causes, different fixes.
- **"v1" vs "pilot".** "v1" is the full committed scope (PLAN.md D2, through
  milestone M3); the "pilot" is milestone M1 with average costing only. Saying
  "v1" when meaning M1 understates what remains.
- **"Organization" / "workspace".** Terms from the founder's previous project
  whose hierarchy was rejected (ADR-0005). A tenant is flat; these words must
  not reappear.
- **"Surat jalan" is the printout, not the document.** Earlier notes glossed
  Delivery as "Indonesian: surat jalan". The **Delivery** is the posted
  document; the **Surat jalan** is its price-free printable artifact. UI labels
  the document Pengiriman and the printout Surat Jalan.
- **"Report" is overloaded.** The Laporan screens (**Stock card**, stock on
  hand, valuation) are queries over the journal; the **Berita acara** and
  **Surat jalan** are printable artifacts of one posted document. During UX
  planning "opname creates a report" meant the latter. Say "report" only for
  Laporan screens; say "printout" or the artifact's name otherwise.
- **"Draft" is a server-side record.** A **Draft** exists in the database and
  survives navigation; it is not unsaved client form state. A "new" screen that
  has never been saved holds no draft.
