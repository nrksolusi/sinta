# M2/M3 unified roadmap

> **Status: Proposed - not implemented.** Sequencing plan only. Reconciles the
> original M2 decomposition (`m2-parallel.md`) with the fix-3/fix-4 slices and
> ADR-0013..0020 into one ordered roadmap, and resolves the migrations several of
> those plans touch in common. Nothing here is built.

## Why this exists

Four proposed bodies of work now overlap on the same tables and API contract:

- **fix-3** (`fix-3-lifecycle-and-slice-a.md`) - draft delete, lifecycle
  timeline, opname systemQty, approval gate, printing, numbering UI.
- **fix-4** (`fix-4-ui-ux-revamp.md`) - AppShell/orders revamp, server
  fulfillment + over-receipt, receiving cost, cancellation, read-query contract,
  form wizard.
- **configurability** (`tenant-configurability-catalog.md`) - tenant settings.
- **original M2** (`m2-parallel.md`) - FIFO, reconciliation, FEFO, SMTP.

Built plan-by-plan they would migrate the same `status` enum three times and add
lifecycle columns twice. This roadmap orders them so shared schema lands once.

## Shared schema - do these once, up front

| Change | Serves | Note |
|--------|--------|------|
| Extend document `status` CHECK: add `pending_approval`, `approved` (fix-3) and `cancelled` for PO/SO (fix-4) | ADR-0015, ADR-0018 | One migration, drop/re-add per table (as `0300` did for `reversed`) - not three |
| Lifecycle actor/time columns: `posted_by`, `submitted_*`, `approved_*`, `rejected_*` + reason | INC-2, ADR-0015 | One migration; reversal actor derived from the linked reversal doc |
| `tenant_settings` table (tenant-scoped) | ADR-0015/0016/0017, numbering | Backs approval-per-doc-type, over-receipt tolerance, receiving-cost authority, numbering template - **needs its own ADR** (see Open decisions) |
| `stock_opname_lines.system_qty` | ADR-0014 | Small standalone migration |
| `pg_trgm` indexes on searchable columns | ADR-0019 | For typeahead search |

Fulfillment rollup (ADR-0016) needs **no** column - it is computed from posted
linked receipt/delivery lines - but wants supporting indexes.

## Waves

Ordered by dependency; a wave may fork into parallel tracks (see `m2-parallel.md`
for the track-isolation technique).

**Wave 0 - Contract & schema freeze.** Lock the read-query contract (ADR-0019:
list filters + cursor + typeahead search) and land the shared-schema block above,
including the `tenant_settings` ADR. Do this first: CONVENTIONS makes the API
contract a breaking change once a pilot tenant exists.

**Wave 1 - Lifecycle unblockers** (fix-3 Slice 1). INC-1 draft delete, INC-2
timeline actor, INC-3 opname systemQty. Small, each finishes a dormant screen;
depends on the lifecycle schema.

**Wave 2 - Approval + cancellation** (fix-3 Slice 2 + fix-4 Slice 3). Approval
transitions/UI and order cancellation short-close. Depend on the status enum and
`tenant_settings`.

**Wave 3 - Fulfillment + receiving rules** (fix-4 Slice 2). Server rollup,
over-receipt tolerance, receiving-cost authority. Depend on `tenant_settings`.

**Wave 4 - UI revamp** (fix-4 Slices 4-7). Status/fulfillment tabs, form wizard,
dashboard, sidebar, linked-doc accordion. Depend on the read-query contract
(tabs) and fulfillment (progress).

**Wave 5 - Costing & artifacts** (original M2 + fix-3 Slice 3). FIFO engine and
tenant selection (ADR-0002 becomes real), automated `cost_correction` on
reconciliation/backdating, FEFO suggestions, surat jalan printing, numbering
template config UI, SMTP + email verification/reset.

**Wave 6 - M3.** Fiscal-year method switch + revaluation (D4), auditor reporting
pack + CSV/Excel exports, TOTP/Google sign-in, ops (monitoring, restore drill),
and the **granular scoped-policy config mechanism** (configurability M3: settings
below tenant scope - per warehouse / doc-type / product).

## Open decisions (resolve before Wave 0)

1. **`tenant_settings` ADR.** Fold the config bits ADR-0015/0016/0017 each
   propose separately into one tenant-scoped settings surface. Blocks Waves 2-3.
2. **fix-3 vs fix-4 interleave.** They share Wave 0-2 schema; confirm they build
   together rather than as two independent milestones.
3. **Costing vs revamp priority.** Wave 5 (FIFO, the original M2 headline) vs
   Waves 2-4 (lifecycle + revamp) - which is the real next milestone for the
   pilot? Pilot runs on average costing (D15), so FIFO can trail the revamp.

## Traceability

Waves map to: ADR-0013..0020, `fix-3-lifecycle-and-slice-a.md`,
`fix-4-ui-ux-revamp.md`, `tenant-configurability-catalog.md`, `m2-parallel.md`,
and `../reference/PLAN.md` §5 (M2/M3).
