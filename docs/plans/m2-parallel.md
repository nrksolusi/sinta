# M2 - Parallel development plan

> **Status: Superseded.** Predates fix-3/fix-4 and ADR-0013..0020. Folded into
> the unified roadmap - see `m2-m3-roadmap.md`. Kept for its track-decomposition
> detail (FIFO, reconciliation).

Decomposition of Milestone 2 (see `../reference/PLAN.md` §5) into isolated tracks that a
solo developer can build concurrently using parallel agents in separate git
worktrees. The goal is true concurrency: tracks must have near-zero file
overlap and frozen contracts before they fork, because worktree agents cannot
negotiate merges mid-flight.

Executor model: solo developer, parallel agents, one worktree per track.

## Prerequisite gate (hard dependency)

Tracks cannot fork until an M1 baseline is merged to `main`. Every track builds
on M1 artifacts that do not exist yet:

- `internal/domain/costing` with the frozen `Cost(ordered []Movement) ->
  []Valuation` interface plus the **average** engine. Track A's FIFO engine
  implements the same interface.
- `stock_movements` journal, posting engine with advisory locks, `stock_levels`,
  and the backdating-recompute hook. Track A's corrections attach here.
- `products.is_batch_tracked`, `batches`, and the delivery/picking flow. Track B
  builds on these.
- Posting-time gapless numbering with the **default** template (ADR-0010).
  Track C's config UI builds on this.

If M1 is not on `main`, this plan does not start.

## Track 0 - freeze contracts (one small PR, merges before the fork)

This is what makes worktree parallelism safe. Three contracts are frozen and
merged before any track branches:

1. **Costing interface signature** - `Cost(ordered []Movement) -> []Valuation`,
   with `movement_type` already including `cost_correction` and `revaluation`
   (PLAN §3). Both engines conform; Track A never changes the signature.
2. **OpenAPI ownership** - split the single `server/api/openapi.yaml` into
   per-domain files referenced via `$ref`, so each track edits its own file and
   never collides on the shared `paths:`/`components:` blocks:
   - `api/paths/costing.yaml` (Track A)
   - `api/paths/picking.yaml` (Track B)
   - `api/paths/numbering.yaml` (Track C)
   - shared `api/components/` for reused schemas
3. **Migration range map** - reserve non-overlapping numeric ranges so no two
   tracks grab the same migration number. Preserves the existing
   `NNNN_name.sql` convention:

   | Range | Owner |
   |-------|-------|
   | `0002-00xx` | M1 baseline |
   | `0100-0199` | Track A (Costing) |
   | `0200-0299` | Track B (Batch/expiry) |
   | `0300-0399` | Track C (Numbering) |

## The three parallel tracks

Owned surfaces do not overlap; that is the invariant that lets the tracks run
concurrently.

### Track A - Costing (M2 items 1 + 2)

FIFO engine, tenant costing selection, and automated `cost_correction` emission
on reconciliation and backdated receipts. FIFO and correction emission stay
fused in one track: both live in the costing domain and drive the same
journal-recompute path, so splitting them would put two agents in the same
files. This is the D3 "doubled test surface" - one owner, reviewed hardest.

- Server: `internal/domain/costing/*`, journal-recompute code, migrations
  `0100-0199`, `api/paths/costing.yaml`.
- Client: costing-method onboarding screen.
- Test gate: table-driven fixtures (journal in, valuations out), golden files
  for report output, and the property test `sum(journal qty) == stock_levels
  qty` extended to the FIFO engine.

### Track B - Batch and expiry (M2 item 3)

FEFO pick suggestions and expiry reporting for batch products.

- Server: picking-suggestion logic, batch queries, expiry report, migrations
  `0200-0299`, `api/paths/picking.yaml`.
- Client: pick-suggestion UI, expiry report screen.
- Test gate: FEFO ordering tests, expiry-report golden files.

### Track C - Numbering (M2 item 4)

Document-number template configuration UI and year-rollover activation (D16,
ADR-0010).

- Server: template/numbering module, migrations `0300-0399`,
  `api/paths/numbering.yaml`.
- Client: template config screens.
- Test gate: template-render tests, year-rollover activation test.

## Integration strategy

- Each track is a short-lived branch off `main`, rebased before merge, squash
  merged (per `../reference/CONVENTIONS.md`, trunk-based).
- `main` stays deployable throughout:
  - FIFO merges dark - it is opt-in per tenant via `costing_method`, so no
    tenant sees it until they select it.
  - Corrections are additive to the append-only journal.
  - The numbering config UI ships gated on the year rollover.
- Merge order is free: no track depends on another's internals. Review Track A
  hardest (D3 risk).
- Final integration check: run the property test against both costing engines
  after all three tracks land.

## Sequencing

```
M1 baseline on main
        |
   Track 0 (freeze contracts)
        |
   +----+----+----+
   |    |    |
   A    B    C      (parallel worktrees)
   |    |    |
   +----+----+----+
        |
   integration check (property test, both engines)
```

## Risks

1. Track A is the concentration of D3 risk (two engines, one test surface).
   Mitigated by fusing FIFO and corrections under one owner and the shared
   `Cost` interface.
2. Contract drift: if a track needs an OpenAPI or migration change outside its
   frozen slice, it stops and Track 0 is reopened as a small PR before work
   resumes. Tracks never edit another track's slice.
3. M1 slippage pushes the whole fork. The prerequisite gate is real, not
   advisory.
