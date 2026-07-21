# Sinta - Build Plan

Multi-tenant SaaS inventory management for Indonesian SME distributors/wholesalers.
Solo developer, side-project pace. First external milestone: a pilot tenant on core
flows around month 3-4.

This document is the source of truth for scope and sequencing. Decisions below were
made deliberately (2026-07-21); reopening one means updating this file. The
hard-to-reverse decisions are recorded with their rationale in `adr/`.

## 1. Decision record

| # | Decision | Choice |
|---|----------|--------|
| D1 | Customer model | Multi-tenant SaaS, no committed customer yet; SME distributors are the beachhead |
| D2 | V1 scope | Inventory + order flows (PO/receipt, SO/delivery, transfers, adjustments, opname). Document totals only - no AR/AP, no GL, no tax |
| D3 | Costing | Both weighted average and FIFO, tenant-selectable (accepted cost: two engines, doubled test surface) |
| D4 | Method switch | Once per fiscal year at boundary, with stock revaluation + audit trail |
| D5 | Batch/expiry | In v1 schema, optional per product; FEFO picking for batch goods |
| D6 | Negative stock | Allowed; issue books at last known cost, marked provisional; reconciliation posts a correction entry; history never rewritten |
| D7 | Backdating | Backdated receipts allowed; triggers forward recomputation emitting correction entries |
| D8 | Tenancy | Shared Postgres schema, `tenant_id` on every row, RLS backstop. Flat: tenant = one legal company |
| D9 | Identity | Global user accounts; membership table (user x tenant x role), many-to-many |
| D10 | AuthZ | Fixed roles: owner, admin, warehouse, sales, viewer/auditor. Optional warehouse scoping per membership |
| D11 | AuthN | In-house: email/password, argon2id, server-side sessions. Google sign-in + TOTP later |
| D12 | Warehouse UX | One responsive React app; warehouse screens mobile-first; camera barcode via PWA; online-only |
| D13 | Hosting | Single VPS in Indonesia (Biznet Gio / IDCloudHost / GCP Jakarta) |
| D14 | Billing | Manual invoicing + activation flag; zero billing code in v1 |
| D15 | Sequencing | Pilot on average costing first; FIFO, fiscal-year switch, batch UX polish in later milestones |
| D16 | Doc numbering | Gapless at posting per tenant/type/year; tenant-configurable template, edits apply at year rollover; default template in M1, config UI in M2 |

Git and naming conventions live in `CONVENTIONS.md`.

Deferred (explicitly out of v1): accounting integration, e-commerce channel sync,
serial numbers, custom roles, offline mode, billing automation.

## 2. Architecture

Two artifacts everything hangs off:

1. **The movement journal** - append-only `stock_movements` table. Stock on hand,
   stock cards, and both costing engines are computations over it. Nothing else is
   a source of truth for stock.
2. **The OpenAPI contract** - `server/api/openapi.yaml`, spec-first. Server stubs
   and the client (`openapi-fetch` types, already wired in `client/package.json`)
   are both generated from it.

### Server (Go 1.25, `server/`)

Defaults chosen for boring reliability - change only with a reason:

- HTTP: stdlib `net/http` with Go 1.22+ method routing (no framework)
- DB: `pgx/v5` + `sqlc` for queries, `goose` for migrations
- API: `oapi-codegen` server interfaces from `api/openapi.yaml`
- Layout: `cmd/sinta/` (main), `internal/domain/` (pure logic: costing, journal,
  documents - no DB imports), `internal/store/` (sqlc + repositories),
  `internal/http/` (handlers, middleware), `internal/auth/`

Costing engines live in `internal/domain/costing` as pure functions over ordered
movement slices. This is what makes D3 survivable: both engines are testable with
in-memory fixtures, no DB.

### Client (React 19 + Vite, `client/`)

Stack stands as-is: TanStack Router/Query/Table/Form, Tailwind 4 + shadcn,
Paraglide (id/en). Add: PWA manifest + a camera barcode component
(`BarcodeDetector` API with a JS fallback lib) for receive/pick/opname screens.

## 3. Data model (core tables)

Every tenant-owned table carries `tenant_id` with an RLS policy checking
`current_setting('app.tenant_id')`. App middleware sets it per request after
resolving the session + active membership.

Identity and tenancy:

- `users` - id, email (unique), password_hash, name, status
- `tenants` - id, name, legal_name, costing_method (avg|fifo, set at onboarding),
  fiscal_year_start, active (D14 activation flag)
- `memberships` - user_id, tenant_id, role, unique(user_id, tenant_id)
- `membership_warehouses` - membership_id, warehouse_id (empty = all warehouses)
- `sessions` - server-side session store

Catalog and stock:

- `products` - tenant_id, sku, name, base_uom, is_batch_tracked, barcode, status
- `product_uoms` - product_id, uom, factor_to_base (carton = 24 pcs)
- `warehouses` - tenant_id, code, name
- `batches` - tenant_id, product_id, batch_no, expiry_date
- `stock_movements` - **append-only journal.** tenant_id, product_id, warehouse_id,
  batch_id?, qty_base (signed), unit_cost, movement_type (receipt | issue |
  transfer_in | transfer_out | adjustment | opname | cost_correction |
  revaluation), doc_type, doc_id, doc_line_id, effective_at (business date, enables
  D7 backdating), seq (per-key ordering tiebreaker), is_provisional (D6),
  reconciled_by_movement_id?, created_at, created_by. No UPDATE or DELETE, ever -
  enforce with a trigger.
- `stock_levels` - materialized (tenant_id, product_id, warehouse_id, batch_id?) ->
  qty_on_hand, avg_cost, updated transactionally with each posting. Read cache
  only; the journal can rebuild it.

Documents (shared shape: draft -> posted -> cancelled-by-reversal; posted is
immutable, posting writes journal rows atomically in one transaction):

- `purchase_orders` / `purchase_order_lines`
- `goods_receipts` / `goods_receipt_lines` (links PO lines, receives cost)
- `sales_orders` / `sales_order_lines`
- `deliveries` / `delivery_lines` (issues stock, FEFO suggestion for batch goods)
- `stock_transfers` / lines (transfer_out + transfer_in journal pair)
- `stock_adjustments` / lines (waste, damage, corrections)
- `stock_opnames` / lines (count sheet -> variance -> adjustment on post)
- `partners` - suppliers and customers, one table with type flag

Concurrency rule: posting any document takes a Postgres advisory lock per
(tenant_id, product_id, warehouse_id) key set, so journal seq and stock_levels
stay consistent under concurrent posting.

## 4. Costing engines (D3, D6, D7)

- **Weighted average (M1):** running state (qty, avg_cost) folded over the journal
  per key, ordered by (effective_at, seq). Receipts re-average; issues consume at
  current average.
- **FIFO (M2):** layer list derived by folding the same journal; issues consume
  oldest layers. Same interface as average: `Cost(movements) -> valuations`.
- **Negative stock:** issue below zero books at last known cost with
  `is_provisional = true`. A reconciliation worklist surfaces provisional
  movements per tenant. Reconciling receipt posts, then the engine emits
  `cost_correction` movements for the difference. Journal rows are never edited.
- **Backdating:** inserting a movement with an earlier `effective_at` marks
  affected keys dirty; a recompute walks forward from that point and emits
  correction entries where booked costs diverge. This same machinery powers the
  fiscal-year switch (M3): revalue all stock at boundary under the new method and
  post `revaluation` movements.

Testing strategy for this whole section: table-driven fixtures (journal in,
valuations out), golden files for report outputs, and one property test -
`sum(journal qty) == stock_levels qty` for every key after any operation sequence.

## 5. Milestones

### M0 - Foundations (weeks 1-4)

- git init, .gitignore, CI (biome + vitest + go vet/test) - even solo, on a VPS
  target you want a deploy you can trust
- `server/api/openapi.yaml` skeleton + codegen wired both directions
- Migrations tooling, base schema: users/tenants/memberships/sessions, RLS setup
- Auth end-to-end: register, login, session middleware, tenant switcher
- Client shell: login, app layout, tenant context, i18n plumbed

Exit: you can log in, switch tenants, and both codegens run in CI.

### M1 - Pilot (target month 3-4) (D15)

- Catalog: products, UOM conversions, barcodes, batch flag; warehouses; partners
- Journal + stock_levels + posting engine with advisory locks
- Documents: PO -> goods receipt, SO -> delivery, transfers, adjustments, opname
- Gapless document numbering at posting, default template only (D16, ADR-0010)
- Average costing; negative stock allowed with provisional flag + reconciliation
  worklist (manual correction posting is acceptable at this stage)
- Reports: stock on hand, stock card (per-product movement history), stock valuation
- Warehouse screens mobile-first + camera barcode on receive/delivery/opname
- Deploy: Docker compose (app + postgres + caddy) on the VPS, nightly pg_dump
  shipped offsite

Decomposed for parallel development (a contract/schema-freeze step + tracks
around the journal/costing spine) in `plans/m1-parallel.md`. Tracks fork only
after M0 is complete.

Exit / validation gate: one real distributor runs receiving, delivery, and an
opname on it. **If no distributor will pilot at this point, stop building and
start selling - that is the D1 risk coming due.**

### M2 - FIFO + reconciliation hardening

- FIFO engine, tenant costing selection at onboarding (D3 becomes real here)
- Automated cost_correction emission on reconciliation and backdated receipts
- FEFO pick suggestions and expiry reporting for batch products
- Document number template configuration UI, year-rollover activation (D16)

Decomposed for parallel development (3 isolated tracks + a contract-freeze step)
in `plans/m2-parallel.md`. Tracks fork only after the M1 baseline is on `main`.

### M3 - Fiscal-year switch + enterprise polish

- Method switch at fiscal boundary: revaluation run + audit trail (D4)
- Auditor/viewer reporting pack, CSV/Excel exports
- TOTP 2FA, Google sign-in
- Ops: monitoring/alerting, restore drill

## 6. Cross-cutting rules

- RLS on every tenant table; app-layer scoping is primary, RLS is the backstop
- Posted documents and journal rows are immutable; all corrections are new entries
- All money/qty as numeric (Postgres `numeric`), never floats; qty in base units
- Audit: created_by/created_at on all writes; the journal itself is the stock
  audit trail
- i18n from day one (Paraglide id/en already set up); Indonesian is the primary
  UI language for the segment
- No secrets in repo; VPS env via `.env` outside git

## 7. Known risks (accepted)

1. Dual costing engines pre-revenue (D3) - largest self-inflicted scope item;
   mitigated by shared journal interface and M2 deferral.
2. Fiscal-year revaluation (D4) is real accounting machinery - isolated to M3.
3. No customer validation yet - M1 exit gate is the checkpoint.
4. Solo nights pace - anything added to M1 pushes the pilot; scope changes go
   through this file first.
