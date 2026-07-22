# Fix-4 - UI/UX revamp (AppShell, dashboard, orders & sales)

> **Status: proposed - not implemented.** This is a planning document. No code,
> schema, API, or client change described here has been built. ADRs 0016-0020
> record the decisions; nothing is committed. Larger than fix-3 (server-enforced
> fulfillment + full read-query contract); sequence as its own milestone.
>
> **Execution:** the backend/frontend sprint split and sync points are in
> `fix-4-sprint-plan.md`; the pick-up-and-go handoffs are jobs `SN-0001`..`SN-0011`
> in `../jobs/` (board: `../jobs/BOARD.md`).

Translates a stashed scratch file of revamp notes into technical work. It pulls
the three `scale`-deferred incidents forward (INC-4 fulfillment, INC-5 list
query, INC-6 search) because the revamp depends on them, and adds new order
domain rules. Decisions are recorded in ADR-0016..0020; this plan is the
build/sequencing layer.

Spec-first (`openapi.yaml` + `api/paths/*`, then `go generate ./...` /
`pnpm generate-api`), test-first (/tdd), generated files never hand-edited, per
CLAUDE.md.

## Decisions (see ADRs)

- **ADR-0016** - server-computed received/delivered rollup + fulfillment state;
  over-receipt allowed to a tenant tolerance (default 0), else blocked; closed
  lines can't be re-received.
- **ADR-0017** - receipt cost defaults from the PO line, editable only by
  owner/admin, override recorded.
- **ADR-0018** - `cancelled` terminal status for PO/SO from draft or posted;
  partial orders short-close the remainder; distinct from reversal.
- **ADR-0019** - read-query contract: `status/warehouseId/dateFrom/dateTo/q` +
  `cursor/limit` on lists; server typeahead search for pickers (fuzzy/trigram).
- **ADR-0020** - header -> lines -> summary wizard for line-heavy documents.

## Ground truth (from code exploration)

- **No server fulfillment rollup or over-receipt guard.** GR/SO lines carry the
  nullable FK (`goods_receipt_lines.purchase_order_line_id`
  `0006_m1_core_schema.sql:209`; `delivery_lines.sales_order_line_id :266`) but no
  `received_qty`; the browser reconstructs it (`-order-data.ts:153-208`,
  `-sales-order-data.ts:164-222`) and over-receipt clamps to 0 remaining. Posting
  validates only `qty > 0` (`goods_receipts.go:127-151`).
- **Receipt cost is independent, defaults 0**, feeds costing via
  `receiptMovements` -> `stock_movements.unit_cost` (`goods_receipts.go:134,336`;
  `posting.go:120-159`). PO price is a separate `purchase_order_lines.unit_cost`.
- **No cancellation** distinct from reversal; PO/SO status is
  `draft|posted|reversed` (`0300_document_reversals.sql:20-53`); order "reverse"
  clones a posted twin (`purchase_orders.go:269-338`).
- **Lists take no filter/pagination params** (`documents.sql`, all `List*`);
  catalog has `status`/`role` only; client filters in-memory over full fetches.
  `DocList` (`components/doc-list.tsx`) is controlled, URL state per route; only
  removal chips exist, **no filter-setting control, no `ui/tabs.tsx`**.
- **Pickers** are inline cmdk substring match, no fuzzy, no dialog
  (`components/combobox.tsx`, `product-combobox.tsx`, `pickers-data.ts`); data via
  `GET /products?status=active` etc., no `q`.
- **AppShell**: `components/shell/app-shell.tsx` + `app-sidebar.tsx`; nav model is
  the single `components/shell/nav-config.ts`.
- **Dashboard** = `routes/_authed/index.tsx`: hero buttons (linked), a "Draf saya"
  Card wrapping `components/dashboard/draft-list.tsx`, and 4 **non-clickable**
  `StatCard`s (Products/Partners/Warehouses/Valuation).
- **Wizard precedent**: `stock/opnames/-opname-flow.tsx` (setup/count/review) is
  the only stepped form; all other editors single-step (`-order-form.tsx`, etc.).
- **Mobile**: `hooks/use-mobile.ts` (`useIsMobile`, 768px), used only by the
  sidebar's Sheet swap; catalog edit panels already use `ui/sheet.tsx`.
- **Disclosure primitives**: no `ui/accordion.tsx` or `ui/collapsible.tsx`
  exists (generate via `pnpm dlx shadcn@latest add`), but `DataTable` already
  supports inline row expansion (`renderExpandedRow` / `expandedRowId`,
  `components/data-table.tsx:31-48,93-113`) - the base for a linked-doc peek.

## Slices

Ordered so the server contract lands before the UI that depends on it.

### Slice 1 - Read-query contract + entity search (ADR-0019)
- Server: add `status/warehouseId/dateFrom/dateTo/q/cursor/limit` to all document
  `List*` endpoints and queries; `nextCursor` in responses. Add `q` typeahead to
  products/partners/warehouses (trigram index; `pg_trgm`).
- Client: move `DocList` consumers from in-memory predicates to server params
  (URL search state already matches). Rebuild pickers as a Command **dialog**
  (Sheet on mobile) driving the server `q` via the existing `onSearch` seam;
  keep recents.

### Slice 2 - Order fulfillment + receiving rules (ADR-0016, ADR-0017)
- Server: rollup query for `receivedQty`/`deliveredQty` per PO/SO line +
  fulfillment state (`open|partial|closed`) on line and document responses;
  over-receipt guard inside the posting tx with a per-order-line advisory lock;
  tenant tolerance setting (default 0). Receipt line cost defaults from the PO
  line; override gated to owner/admin and recorded.
- Client: drop the client-side received/delivered joins; show server rollup on
  PO/SO lines, list progress column, and dashboard. Receipt form pre-fills cost
  from PO, read-only unless owner/admin.

### Slice 3 - Cancellation (ADR-0018)
- Server: extend PO/SO status CHECK with `cancelled`; `cancel` transition
  (reason + owner/admin) that short-closes remaining line qty; fulfillment guard
  treats cancelled lines as closed.
- Client: cancel action + reason dialog on PO/SO detail; `cancelled` StatusBadge
  variant + label.

### Slice 4 - Lists: status/fulfillment tabs + filter bar
- Add `ui/tabs.tsx` (none exists). Define per-doc-type tab presets as named
  filters over the ADR-0019 contract (e.g. orders: Aktif / Selesai / Semua, where
  Selesai = fulfillment `closed`). Add a filter-setting bar (status, warehouse,
  date, `q`) above `DocList`, driving the existing `onFiltersChange`/URL params.
  Tabs and the bar share one filter model.

### Slice 5 - Line-heavy form wizard (ADR-0020)
- Generalize the opname step scaffold (StepIndicator + sticky nav) into a shared
  wizard; convert order/receipt/delivery/transfer editors to
  header -> lines -> summary. Keep route-held draft across steps; post from
  summary. Simple catalog forms unchanged.

### Slice 6 - Dashboard + AppShell polish
- Dashboard: replace the single "Draf saya" Card with a drafts **menu-group
  button** carrying a badge count, opening the drafts list; make the `StatCard`s
  clickable to their modules (Products/Partners/Warehouses/Valuation).
- Sidebar/AppShell: revamp `nav-config.ts` grouping + `app-sidebar.tsx`
  presentation; refine form composition/input placement (feeds Slice 5).

### Slice 7 - Linked-document peek + progressive disclosure (design principle 9)
- Generate `ui/accordion.tsx` + `ui/collapsible.tsx` (none exist).
- Linked-document accordion: where a record references another document
  (PO -> its receipts, SO -> its deliveries, opname -> kartu stok), expand the
  linked document's **line detail only** inline via an accordion / DataTable
  expandable row, with a link to open the full document - instead of navigating
  away. Reuses the ADR-0016 fulfillment link data (posted receipts/deliveries per
  order line), so it lands naturally after Slice 2.
- Sweep for progressive-disclosure wins: move dense/secondary panels into
  collapsibles rather than always-on screen real estate. This is a component-
  selection rule (design principle 9 / the fix-2 checklist), applied as editors
  and detail pages are touched in Slices 5-6 - not a one-off screen.

## Traceability

| Scratch item | Source | ADR / slice |
|---|---|---|
| filter & query for every table | INC-5 | ADR-0019 / S1 |
| Select -> search dialog, fuzzy | INC-6 | ADR-0019 / S1 |
| accepted-once, partial acceptance | INC-4 + item 9 | ADR-0016 / S2 |
| receiving can't change price | item 10 | ADR-0017 / S2 |
| cancellation workflow | item 12 | ADR-0018 / S3 |
| tabbed status per list | AppShell | S4 (on ADR-0019) |
| multi-step forms | AppShell | ADR-0020 / S5 |
| dashboard drafts group + clickable hero | /dashboard | S6 |
| sidebar + form composition revamp | AppShell | S6 |
| linked-doc accordion peek | added note | S7 (design principle 9) |
| collapsible-first component selection | added note | S7 / fix-2 principle 9 |

## Verification

- Server: `go build/vet/test ./...` - fulfillment rollup + over-receipt guard
  (incl. tolerance boundary and concurrent-receipt race), cost default/permission,
  cancellation short-close, list filter/cursor, search ranking.
- Client: `pnpm typecheck/lint/test`; `pnpm generate-api`/`generate-i18n` clean.
- E2E (dev server): filter + paginate a large list via tabs; search a product in
  the picker dialog; receive a PO partially then fully, and confirm over-receipt
  beyond tolerance is blocked; cancel a partially-received PO and confirm the
  remainder short-closes; complete a wizard-based order; open the dashboard drafts
  group and click a StatCard through to its module.

## Not in scope

Excel round-trip, backorder prompt, invoicing (still deferred, see
fix-2-deferred-scope.md); WMS discovery; anything requiring a new role
(ADR-0005/0015 keep fixed roles).
