# Fix 2 - UI revamp: work allocation, complexity, and dependencies

> **Status: Done.** Process artifact; the fix-2 worktrees are merged and cleaned
> up.

Companion to `fix-2-ui-redesign.md`. That plan defines *what* each screen is;
this file defines *who builds what, in what order, and what blocks what* so
the team can work in parallel worktrees without colliding.

Team: 1 Dept Head (also codes the hardest pieces), 1 Senior UI/UX Engineer
(design brief + review gate), 3 Senior Frontend Engineers.

Worktree rule: every task gets its own worktree under `.wt/<name>` on branch
`feat/ui-revamp-<name>`, squash-merged to `main`. `.wt/` is gitignored.

## Complexity legend

S (~half day) · M (~1 day) · L (~2 days) · XL (~3+ days, or the hardest page)

## Waves (dependency-ordered)

Parallelism is gated by two shared-foundation phases. Nothing page-level is
safe to start until Wave 0 lands; document-entry pages also wait on Wave 1's
pickers/LineGrid.

### Wave 0 - Foundations (BLOCKS EVERYTHING, sequential)

| # | Task | Cx | Branch | Depends on |
|---|---|---|---|---|
| 0.0 | UI/UX design brief (`../design/ui-design-principles.md`) | M | (doc, no code) | — |
| 0.1 | Tokens + typography (index.css, Geist fonts, StatusBadge palette) | M | `feat/ui-revamp-foundations` | 0.0 |
| 0.2 | App shell (UX-D9 sidebar nav, topbar, tenant-switcher combobox, mobile Sheet) | L | `feat/ui-revamp-shell` | 0.1 |
| 0.3 | Shared components: RecordShell, StatusBadge, EmptyState, ConfirmDialog, DocList | L | `feat/ui-revamp-shared-components` | 0.1 |

Owner: Dept Head + UI/UX lead. 0.1 first; 0.2 and 0.3 can run in two
worktrees once 0.1 merges (they touch different files).

### Wave 1 - Pickers/LineGrid + independent report/detail pages

| # | Task | Cx | Branch | Depends on |
|---|---|---|---|---|
| 1.1 | ProductCombobox + Partner/WarehouseCombobox + LineGrid + scanner-in-Dialog | XL | `feat/ui-revamp-pickers-linegrid` | 0.1, 0.3 |
| 1.2 | Reports: Stok per Gudang, Nilai Persediaan (DataTable presets) | M | `feat/ui-revamp-reports-stock` | 0.3 |
| 1.3 | Report: Kartu Stok | M | `feat/ui-revamp-report-stock-card` | 0.3, **1.1 (ProductCombobox)** |
| 1.4 | Product detail (D7) | L | `feat/ui-revamp-product-detail` | 0.3 (RecordShell) |
| 1.5 | Partner detail + Warehouse detail | M | `feat/ui-revamp-entity-details` | 0.3 |
| 1.6 | Dashboard (D8) | M | `feat/ui-revamp-dashboard` | 0.3 (DocList) |

Owner: Dept Head owns 1.1 (the blocker + hardest). FE-1 takes 1.2 -> 1.4;
FE-2 takes 1.5 -> 1.6; 1.3 waits on 1.1 landing.

### Wave 2 - Document lifecycle + chains + opname (full parallel)

| # | Task | Cx | Branch | Depends on |
|---|---|---|---|---|
| 2.1 | Receipt: list + detail + entry (D1/D2/D3) | L | `feat/ui-revamp-receipt` | 0.*, 1.1 |
| 2.2 | Delivery: list + detail + entry | L | `feat/ui-revamp-delivery` | 0.*, 1.1 |
| 2.3 | Transfer: list + detail + entry | M | `feat/ui-revamp-transfer` | 0.*, 1.1 |
| 2.4 | Adjustment: list + detail + entry (signed qty, reason) | M | `feat/ui-revamp-adjustment` | 0.*, 1.1 |
| 2.5 | Purchase Order: list + detail + new (D4 chain) | L | `feat/ui-revamp-purchase-order` | 0.*, 1.1, **2.1 contract** |
| 2.6 | Sales Order: list + detail + new | L | `feat/ui-revamp-sales-order` | 0.*, 1.1, **2.2 contract** |
| 2.7 | Stok Opname three-step flow (D5) | XL | `feat/ui-revamp-opname` | 0.*, 1.1 |
| 2.8 | Old-route redirects (/receive,/delivery,/opname) | S | `feat/ui-revamp-route-redirects` | 2.1, 2.2, 2.7 |

Owner: Dept Head owns 2.7 (opname, hardest page). FE-1: 2.1 then 2.5.
FE-2: 2.2 then 2.6. FE-3: 2.3, 2.4, 2.8.

## Dependency warnings (cross-page couplings to coordinate)

1. **Kartu Stok (1.3) needs ProductCombobox (1.1).** Not a pure F2.1 page.
   Do not start 1.3 until 1.1 merges.
2. **PO/SO create-from-source (2.5/2.6) pre-fill the receipt/delivery entry
   routes** via `?purchaseOrderId=` / `?salesOrderId=`. The receipt (2.1) and
   delivery (2.2) owners must FREEZE that query-param + line-prefill contract
   before PO/SO start. Documented in each entry route; PO/SO only navigate.
3. **LineGrid props are the Wave 2 integration seam.** Freeze the LineGrid
   prop contract (see design brief section D) at end of 1.1. Every entry page
   (2.1-2.7) consumes it; a late prop change breaks 5 worktrees.
4. **Opname (2.7) reuses reports data** (stock-on-hand rows + valuation
   avgCost). Share one query hook for stock-on-hand; do not fork it between
   reports (1.2) and opname (2.7).
5. **Paraglide messages are a hot merge zone.** Every page adds keys to
   `messages/id.json` + `messages/en.json`. Convention: namespace keys per
   screen (`receipt_*`, `opname_*`, `po_*`) to minimize line collisions; run
   `pnpm generate-i18n` locally; resolve message-file conflicts at merge, never
   hand-edit `src/paraglide/`.
6. **Sidebar nav (0.2) enumerates every route.** Land the full UX-D9 nav in
   Wave 0 with routes that may 404 until built, rather than each page editing
   the shell later. Page worktrees do NOT touch the shell.
7. **`routeTree.gen.ts` regenerates** when route files are added — it is
   generated, so conflicts there are resolved by re-running the generator, not
   by hand.

## Merge protocol

- Rebase each worktree on `main` before opening its squash merge.
- Merge order respects waves: all of Wave 0, then Wave 1, then Wave 2.
- Within a wave, merge the contract-owner first (2.1 before 2.5, 2.2 before
  2.6, 1.1 before 1.3).
- TDD per CLAUDE.md: failing component test at each new seam before impl.
