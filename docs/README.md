# Sinta docs

Index of all project documentation and its status. Sinta is multi-tenant SaaS
inventory management for Indonesian SME distributors (Go `server/`, React
`client/`).

## Folder pattern

| Folder | Holds | Mutability |
|--------|-------|-----------|
| `reference/` | The living canon: scope, conventions, glossary. Always current. | Living - edit as scope evolves |
| `adr/` | Architecture Decision Records - one hard-to-reverse decision each. | Append-only; supersede, don't rewrite |
| `design/` | Living design system / UI build contracts. | Living |
| `discovery/` | Raw evidence and gap logs (interviews, PRDs, incidents). | Point-in-time; append notes |
| `plans/` | **Thinking**: design docs and build plans. No handoffs. Each carries a Status banner. | Status changes as work ships |
| `jobs/` | **Doing**: executable handoffs (`wo/SN-####.md`) + generated board/journal. See [jobs/README.md](jobs/README.md). | Append-only log; state in front-matter |

Rule of thumb: a **decision** goes in `adr/`; a **plan to build it** goes in
`plans/`; the **executable handoff of that plan** goes in `jobs/`; the
**evidence behind it** goes in `discovery/`; **standing rules** go in
`reference/` or `design/`.

## Status legend

`Living` (always current) · `Accepted` / `Implemented` (decided and built) ·
`Proposed` (decided, not built) · `Done` (shipped to `main`) ·
`Superseded` (folded into a newer doc) · `Evidence` (raw discovery).

## reference/

| Doc | Status |
|-----|--------|
| [PLAN.md](reference/PLAN.md) - scope, decisions D1-D16, schema sketch, milestones | Living |
| [CONVENTIONS.md](reference/CONVENTIONS.md) - git + naming rules | Living |
| [CONTEXT.md](reference/CONTEXT.md) - glossary (canonical terms + avoid-lists) | Living |
| [UBIQUITOUS_LANGUAGE.md](reference/UBIQUITOUS_LANGUAGE.md) - extended glossary | Living |

## adr/

`0001-0012` Accepted/implemented (M0/M1). `0013-0020` Proposed (fix-3/fix-4,
not yet built). `0002` accepted but FIFO half pending M2.

| ADR | Status |
|-----|--------|
| 0001 append-only journal · 0003 negative-stock provisional · 0004 shared-schema RLS · 0005 flat tenants · 0006 in-house auth · 0007 spec-first, no framework/ORM · 0008 no accounting ledger · 0009 UUIDv7 · 0010 gapless doc numbers · 0011 smart form defaults · 0012 soft-cap activation | Accepted - implemented |
| 0002 dual costing engines | Accepted - WAC built, FIFO pending M2 |
| 0013 draft deletion · 0014 opname systemQty · 0015 approval gate · 0016 fulfillment + over-receipt · 0017 receiving cost · 0018 order cancellation · 0019 read-query contract · 0020 line-heavy form wizard | Proposed |

## design/

| Doc | Status |
|-----|--------|
| [ui-design-principles.md](design/ui-design-principles.md) - UI build north-star + frozen component prop contracts | Living |

## discovery/

| Doc | Status |
|-----|--------|
| [wms-discovery-notes.md](discovery/wms-discovery-notes.md) - Head-of-Warehouse interview (bigger-company WMS) | Evidence - out of current scope |
| [wms-prd.md](discovery/wms-prd.md) - WMS PRD derived from the notes | Evidence - out of current scope |
| [incidents.md](discovery/incidents.md) - API gaps INC-1..6 | INC-1/2/3 -> fix-3; INC-4/5/6 -> fix-4 |
| [fix-2-deferred-scope.md](discovery/fix-2-deferred-scope.md) - what fix-2 deliberately did not build | Reference |

## plans/ - thinking

Design docs and ADR-backed plans. No handoffs here; jobs cite these.

| Plan | Status |
|------|--------|
| [m1-parallel.md](plans/m1-parallel.md) - M1 build decomposition | Done |
| [fix-1-ui-stack-retrofit.md](plans/fix-1-ui-stack-retrofit.md) - shadcn/TanStack retrofit | Done |
| [fix-2-ui-redesign.md](plans/fix-2-ui-redesign.md) - UX redesign (F2.1-F2.6) | Done |
| [fix-2-ui-worktree-allocation.md](plans/fix-2-ui-worktree-allocation.md) - fix-2 work allocation | Done |
| [fix-3-lifecycle-and-slice-a.md](plans/fix-3-lifecycle-and-slice-a.md) - INC-1/2/3, approval, printing, numbering UI | Proposed |
| [fix-4-ui-ux-revamp.md](plans/fix-4-ui-ux-revamp.md) - AppShell/orders revamp; folds INC-4/5/6 | Proposed |
| [fix-4-sprint-plan.md](plans/fix-4-sprint-plan.md) - fix-4 BE/FE sprint + parallelization | Proposed |
| [tenant-configurability-catalog.md](plans/tenant-configurability-catalog.md) - configurable-surface catalog | Proposed (reference) |
| [m2-m3-roadmap.md](plans/m2-m3-roadmap.md) - unified M2/M3 sequencing | Proposed |
| [m2-parallel.md](plans/m2-parallel.md) - original M2 decomposition | Superseded by the roadmap |

## jobs/ - doing

Executable handoffs. Each `wo/SN-####.md` is one self-contained job - references,
scope fence, gates, and an append-only log. Protocol + gates:
[README.md](jobs/README.md). State views (generated): [BOARD.md](jobs/BOARD.md) /
[INCIDENTS.md](jobs/INCIDENTS.md) / [JOURNAL.md](jobs/JOURNAL.md). Mint with
`python3 docs/jobs/_jobs.py new --type <TYPE> --title "..."`; regenerate with
`python3 docs/jobs/_jobs.py gen`. Jobs are minted in the main tree only (Claude
hook enforced). Currently seeded: fix-4 jobs `SN-0001`..`SN-0011`.
