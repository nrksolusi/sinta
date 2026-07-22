# Fix-2 UI redesign - deferred scope

The fix-2 UI redesign (`docs/plans/fix-2-ui-redesign.md`) is functionally
complete for M1: every route in the plan's route map, the full document
lifecycle (draft → post → reverse), both purchase/sales chains, the opname
three-step flow, all three reports, entity details, and the dashboard are on
`main` (198 client tests green).

This document records what was deliberately NOT built, so the gaps read as
decisions rather than oversights. Two categories.

## A. Deferred to M2 by the plan (UX-D11 / API-gaps #5)

These are out of M1 scope per the plan itself. The UI reserves each one's slot
(a disabled control with a caption, or a reserved status), so shipping them
later slots in without a redesign.

| Feature | Plan ref | Reserved UI slot today | Notes |
|---|---|---|---|
| Printing - surat jalan PDF | UX-D11 | `Cetak` action on posted deliveries (disabled + M2 caption) | No prices; qty + satuan, ship-to, customer PO number, three signature blocks (pengirim/sopir/penerima) |
| Document numbering template UI | UX-D11 | - | Numbering happens server-side at posting (ADR-0010); this is the config screen |
| Approval gate | UX-D11 | StatusBadge `pending` variant ("Menunggu Persetujuan") reserved, not wired | Kledo-style gate: Draf → Menunggu Persetujuan → Disetujui; one approver role; reject requires a reason |
| Backorder prompt on short receipt | UX-D4 | - | M1 just posts short and shows remaining qty on the source PO/SO |
| Excel / CSV import-export | API-gaps #5 | Disabled export button + caption on report toolbars | Round-trip is table stakes for pilot users but deferred |
| "Buat faktur" (invoice) | prototype D2 | Disabled action on posted receipts + M2 caption | Invoicing is a separate document type, out of fix-2 |

None of these block M1 use. Revisit as a dedicated M2 slice.

## B. Blocked by missing/insufficient API (see `incidents.md`)

Three specified UI affordances could not be wired at M1 because the server
contract does not support them yet. Each is logged as an incident with a
proposed server change; the client code reserves the affordance so it lights up
the moment the endpoint/field lands.

| Affordance | Incident | Current M1 behaviour |
|---|---|---|
| "Hapus draf" (delete a draft document) | [INC-1](./incidents.md) - no `DELETE /{document}/{id}` | Action omitted; a draft just stays a draft. Editor components already carry the `onDelete` plumbing |
| Timeline actor + time (UX-D7 mini timeline) | [INC-2](./incidents.md) - documents carry no `createdBy/at`, `postedBy/at`, `reversedBy/at` | Timeline renders date + status only; actor blank |
| Opname berita acara variance on posted detail | [INC-3](./incidents.md) - opname lines don't echo `systemQty` | Posted opname shows counted values + per-product Kartu Stok links instead of System/Counted/Selisih |

INC-1/2/3 are small, additive server changes (spec-first in
`server/api/openapi.yaml`); doing them unlocks already-built-but-dormant UI. The
remaining incidents (INC-4/5/6) are `scale`-severity and only matter as data
volume grows.

## Suggested sequencing

1. INC-1/2/3 server additions (small, high leverage - each finishes a screen).
2. M2 slice A (printing + numbering) - the most-requested SME artifact.
3. Approval gate (needs a role/permission decision first).
4. Excel round-trip, backorder prompts, invoicing - as separate slices.

**Status:** items 1-3 are now planned in
[fix-3-lifecycle-and-slice-a.md](../plans/fix-3-lifecycle-and-slice-a.md). The
approval gate's role/permission decision is settled in ADR-0015 (opt-in per
tenant per document type; owner/admin approve via the fixed D10 roles;
approve-then-post; self-approval allowed; reject-with-reason). Item 4 stays
deferred.
