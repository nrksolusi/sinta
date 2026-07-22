# Tenant configurability catalog

> **Status: proposed - not implemented.** A reference catalog, not a commitment.
> No `tenant_settings` table or scoped-policy mechanism exists yet; the M2
> unification ADR and M3 mechanism ADR are proposed only. Nothing is committed.

An enumeration of everything a customer might want to configure rather than
accept as a baked-in default - the input to a future granular-configuration
decision (targeted M3, per founder note). It exists because a bigger company
needs granularity not only in permissions but in workflow, behaviour, and naming.
Costing method (WAC/FIFO), document-number pattern, and approval workflow are
three instances of a much larger surface; this lists them all so the granularity
of each becomes a deliberate decision, not an accident of where a column happened
to land.

This is a catalog, not a commitment. Nothing here reopens an ADR-locked
invariant (see "Deliberately fixed" at the end).

## Two things to decide

1. **Per axis: how granular?** For each setting, at what scope can a bigger
   company set it? The scope axes:

   | Axis | In the model today? |
   |------|---------------------|
   | Tenant (whole company) | yes (`tenants` columns) |
   | Legal entity (multi-entity, one operation) | no - D8 makes tenant = one legal company |
   | Warehouse / site | warehouses exist; no per-warehouse settings |
   | Document type | no |
   | Product / category | product flags exist; no category |
   | Partner (customer/supplier) | partners exist; no per-partner policy |
   | Role | fixed 5-role set (D10) |
   | User | membership only |
   | Batch / ownership | batch flag; ownership dimension not modeled (WMS) |

2. **The mechanism (the real M3 ADR).** Today config = a few columns on `tenants`
   + CHECK constraints + hardcoded Go constants. Granularity at more than the
   tenant scope needs a general **scoped policy/settings store** with a
   resolution order (e.g. product > doc-type > warehouse > tenant > system
   default). Deciding "scattered typed columns vs a general settings system with
   scope resolution" is itself the load-bearing M3 decision; everything below is
   the requirement set that decision must serve.

## Legend

- **Current**: `column` (real tenant setting) · `default` (hardcoded, no setting)
  · `proposed` (in an ADR, unbuilt) · `unmodeled`.
- **Tier**: `built` · `M2` (tenant-level setting) · `M3` (needs the scoped
  system) · `WMS` (bigger-company, tied to the WMS discovery) · `fixed`.

---

## A. Costing & valuation

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Costing method | WAC vs FIFO | `column` (tenant) | tenant; maybe per-warehouse or per-category at scale | built / M3 |
| Method switch cadence | when a switch is allowed | `default` fiscal boundary (D4) | tenant | M3 |
| Negative-stock policy | allow issue below zero | `default` allowed, provisional (D6/ADR-0003) | tenant, maybe per-warehouse/product | M2 |
| Cost precision / rounding | decimal handling | `default` | tenant | M3 |
| Revaluation triggers | backdating / boundary recompute | `default` (D7) | tenant | M3 |

## B. Document numbering & naming

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Number template | rendered doc-number format | `proposed` (ADR-0010) | per doc type; per warehouse/entity prefix | M2 |
| Reset cadence | yearly / monthly / never | `default` yearly (ADR-0010) | per doc type | M3 |
| Sequence scope | shared vs per-warehouse counters | `default` per tenant+type+year | tenant / warehouse | M3 |
| Gapless enforcement | strict gapless vs loose | `default` gapless (ADR-0010) | tenant | fixed-ish |
| Product naming template | generated SKU name/description | `unmodeled` (WMS F10) | tenant | WMS |
| SKU code format | internal code pattern, required fields | `unmodeled` | tenant | WMS |
| Duplicate-detection rules | EAN/name similarity at create | `unmodeled` (WMS F11) | tenant | WMS |

## C. Approval & workflow

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Approval gate on/off | require approval before post | `proposed` per doc type (ADR-0015) | per doc type (chosen) | M2 |
| Approver mapping | who approves | `proposed` owner/admin (ADR-0015) | per doc type / warehouse | M2 / M3 |
| Value-tiered thresholds | approval by amount band | `unmodeled` (WMS 2.8) | per doc type / reason | WMS |
| Multi-level chains | >1 approval step | `unmodeled` | per doc type | WMS |
| Separation of duties | no self-approval, counter≠adjuster | `default` self-approval allowed (ADR-0015) | tenant / role | M3 / WMS |
| Reason-code requirement | mandatory structured reasons | partial (adjustments) | per doc type | M2 |
| Cancellation policy | who, reason, from which states | `proposed` (ADR-0018) | per doc type | M2 |
| Reversal policy | who, reason, window | `default` | per doc type | M3 |
| Backdating window | how far back effective dates go | `default` open (D7) | tenant | M2 |
| Period locks / cutoff | freeze a closed period | `unmodeled` (WMS finance) | tenant | M3 |
| Draft-delete authority | who can delete a draft | `proposed` (ADR-0013) | role | M2 |

## D. Permissions & roles

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Role set | available roles | `default` fixed 5 (D10/ADR-0005) | custom roles | M3 / WMS |
| Warehouse scoping | membership limited to sites | modeled (`membership_warehouses`) | per membership | built |
| Field-level walls | qty roles ≠ valuation visibility | `unmodeled` (WMS 2.12) | role | WMS |
| Time-bounded grants | temporary access | `unmodeled` (WMS F94) | membership | WMS |
| Device management | which device did what | `unmodeled` (WMS F104) | device | WMS |

## E. Stock & fulfillment behaviour

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Over-receipt tolerance | allowed over-receipt % | `proposed` (ADR-0016) | tenant; per product at scale | M2 / M3 |
| Over-delivery policy | allow shipping over order | `default` | tenant | M3 |
| Receiving cost authority | who edits receipt cost | `proposed` (ADR-0017) | role | M2 |
| FEFO enforcement | enforce vs suggest; override rules | `default` suggest (D5) | per product / tenant | WMS |
| Allocation / reservation | hard allocation, reservation states | `unmodeled` (WMS) | tenant | WMS |
| Ownership allocation order | consume consigned before own | `unmodeled` (WMS 2.3) | tenant / partner | WMS |
| Per-customer shelf-life | min remaining shelf life at dock | `unmodeled` (WMS 2.10) | per partner | WMS |

## F. Catalog / product policy

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Tracking depth | none / batch / batch+expiry / serial | partial (`is_batch_tracked`) | per product (D5/F20) | M2 / WMS |
| UoM conversions | base unit + factors | modeled (`product_uoms`) | per product | built |
| Versioned packaging | carton 48→40 over time | `unmodeled` (WMS F15) | per product, dated | WMS |
| Barcode multiplicity | multiple codes per product/level | partial (`barcode`) | per product | WMS |
| SKU lifecycle states | draft/active/phase-out/discontinued | `default` status only | per product | WMS |

## G. Fiscal, period, locale

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Fiscal year start | month | `column` (tenant) | tenant | built |
| UI language | id / en | `default` baseLocale id | per user (no switcher yet) | M2 |
| Timezone | business-date boundary | `default` | tenant | M3 |
| Region number/currency/date | id-ID / IDR | `fixed` (CLAUDE.md) | - | fixed |

## H. Partners, entities, ownership (bigger-company)

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Multi-entity | two legal entities, one operation | `unmodeled` (D8 flat) | entity within tenant | WMS |
| Consignment | in/out ownership tracking | `unmodeled` (WMS 2.3) | per partner | WMS |
| Credit terms | per-customer limits | `unmodeled` | per partner | WMS |

## I. Notifications & thresholds

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Min / reorder levels | replenishment triggers | `unmodeled` (WMS 2.11) | per product / warehouse | WMS |
| Expiry radar bands | 30/60/90-day at-risk | `unmodeled` (WMS 2.15) | tenant | WMS |
| Dead-stock threshold | >180 days | `unmodeled` | tenant | WMS |

## J. Integration & export

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Export formats | Excel/CSV round-trip | `deferred` (fix-2 A) | tenant | M2 |
| ATP feed | real-time availability API | `unmodeled` (WMS 2.12) | tenant | WMS |
| Finance export contents | GRNI, in-transit, valuation | `unmodeled` (WMS 2.12) | tenant | WMS |
| PO import format | CSV vs API | `unmodeled` | tenant | WMS |

## K. Billing & activation

| Setting | Controls | Current | Granularity wanted | Tier |
|---|---|---|---|---|
| Activation | active flag, soft-cap | `column` + `proposed` (ADR-0012) | tenant | built |

---

## Deliberately fixed - NOT configurable

Granularity must not reopen these ADR-locked invariants:

- Append-only journal; corrections are new entries (ADR-0001, ADR-0003).
- Quantities stored in base units, exact `numeric`, never floats or cartons
  (PLAN §6). Display unit is configurable; storage is not.
- `tenant_id` + RLS on every tenant table (ADR-0004).
- UUIDv7 primary keys (ADR-0009).
- Posted documents immutable; draft is the sole deletable state (ADR-0013).
- Region number/currency/date = id-ID / IDR (CLAUDE.md); only UI *language* and
  display *units* vary.
- Banned vocabulary and glossary terms (CONTEXT.md) - tenant label overrides are
  out; the ubiquitous language is fixed.

## Suggested phasing

- **M2 (tenant-scope settings, cheap wins):** the items already `proposed` in
  ADRs collapse into a first `tenant_settings` surface - approval per doc type,
  numbering template, over-receipt tolerance, receiving-cost authority,
  reason-code requirements, backdating window, negative-stock toggle, export
  formats, UI-language switch. These are all tenant-scope; a typed settings table
  (or a few columns) suffices - no scope-resolution engine yet.
- **M3 (the scoped policy system):** when granularity must go below tenant
  (per-warehouse numbering, per-category costing, separation-of-duties, custom
  roles, period locks). This is where the mechanism ADR is needed:
  a scope-keyed policy store + resolution order. Decide it before building the
  first sub-tenant setting, not after.
- **WMS-tier:** the rest (ownership, consignment, multi-entity, FEFO/allocation
  policy, per-partner shelf life, replenishment thresholds, device management)
  rides with the WMS discovery, out of current scope.

## Next step

If you want, the M2 cluster can become one ADR ("tenant settings surface: typed,
tenant-scoped, resolved as tenant-then-system-default") plus a migration
introducing `tenant_settings`, unifying the approval/numbering/tolerance/cost
configs the fix-3 and fix-4 ADRs each proposed separately. The M3 scoped-policy
mechanism gets its own ADR when the first below-tenant setting is actually needed.
