# Fix-4 sprint plan - backend / frontend handoff

> **Status: proposed - not implemented.** Execution plan for
> `fix-4-ui-ux-revamp.md`. Splits the 7 slices into a **backend lane (BE)** and a
> **frontend lane (FE)** with explicit sync points, so two programmers (or two
> worktree agents) can run concurrently without stepping on each other. Decisions
> are frozen in ADR-0016..0020; this doc only sequences the build.
>
> **Execution:** these slices are handed off as jobs `SN-0001`..`SN-0011` in
> `../jobs/` (board: `../jobs/BOARD.md`) - each a self-contained handoff with
> scope fence, gates, and an append-only log.

## Roles and ground rules

- **BE** owns `server/` - `openapi.yaml` + `api/paths/*`, migrations, sqlc
  `queries/*.sql`, domain + handlers, Go tests.
- **FE** owns `client/` - typed API client, TanStack Router/Query/Table/Form,
  shadcn primitives, Paraglide messages, vitest.
- **Shared, edited only in Sprint 0**: `server/api/openapi.yaml` and
  `api/paths/*` (the contract). After Sprint 0 both lanes regenerate from it; if a
  lane needs a contract change mid-sprint, it reopens Sprint 0 as a tiny PR - it
  does **not** hand-edit generated files (`api-types.ts`, `server/internal/api/`,
  sqlc output, `routeTree.gen.ts`, `src/paraglide/`).
- Both lanes are test-first (/tdd), Conventional Commits, `type/short-slug`
  branches off `main`, squash merge. Parallel lanes run in worktrees under `.wt/`
  (global rules); the recurring conflicts are additive `messages/*.json` and
  generated `routeTree.gen.ts` (take theirs, then `pnpm generate-routes`).
- Client gate before any merge: `pnpm typecheck && pnpm test && pnpm lint`
  (+ `pnpm generate-i18n` after touching `messages/*.json`). Server gate:
  `go build ./... && go vet ./... && go test ./...`.

## The one hard dependency: contract before consumers

Everything hinges on the OpenAPI contract. Once Sprint 0 merges the spec and both
lanes regenerate, **FE builds every screen against the typed client immediately**
- it does not wait for handlers, because the types exist. FE stubs responses with
MSW where a real endpoint isn't live yet, and swaps to the real one when the BE
slice lands. That is what makes the two lanes truly parallel instead of
FE-waits-for-BE.

```
                 Sprint 0  (JOINT - blocks everything)
          contract freeze + shared migrations + regen
                          |
        +-----------------+------------------------------+
        |  BE lane                          FE lane       |
        v                                        v
  S1-BE read-query + search        S5-FE wizard scaffold     ] no BE
  S2-BE fulfillment + cost         S6-FE sidebar/nav         ] dependency,
        |                          S7-FE disclosure prims    ] start day 1
        |  (S2 responses)                |
        v                               (S1 live)
  S3-BE cancellation           -->  S1-FE list+picker consumers
        |                               (S2 live)
        |                          -->  S2-FE rollup display, receipt cost
        |                               S7-FE linked-doc peek
        +--------------> (S3 live) -->  S3-FE cancel action
                                        S4-FE tabs + filter bar (on S1)
                                        S6-FE dashboard fulfillment (on S2)
```

**Critical path** (longest chain): Sprint 0 -> S2-BE -> S3-BE -> S3-FE. Keep BE
on the S2->S3 spine; FE always has pure-UI work (S4/S5/S6/S7) to fill any wait.

## Sprint 0 - Contract and schema freeze (JOINT, ~half a sprint, blocks all)

One small PR, both lanes review, merged before the fork. Nothing else starts
until this is on `main`.

**BE writes, FE co-reviews the shapes:**

1. **Read-query contract (ADR-0019)** on every document `List*`: request params
   `status`, `warehouseId`, `dateFrom`, `dateTo`, `q`, `cursor`, `limit`;
   response gains `nextCursor`. Add `q` to `products`/`partners`/`warehouses`.
2. **Fulfillment fields (ADR-0016)** on PO/SO line + document response schemas:
   `receivedQty`/`deliveredQty` (numeric) and `fulfillmentState`
   (`open|partial|closed`). Read-only, server-computed - no request fields.
3. **Receipt cost (ADR-0017)**: mark receipt-line `unitCost` as defaulted/echoed;
   response carries whether it was overridden.
4. **Cancellation (ADR-0018)**: `cancel` transition (body: `reason`) on PO/SO;
   add `cancelled` to the status enum in the response schema.
5. Run `go generate ./...` (server stubs + sqlc) and `pnpm generate-api` (client
   types). Commit generated output.

**Shared migrations that several slices touch - land once, here** (roadmap
"shared schema"):

| Migration | Serves | Shape |
|---|---|---|
| Extend PO/SO `status` CHECK: add `cancelled` | S3 | drop/re-add CHECK per table, as `0300` did for `reversed` |
| `tenant_settings` table (`tenant_id` + RLS, ADR-0004) | S2 tolerance, S2 cost authority | key/value or typed columns; **needs the tenant_settings ADR - see roadmap open decision #1** |
| `pg_trgm` extension + trigram indexes on searchable name columns | S1 search | products/partners/warehouses |

Fulfillment rollup needs **no column** (computed from posted linked receipt/
delivery lines) but reserve migration numbers for supporting indexes on
`goods_receipt_lines.purchase_order_line_id` / `delivery_lines.sales_order_line_id`.

> **Blocker to resolve first:** `tenant_settings` has no ADR yet
> (roadmap open decision #1). S2's tolerance + cost-authority both read it. Either
> write that ADR as part of Sprint 0, or stub the two settings as hardcoded
> defaults (tolerance 0, cost-authority = owner/admin) and file a follow-up. Pick
> before Sprint 0 starts.

**Exit gate:** spec merged, both lanes regenerate green, migrations apply
(`go run ./cmd/migrate up`).

## Sprint 1 - Parallel fork (BE spine + FE pure-UI)

Both lanes start the moment Sprint 0 merges. No cross-lane wait this sprint.

### BE lane

**S1-BE - Read-query + entity search (ADR-0019).**
- Add `status/warehouseId/dateFrom/dateTo/q/cursor/limit` to `List*` in
  `queries/documents.sql` + handlers; keyset (cursor) pagination, `nextCursor`.
- `q` typeahead on products/partners/warehouses using the trigram indexes.
- Tests: filter combinations, cursor stability, search ranking.

**S2-BE - Fulfillment + receiving rules (ADR-0016, ADR-0017)** *(critical path -
start in parallel with S1-BE if two BE devs; else right after S1-BE)*.
- Rollup query: `receivedQty`/`deliveredQty` per PO/SO line + `fulfillmentState`
  on line and document, from posted linked lines (the browser currently
  reconstructs this in `-order-data.ts:153-208` / `-sales-order-data.ts:164-222`
  - that logic moves server-side).
- Over-receipt guard **inside the posting tx** with a per-order-line advisory
  lock; blocks beyond tenant tolerance (default 0); closed lines can't re-receive.
  Posting today validates only `qty > 0` (`goods_receipts.go:127-151`) - this is
  the insertion point.
- Receipt line `unitCost` defaults from the PO line
  (`purchase_order_lines.unit_cost`); override gated to owner/admin and recorded.
- Tests: tolerance boundary, **concurrent-receipt race** (advisory lock), cost
  default + permission denial.

### FE lane (zero BE dependency - all against the frozen contract)

**S5-FE - Wizard scaffold (ADR-0020).** Generalize the opname step scaffold
(`stock/opnames/-opname-flow.tsx`, StepIndicator + sticky nav) into a shared
header -> lines -> summary wizard. Build + unit-test the scaffold now; wiring
individual editors trails into Sprint 2/3.

**S6-FE (part) - Sidebar / AppShell.** Revamp `nav-config.ts` grouping +
`app-sidebar.tsx` presentation. Pure presentation, no data dependency.

**S7-FE (part) - Disclosure primitives.** Generate `ui/accordion.tsx` +
`ui/collapsible.tsx` (neither exists). Begin the progressive-disclosure sweep on
editors/detail pages touched by S5/S6 (design principle 9).

**S4-FE (start) - `ui/tabs.tsx` + filter bar shell.** Generate `ui/tabs.tsx`
(none exists); build the filter-setting bar (status/warehouse/date/`q`) and
tab-preset model over the ADR-0019 URL params. Drive it with MSW-stubbed list
responses until S1-BE is live, then point at the real endpoint.

**Sprint 1 sync point:** when **S1-BE** merges, FE swaps its stubs and lands
**S1-FE** (DocList consumers move from in-memory predicates to server params;
pickers rebuilt as a Command **dialog** / Sheet-on-mobile driving server `q` via
the existing `onSearch` seam - `combobox.tsx`, `product-combobox.tsx`).

## Sprint 2 - Converge on data-bound UI

BE finishes the spine; FE consumes each response as it lands.

### BE lane

**S3-BE - Cancellation (ADR-0018)** *(critical path, needs S2's fulfillment
guard)*.
- `cancel` transition (reason + owner/admin) that short-closes remaining line qty;
  fulfillment guard treats cancelled lines as closed. Distinct from the existing
  reverse-clone (`purchase_orders.go:269-338`).
- Tests: short-close math, cancelled-line excluded from open fulfillment,
  permission.

BE buffer after S3: supporting indexes / search-ranking tuning, or pull forward
any Sprint-0 follow-up (e.g. the `tenant_settings` ADR if stubbed).

### FE lane

**S2-FE (on S2-BE live).** Drop the client-side received/delivered joins; render
the server rollup on PO/SO lines, a list **progress column**, and the dashboard.
Receipt form pre-fills cost from the PO, read-only unless owner/admin.

**S4-FE (finish, on S1 live).** Land the status/fulfillment tab presets (orders:
Aktif / Selesai / Semua, where Selesai = fulfillment `closed`) now that real
filtered data flows. Tabs + bar share one filter model.

**S7-FE (on S2-BE live).** Linked-document accordion peek: PO -> its receipts,
SO -> its deliveries, opname -> kartu stok, expanded **line-detail-only** inline
via `DataTable`'s existing `renderExpandedRow`/`expandedRowId`
(`data-table.tsx:31-48,93-113`), with a link to the full doc. Reuses the ADR-0016
fulfillment link data, so it lands naturally right after S2-FE.

**Sprint 2 sync point:** when **S3-BE** merges, FE lands **S3-FE** (cancel action
+ reason dialog on PO/SO detail; `cancelled` StatusBadge variant + label).

## Sprint 3 - Polish and wizard rollout (mostly FE)

BE is done except review support / bugfix.

**S5-FE (finish).** Convert order/receipt/delivery/transfer editors to the
header -> lines -> summary wizard from Sprint 1's scaffold. Route-held draft
across steps; post from summary. Simple catalog forms unchanged.

**S6-FE (finish).** Dashboard: replace the single "Draf saya" Card with a drafts
**menu-group button** + badge count; make the 4 `StatCard`s clickable through to
their modules (Products/Partners/Warehouses/Valuation) - all currently
non-clickable (`routes/_authed/index.tsx`).

**S7-FE (finish).** Complete the progressive-disclosure sweep across the editors
and detail pages touched in S5/S6.

## Dependency quick-reference

| Work | Lane | Blocked by | Unblocks |
|---|---|---|---|
| Sprint 0 contract + migrations | JOINT | tenant_settings decision | everything |
| S1-BE read-query + search | BE | Sprint 0 | S1-FE, S4-FE |
| S2-BE fulfillment + cost | BE | Sprint 0, tenant_settings | S2-FE, S3-BE, S7-FE |
| S3-BE cancellation | BE | S2-BE, cancelled-status migration | S3-FE |
| S1-FE list + picker consumers | FE | S1-BE live | S4-FE finish |
| S2-FE rollup display + cost | FE | S2-BE live | S6-FE dashboard |
| S3-FE cancel action | FE | S3-BE live | - |
| S4-FE tabs + filter bar | FE | S1 contract (shell), S1-BE (finish) | - |
| S5-FE wizard | FE | none (scaffold), touches editors | - |
| S6-FE sidebar / dashboard | FE | none (sidebar), S2 (dashboard fulfillment) | S5 form composition |
| S7-FE disclosure + peek | FE | none (prims), S2-BE (peek data) | - |

## What can and cannot run in parallel

**Fully parallel from day 1 (after Sprint 0):** all BE handler work vs FE
pure-UI (S5 scaffold, S6 sidebar, S7 primitives, S4 shell). Different repos,
different files, one frozen contract between them.

**Serialized (the only true waits):**
- S3-BE waits on S2-BE (cancellation reuses the fulfillment guard).
- Each `*-FE` data-display waits on its matching `*-BE` **endpoint being live**,
  not on the whole BE lane - and only for the swap-from-stub step; the UI shell is
  already built.

**Never parallel:** two lanes editing `openapi.yaml`/`api/paths/*` at once. That
file is frozen after Sprint 0; changes reopen Sprint 0 as a tiny joint PR.

## Merge and integration order

1. Sprint 0 (contract + migrations) - first, alone.
2. S1-BE, then S1-FE. S2-BE can merge anytime after Sprint 0 (independent of S1).
3. S2-FE / S7-FE after S2-BE.
4. S3-BE after S2-BE; S3-FE after S3-BE.
5. S4-FE after S1; S5/S6-FE anytime their pieces are ready.
6. Integration check: E2E per `fix-4-ui-ux-revamp.md` Verification - filter +
   paginate via tabs, picker search, partial-then-full receive with over-receipt
   blocked beyond tolerance, cancel a partially-received PO and confirm
   short-close, complete a wizard order, dashboard drafts group + StatCard
   click-through.

## Open items to close before Sprint 0

1. **`tenant_settings` ADR** (roadmap open decision #1) - write it, or stub
   tolerance=0 / cost-authority=owner-admin and defer. Blocks S2.
2. **fix-3 interleave** (roadmap open decision #2) - fix-3 and fix-4 share the
   status-enum + lifecycle migrations. If fix-3 runs first or concurrently,
   Sprint 0 must coordinate the single status-CHECK migration with fix-3's
   `pending_approval`/`approved` additions so the enum is extended once, not
   twice.
