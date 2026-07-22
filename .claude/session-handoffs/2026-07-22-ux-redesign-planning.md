# Handoff - UX redesign planning session (stack drift, fix-1, fix-2)

Companion doc: `fix-2-ui-revamp.md` in this directory covers the LATER
implementation of the plans produced here. Read that one first if you are
continuing build-out; read this one for why the plans exist and what this
planning session still leaves open.

## TL;DR
This session diagnosed why the client drifted off the agreed UI stack, added a
load-bearing CLAUDE.md rule to stop it recurring, wrote the retrofit plan
(fix-1) and the full UX redesign plan (fix-2, rewritten once after user
critique), and committed them to `main` as `8ba070d`. The fix-2 plan has since
been IMPLEMENTED by a parallel workstream (see companion handoff) - do not
re-plan or re-implement it. The open item from this session is the
`feat/tenant-default-warehouse` branch, still unmerged.

## What this session produced (reference, do not duplicate)
- `CLAUDE.md` - new "Client UI stack" load-bearing rule: primitives via
  generated shadcn components only, forms via TanStack Form, lists/reports via
  TanStack Table, no hand-rolled styled inputs/selects/tables.
- `docs/plans/fix-1-ui-stack-retrofit.md` - stack drift retrofit; its steps are
  absorbed into fix-2's implementation phases (noted in the file).
- `docs/plans/fix-2-ui-redesign.md` - the master UX redesign: decisions
  UX-D1..UX-D11, route map, foundations, shared components, ASCII prototypes,
  vocabulary table, API gaps, phases F2.1-F2.6. Grounded in research on Odoo,
  ERPNext, Indonesian competitors (Accurate, Jurnal, Kledo), and interaction
  patterns (NN/g, SAP Fiori). All phases are now marked complete on `main`.

## Context a fresh agent should know (not in the artifacts)
- The user rejected fix-2 v1 hard: it reskinned flawed flows instead of
  redesigning information architecture and workflow. The v2 approach that
  landed: research first, document outputs/artifacts of every operation (opname
  produces a report, receipt produces an invoice-like record, adjustment
  produces an approval artifact), link every record to its detail page, use
  search comboboxes for heavy pickers. Apply the same bar to any future UI work.
- The user prefers direct answers and decisions in chat over AskUserQuestion
  prompts.
- The server already implements the full document lifecycle for all 7 document
  types plus reports; most "new UI" work is exposing existing API, not new
  server scope. Check `client/src/lib/api-types.ts` before assuming a gap, then
  `docs/discovery/incidents.md` for the known real gaps (INC-1..INC-6).

## Open work from this session
- `feat/tenant-default-warehouse` is 2 commits ahead of `main`:
  `2cd97dc` (pin docker compose project name, expose vite dev host) and
  `2a701ae` (serve dev over https for mobile camera access). The branch's other
  three commits already reached `main` through other branches. Rebase onto
  current `main` before merging; expect the branch's older duplicated commits
  to drop out. The user had uncommitted edits to `client/vite.config.ts` and
  `docker-compose.yml` related to this - check `git status` before touching
  those files.
- Next build tasks are in the companion handoff: INC-1/2/3 server changes,
  spec-first (`server/api/openapi.yaml`, then `go generate .` and
  `pnpm generate-api`).

## Suggested skills
- `/tdd` - mandatory (CLAUDE.md) before any feature, handler, or domain
  implementation code, including the INC server changes.
- `/code-review` - if reviewing merged fix-2 work; pin the fixed point at
  `8ba070d` (where the plans landed) for a plan-vs-implementation spec pass.
- `/domain-modeling` - if new terms surface while building the deferred M2
  artifacts (surat jalan, berita acara); the glossary avoid-list is binding
  (banned: ledger, workspace, organization, stocktake, item).
