# Fix-3 - document lifecycle unblockers + deferred slice A

> **Status: proposed - not implemented.** This is a planning document. No code,
> schema, API, or client change described here has been built. ADRs 0013-0015
> record the decisions; nothing is committed.

Translates the in-scope subset of the fix-2 discovery
([incidents.md](../discovery/incidents.md),
[fix-2-deferred-scope.md](../discovery/fix-2-deferred-scope.md)) into concrete
schema, API, and client work. WMS discovery (`wms-*.md`) is out of scope.

Decisions behind this plan are recorded in ADR-0013 (draft deletion), ADR-0014
(opname `systemQty` snapshot), and ADR-0015 (approval gate). Everything here is
spec-first (edit `server/api/openapi.yaml` + `api/paths/documents.yaml`, then
`go generate ./...` and `pnpm generate-api`) and test-first (/tdd) per CLAUDE.md.
Generated files are never hand-edited.

## Scope

In: INC-1, INC-2, INC-3, the approval gate, and M2 slice A (surat jalan printing
+ doc-numbering template UI). Deferred: INC-4/5/6 (scale), backorder prompt,
Excel round-trip, invoicing.

## Ground truth (from code exploration)

- **Status** is a per-table `text` column with `CHECK (status IN ('draft',
  'posted', 'reversed'))` - not a Postgres enum. Original checks in
  `server/migrations/0006_m1_core_schema.sql`; extended to add `reversed` in
  `server/migrations/0300_document_reversals.sql:20-53`. New states are added the
  same way. Go constants: `server/internal/httpserver/documents.go:165-166`.
  OpenAPI `DocumentStatus`: `server/api/paths/documents.yaml:735-738`.
- **Header audit columns** already present on all 7 headers: `created_at`,
  `created_by`, `posted_at`. **Missing**: `posted_by`, `reversed_at`,
  `reversed_by`. Note `reverses_id` / `reversed_by_id` (added in `0300`) are
  document-to-document FK links, **not** actor columns.
- **Opname**: `stock_opname_lines` stores only `counted_qty`
  (`0006_m1_core_schema.sql:345-356`); variance is computed live at post in
  `opnameMovements` (`server/internal/httpserver/stock_opnames.go:412-448`,
  on-hand read at `:421`, `variance` at `:430`, zero-variance skipped at `:431`)
  and **not persisted**. Variances post as `movement_type = 'adjustment'`
  (`:440`), not `'opname'`. No-variance opnames bypass the poster and number
  directly (`:260-278`).
- **No document DELETE** exists anywhere (confirmed); only line-table deletes
  during update-replace.
- **Posting** writes number + journal atomically in `Poster.Post`
  (`server/internal/store/posting.go:41-96`, number assigned at `:83-87`) for
  stock docs via `postStockDocument`
  (`server/internal/httpserver/document_posting.go:55-101`); PO/SO use the
  `Numberer` inline (`purchase_orders.go:245-249`, `sales_orders.go:232`). All
  post handlers already re-guard `status == draft` - the natural slot for an
  approval precondition.
- **Client**: StatusBadge (`client/src/components/status-badge.tsx`) has
  `draft|posted|reversed|pending`; `pending` = "Menunggu Persetujuan" is fully
  defined but unwired; no `approved`/"Disetujui". Delete seam
  (`onDelete`/`ConfirmDialog`) exists only in
  `purchases/receipts/-receipt-editor.tsx` and is not passed by its route.
  Timeline (`client/src/components/record-shell.tsx:89-106`) renders
  `action + formatDate`, **drops `actor`**; all callers pass `actor: ""`.
  Opname variance estimate: `stock/opnames/-opname-sheet.ts` `computeReview()`
  (`:150-192`); posted detail omits Selisih (`stock/opnames/$id.tsx:110-232`).
  Disabled Cetak: `sales/deliveries/$id.tsx:250-258`. Formatting entry point:
  `client/src/lib/format.ts`. Settings nav: `settings/route.tsx`.

## Slice 1 - INC-1 / INC-2 / INC-3 unblockers

Small, additive, each finishes an already-built screen. Ship first.

**INC-1 - draft delete (ADR-0013)**
- Spec: add `delete` op `DELETE /v1/{document}/{id}` for all 7 document types in
  `api/paths/documents.yaml`.
- Server: add a `Delete*` query (header + cascade lines) and a handler guarded to
  `status == draft` (mirror the existing draft guard, e.g.
  `stock_opnames.go:188-211`), returning `409` otherwise.
- Client: lift the `-receipt-editor.tsx` delete seam into the other draft editors
  (delivery, adjustment, transfer, PO, SO), wire route-level state + a delete
  mutation, and pass `onDelete` from each `$id.tsx`. Message keys
  `*_action_delete_draft` already exist for receipt/adjustment/transfer; add the
  rest.

**INC-2 - lifecycle timestamps + actor**
- Migration: add `posted_by uuid REFERENCES users(id)` to all 7 headers.
  Reversal actor/time need not be new columns - derive `reversed_at`/`reversed_by`
  from the linked reversal document's `created_at`/`created_by` (via
  `reverses_id`) to avoid colliding with the existing `reversed_by_id` doc FK.
  (If a join proves awkward, add explicit `reversed_at`/`reversed_by`; decide at
  implementation.)
- Server: set `posted_by` in the `Mark*Posted` path; expose `createdAt`,
  `createdBy`, `postedAt`, `postedBy`, and reversal actor/time on the document
  response schemas (currently omitted, e.g. `stockOpnameToAPI`
  `stock_opnames.go:38-48`). Actor as `{ id, displayName }`.
- Client: change `RecordShell` to render `entry.actor` and use real transition
  timestamps instead of `docDate`; update the three `buildTimeline`/`timeline`
  builders to pass real actors.

**INC-3 - opname systemQty (ADR-0014)**
- Migration: add `system_qty numeric` to `stock_opname_lines`.
- Server: in `opnameMovements`, persist the on-hand read as `system_qty` for
  every line (including zero-variance) in the posting tx; set it for the
  no-variance fast path too. Return it on the opname line response.
- Client: replace `computeReview`'s client estimate on the **posted** detail with
  the stored `systemQty`; render System / Counted / Selisih in `PostedDetail`,
  removing the `opname_posted_variance_gap` caption. The pre-post review step may
  keep its live estimate (clearly labelled) since nothing is posted yet.

## Slice 2 - approval gate (ADR-0015)

- Migration: drop/re-add each header `status` CHECK to include `pending_approval`
  and `approved` (pattern of `0300`). Add `approval_settings (tenant_id,
  doc_type, requires_approval)` with `tenant_id` + RLS (ADR-0004). Add
  `submitted_at/by`, `approved_at/by`, `rejected_at/by`, `reject_reason` to the
  gated headers (fold with INC-2's migration).
- Spec/server: add `submit`, `approve`, `reject` transitions per document type;
  add a posting precondition - if the tenant gates this `doc_type`, require
  `status == approved`; else `status == draft` as today. Reuse
  `requireDocumentWriter`; approve/reject require owner/admin. Config
  get/update endpoints for `approval_settings`.
- Client: add an `approved` ("Disetujui") StatusBadge variant + message key; wire
  the dormant `pending` variant; add submit/approve/reject actions on draft/
  pending detail views with a reject-reason `ConfirmDialog`; show the approval
  events in the timeline (from INC-2). A settings screen toggles
  `requires_approval` per document type (owner/admin only).

## Slice 3 - M2 slice A (printing + numbering UI)

- **Surat jalan** for posted, non-reversed deliveries: wire the disabled `Cetak`
  at `sales/deliveries/$id.tsx:250-258`. Content: qty + satuan, ship-to, customer
  PO number, three signature blocks (pengirim / sopir / penerima), **no prices**.
  Format only via `client/src/lib/format.ts`.
- **Doc-numbering template config** (backend exists per ADR-0010; this is the UI):
  new route `client/src/routes/_authed/settings/numbering.tsx` + a role-gated
  `<Link>` in `settings/route.tsx`. The screen must state that edits apply at the
  next year rollover only (ADR-0010).

## Traceability

| Work | Source | ADR |
|------|--------|-----|
| Draft delete | INC-1 / deferred-scope B | ADR-0013 |
| Lifecycle timestamps + actor | INC-2 / deferred-scope B | (in ADR-0015 timeline) |
| Opname systemQty | INC-3 / deferred-scope B | ADR-0014 |
| Approval gate | deferred-scope A | ADR-0015 |
| Surat jalan printing | deferred-scope A (UX-D11) | - |
| Numbering template UI | deferred-scope A (UX-D11) | ADR-0010 |

## Verification

- Server: `go build ./...`, `go vet ./...`, `go test ./...` - handler/domain
  tests for the draft-delete guard, opname `systemQty` snapshot (incl.
  zero-variance and no-variance opname), and approval transitions +
  gated/non-gated post precondition.
- Client: `pnpm typecheck`, `pnpm lint`, `pnpm test`; `pnpm generate-api` and
  `pnpm generate-i18n` clean.
- E2E via dev server: submit -> approve -> post a gated document; delete a draft;
  post an opname and confirm the berita acara shows stored System/Counted/Selisih;
  print a surat jalan; toggle approval per doc type in settings.

## Suggested sequencing

Slice 1 first (unblocks dormant UI at lowest cost), then Slice 2 (approval -
larger, shares the INC-2 migration), then Slice 3 (printing + numbering).
