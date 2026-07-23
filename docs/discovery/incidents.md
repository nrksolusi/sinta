# API incidents - surfaced by the fix-2 UI revamp

Running log of server-side gaps found while building the redesigned client
(fix-2-ui-redesign). Each entry is a missing endpoint or a schema that needs a
change before the UI can implement the plan as specified. These are **not
blockers** for M1 - the client works around each one as noted - but they should
be triaged into the API spec (`server/api/openapi.yaml`, spec-first per
CLAUDE.md) rather than lost.

Legend - Type: `missing-endpoint` | `schema-revamp`. Severity: `M1` (wanted for
pilot polish) | `M2` (deferred by plan) | `scale` (only matters as data grows).

---

## INC-1 - No draft-delete endpoint for any document

- **Type:** missing-endpoint
- **Endpoints:** `DELETE /goods-receipts/{id}`, `DELETE /deliveries/{id}`,
  `DELETE /stock-transfers/{id}`, `DELETE /stock-adjustments/{id}`,
  `DELETE /stock-opnames/{id}` (and the PO/SO equivalents). All documents
  currently expose `delete?: never`.
- **Surfaced by:** 2.1 receipt, 2.2 delivery, 2.4 adjustment.
- **Impact:** The "Hapus draf" action specified in prototype D3 / UX-D7 (and the
  ConfirmDialog destructive-delete house rule) cannot be wired. Engineers
  omitted the button rather than call a non-existent endpoint; the editor
  components already carry `onDelete`/delete-confirm plumbing for when it lands.
- **Workaround (M1):** action omitted; a draft simply stays a draft.
- **Proposed:** add `DELETE /{document}/{id}` permitted only while
  `status = draft` (posted documents remain immutable per ADR; deletion is only
  ever of an unposted draft, so it does not violate the append-only journal).
- **Severity:** M1.

## INC-2 - Document responses lack lifecycle timeline metadata

- **Type:** schema-revamp
- **Endpoints:** every document `get`/`list` response (goods receipts,
  deliveries, transfers, adjustments, opnames, PO, SO).
- **Surfaced by:** 2.4 adjustment (also affects every RecordShell detail page).
- **Impact:** UX-D7 specifies a mini timeline (created / posted / reversed, each
  with **actor and time**) at the bottom of every detail page. Document schemas
  carry `docDate` and `status` but no `createdAt/createdBy`,
  `postedAt/postedBy`, `reversedAt/reversedBy`. The timeline currently renders
  date + status only, with a blank actor.
- **Workaround (M1):** timeline derived from `docDate` + `status`; actor blank.
- **Proposed:** add `createdAt`, `createdBy`, `postedAt`, `postedBy`,
  `reversedAt`, `reversedBy` (actor as user id + display name) to the document
  response schema.
- **Severity:** M1.

## INC-3 - Posted opname lines do not return systemQty

- **Type:** schema-revamp
- **Endpoints:** `GET /stock-opnames/{id}` line items.
- **Surfaced by:** 2.7 opname (also noted as API gap #1 in fix-2-ui-redesign).
- **Impact:** Opname lines store only `countedQty`; the variance actually posted
  lives in the journal. The posted opname detail (the berita acara artifact SMEs
  expect) cannot show System / Counted / Selisih without recomputing against
  current stock - which drifts after the count. The review screen's variance is
  already labeled a client-side estimate for this reason.
- **Workaround (M1):** posted detail shows counted values and links to Kartu
  Stok per product for the movements produced.
- **Proposed:** capture `systemQty` at post time and return it on the opname
  line response, so the berita acara renders exactly what was adjusted.
- **Severity:** M1.

## INC-4 - No PO/SO fulfillment rollup per line

- **Type:** schema-revamp
- **Endpoints:** `GET /purchase-orders/{id}`, `GET /sales-orders/{id}` line
  items (received/delivered progress).
- **Surfaced by:** 2.5 PO / 2.6 SO (Wave 2b); anticipated per fix-2 API gap #2.
- **Impact:** Prototype D4 shows "Diterima" / "Sisa" per PO line and a
  received-progress column on the PO/SO list ("3/5 diterima"). There is no
  server rollup; the client computes it by joining linked receipts/deliveries
  (`purchaseOrderLineId` / `salesOrderLineId`) client-side.
- **Workaround (M1):** client-side join over `listGoodsReceipts` /
  `listDeliveries` filtered by source id.
- **Proposed:** add a `receivedQty` / `deliveredQty` rollup field per PO/SO line
  (server-computed) once list sizes make the client join costly.
- **Severity:** scale.

## INC-5 - List endpoints have no filter or pagination params

- **Type:** schema-revamp
- **Endpoints:** all `list*` endpoints (documents, catalog).
- **Surfaced by:** every DocList consumer (2.1-2.7); per fix-2 API gap #3.
- **Impact:** M1 endpoints return all rows (tenant-scoped). DocList's status +
  date-range + warehouse filters run client-side behind a URL-param interface,
  so moving to server params later changes no UX - but it does not scale.
- **Workaround (M1):** client-side filtering; URL params already model the
  eventual server contract.
- **Proposed:** add query params (`status`, `warehouseId`, `dateFrom`/`dateTo`,
  `q`, `limit`/`cursor`) to the list endpoints. Concrete near-term instance
  surfaced by 2.5 PO: a `purchaseOrderId` filter on `GET /goods-receipts` (and
  `salesOrderId` on `GET /deliveries`) would remove the full-list fetch the
  PO/SO chain does on every list and detail render for its fulfillment join.
- **Severity:** scale.

## INC-6 - No product search endpoint for the combobox

- **Type:** missing-endpoint
- **Endpoints:** a `GET /products?q=` (or dedicated search) for ProductCombobox.
- **Surfaced by:** 1.1 pickers; per fix-2 API gap #4.
- **Impact:** ProductCombobox (UX-D5) searches SKU/name/barcode. At M1 it filters
  the full product list client-side. The component already exposes an `onSearch`
  async seam for a server endpoint.
- **Workaround (M1):** client-side filter over the full list.
- **Proposed:** add a server-side product search endpoint; wire it to
  ProductCombobox's `onSearch`.
- **Severity:** scale.

## INC-7 - No approval gate before posting (fix-3 Slice 2)

- **Type:** missing-endpoint
- **Endpoints:** `POST /{document}/{id}/submit`, `POST /{document}/{id}/approve`,
  `POST /{document}/{id}/reject`; `GET /settings/approval`, `PUT /settings/approval`.
- **Surfaced by:** fix-3 plan (ADR-0015); approval toggle deferred from M1 design.
- **Impact:** The client's dormant `pending` StatusBadge variant ("Menunggu
  Persetujuan") and `settings/route.tsx` approval toggle are unwired. Tenants
  that require sign-off before posting (e.g. warehouse admin must approve a
  purchase order before the warehouse clerk can post it) have no server-enforced
  gate. Today all posted documents bypass approval.
- **Workaround:** approval role is bypassed; every document-writer can post
  directly (status goes draft -> posted).
- **Proposed (ADR-0015):**
  - Migration: extend all 7 header `status` CHECK with `pending_approval` and
    `approved`; add `approval_settings (tenant_id, doc_type, requires_approval)`
    with RLS; add `submitted_at/by`, `approved_at/by`, `rejected_at/by`,
    `reject_reason` columns to gated headers.
  - Server: `submit` / `approve` / `reject` transitions per document type; posting
    precondition checks `requires_approval` and enforces `status == approved` if
    set, else `status == draft`. Approve/reject require owner/admin.
  - Client: `approved` StatusBadge variant + message key; wire `pending` variant;
    submit/approve/reject actions on draft/pending detail views; approval settings
    screen.
- **Severity:** M1 (tenant config; blocks full order workflow for SMEs that need
  sign-off).

---

## Triage summary

| ID | Endpoint(s) | Type | Severity |
|----|-------------|------|----------|
| INC-1 | `DELETE /{document}/{id}` (draft only) | missing-endpoint | M1 |
| INC-2 | document lifecycle timestamps + actor | schema-revamp | M1 |
| INC-3 | opname line `systemQty` | schema-revamp | M1 |
| INC-4 | PO/SO per-line fulfillment rollup | schema-revamp | scale |
| INC-5 | list filter + pagination params | schema-revamp | scale |
| INC-6 | product search endpoint | missing-endpoint | scale |
| INC-7 | approval gate (submit/approve/reject + settings) | missing-endpoint | M1 |

M1 candidates (INC-1, INC-2, INC-3) are small, additive server changes that
directly unlock specified UI (delete-draft, timeline actor/time, berita acara
variance). INC-4/5/6 are deferrable until data volume warrants them.

**Status:** INC-1/2/3 built in SN-0012 (fix-3 Slice 1). INC-4/5/6 are **no
longer deferred** - the fix-4 UI/UX revamp
([fix-4-ui-ux-revamp.md](../plans/fix-4-ui-ux-revamp.md)) depends on them and
pulls them forward: INC-4 fulfillment rollup becomes a server-enforced guard
(ADR-0016), INC-5 list query + INC-6 search become the locked read-query contract
(ADR-0019), both in SN-0001. INC-7 (approval gate) is fix-3 Slice 2 per ADR-0015;
not yet scheduled.
