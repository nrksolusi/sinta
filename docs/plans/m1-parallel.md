# M1 - Parallel development plan

> **Status: Done - shipped to `main`.** M1 is complete; this is the historical
> build plan, kept for reference.

Decomposition of Milestone 1 (see `../reference/PLAN.md` §5) into tracks a solo developer
can build concurrently using parallel agents in separate git worktrees.

Unlike M2, M1 is a foundation, not a set of independent features. Everything
stock-related is derived from the journal, so there is a real critical path:
the journal + posting + costing spine must exist (as frozen interfaces) before
Documents and Reports can integrate. The parallelism is real but bounded by
that spine. Be honest about it: this is fan-out around a core, not six
embarrassingly-parallel features.

Executor model: solo developer, parallel agents, one worktree per track.

Prerequisite: M0 must be complete (auth, tenant switching, codegen in CI,
`../reference/PLAN.md` M0 exit criteria met).

## Track 0 - Contracts, schema, and interfaces (spine PR, merges before the fork)

M1's biggest collision source is the database schema: it is a single ordered,
FK-linked, RLS-governed resource that nearly every track touches. So Track 0 is
heavier than M2's: it freezes the whole M1 schema plus the Go domain interfaces,
so downstream tracks build against stable contracts instead of each other.

Frozen and merged before any track branches:

1. **Full M1 schema** - one migration wave for all core tables: `products`,
   `product_uoms`, `warehouses`, `batches`, `partners`, `stock_movements`
   (with the append-only trigger), `stock_levels`, and every document table
   (`purchase_orders`/lines, `goods_receipts`/lines, `sales_orders`/lines,
   `deliveries`/lines, `stock_transfers`/lines, `stock_adjustments`/lines,
   `stock_opnames`/lines). Every tenant-owned table gets `tenant_id` + an RLS
   policy in this PR (ADR-0004); a table without one is a security bug.
2. **Go domain interfaces as frozen signatures** (compile with stub/minimal
   bodies): the `Movement` type, `Cost(ordered []Movement) -> []Valuation`
   (ADR-0002), the posting-engine interface (`Post(ctx, doc) -> movements`
   shape, advisory-lock contract), and the store repository interfaces. This is
   what lets Documents and Reports build in parallel with the journal/costing
   implementation.
3. **OpenAPI split via a bundler**, so each track owns its own spec file. Note:
   oapi-codegen does not generate schemas from external `$ref` files (verified
   in Track 0), so a plain cross-file `$ref` split does not work for the Go
   side. Instead `server/cmd/bundle` deep-merges the sources into a flat,
   committed `api/openapi.gen.yaml` that both oapi-codegen and openapi-typescript
   consume (`go generate ./...` runs the bundle first):
   - `api/openapi.yaml` - root plus shared components (Error, responses, Role)
   - `api/paths/catalog.yaml` (Track A)
   - `api/paths/documents.yaml` (Track C)
   - `api/paths/reports.yaml` (Track D)

   Fragments own their paths and schemas and may reference shared root
   components (e.g. `#/components/responses/Unauthorized`); the reference
   resolves after the merge. The bundler fails on a duplicate path or a
   conflicting component name, so cross-track collisions surface at generate
   time, not in production.
4. **Migration range map** for additive migrations a track discovers it needs
   after the freeze (preserves the `NNNN_name.sql` convention):

   | Range | Owner |
   |-------|-------|
   | `0002-00xx` | Track 0 (M1 core schema) |
   | `0100-0199` | Track A (Catalog) |
   | `0200-0299` | Track B (Journal/costing) |
   | `0300-0399` | Track C (Documents) |

## The parallel tracks

After Track 0, tracks own domain logic, handlers, queries, and client screens -
not schema. All stock logic is test-first (CLAUDE.md /tdd rule).

### Track A - Catalog and partners

Products, UOM conversions, barcodes, batch flag, warehouses, partners.
Independent of the journal; can start immediately after Track 0.

- Server: `internal/domain` catalog logic, `store/queries/{products,warehouses,
  partners}.sql`, handlers, `api/paths/catalog.yaml`.
- Client: catalog CRUD screens.
- Test gate: catalog CRUD, UOM factor-to-base conversion, `unique(tenant_id,
  sku)` enforcement.

### Track B - Journal, costing, and reconciliation (critical path)

The load-bearing spine. Posting engine with advisory locks, `stock_levels`
maintenance, average costing engine, negative-stock provisional flag, and the
reconciliation worklist (manual correction posting acceptable at M1).

- Server: `internal/domain/journal`, `internal/domain/costing`, posting
  transaction + advisory locks, migrations `0200-0299`.
- Test gate: table-driven costing fixtures (journal in, valuations out), golden
  files, the property test `sum(journal qty) == stock_levels qty` per key,
  advisory-lock concurrency test, provisional/reconciliation tests.

### Track C - Documents and posting flows (depends on B interface + A tables)

The six document types (PO -> goods receipt, SO -> delivery, transfers,
adjustments, opname) with the draft -> posted lifecycle, plus gapless document
numbering at posting with the default template (D16, ADR-0010). Builds against
Track B's frozen posting interface and Track A's catalog tables; integrates as B
lands.

- Server: document domain logic, posting orchestration, numbering module,
  handlers, migrations `0300-0399`, `api/paths/documents.yaml`.
- Client: document entry screens.
- Test gate: per-document posting (draft -> posted, posted is immutable),
  gapless-numbering-under-concurrency, reversal document tests.

### Track D - Reports (depends on B interface)

Stock on hand, stock card (per-product movement history), stock valuation.
Read-only; parallel to Track C once B's interfaces are frozen.

- Server: report queries over journal/`stock_levels`/costing, `api/paths/
  reports.yaml`.
- Client: report screens.
- Test gate: golden files for each report.

### Track E - Warehouse UX and PWA (downstream of C)

Mobile-first receive/delivery/opname screens + camera barcode
(`BarcodeDetector` with JS fallback), PWA manifest. Builds UI shells against the
frozen OpenAPI document slice; wires up as Track C's endpoints land.

- Client: mobile-first warehouse screens, barcode component, PWA manifest.
- Test gate: component tests, `BarcodeDetector` fallback path.

### Track F - Deploy (fully independent)

Docker compose (app + postgres + caddy) on the VPS, nightly `pg_dump` shipped
offsite. No dependency on any domain track; can run start to finish alongside
everything.

- Compose files, caddy config, backup cron.
- Test gate: `compose up` smoke test, one `pg_dump` restore drill.

## Dependency graph

```
M0 complete
     |
 Track 0 (schema + interfaces + OpenAPI split)
     |
     +--------------------+--------------------+--------+
     |          |         |                    |        |
     A          B         F              (B interfaces frozen)
  Catalog   Journal/    Deploy                 |        |
     |      costing        |                   C        D
     |      (crit. path)   |               Documents  Reports
     |          |          |                   |
     |          +----------+-------------------+
     |                     |
     |                     E  Warehouse UX (after C endpoints)
     |                     |
     +---------------------+
                 |
         M1 pilot exit gate
```

Critical path: Track 0 -> B -> C -> E. A, D, F run alongside. B's value is
front-loaded: freezing its interfaces in Track 0 is what unblocks C and D.

## Integration strategy

- Each track is a short-lived branch off `main`, rebased before merge, squash
  merged (`../reference/CONVENTIONS.md`, trunk-based).
- `main` stays building at every merge; M1 is pre-pilot so feature-gating is not
  required, but no track merges with red CI.
- Merge order: Track 0 first. A and F any time. B before C integrates. D after
  B's interfaces land. E after C's endpoints land.
- Final integration check before the pilot gate: run the property test on the
  average engine across a full receive -> deliver -> transfer -> opname sequence.

## Risks

1. Track B is the critical path and the source of most correctness risk
   (journal, advisory locks, provisional costing). Front-load it; a slip here
   slips C, D, and E.
2. Schema drift: if a track needs a schema change outside Track 0's freeze, it
   stops and Track 0 is reopened as a small additive migration PR (using the
   track's reserved range) before work resumes. Tracks never edit another
   track's OpenAPI slice or migration range.
3. This milestone gates the pilot. Per `../reference/PLAN.md` M1 exit: if no distributor
   will pilot, stop building and start selling (D1 risk).
