# Handoff - fix-2 UI redesign

## TL;DR
The fix-2 UI redesign is **functionally complete for M1 and merged to `main`**.
All six plan phases (F2.1-F2.6) are done and their checkboxes are ticked in the
plan. 198 client tests green, typecheck/build/lint clean at time of handoff.
Remaining work is either plan-designated M2 or gated on three small server
changes - all documented. A fresh agent's most useful next step is the
INC-1/2/3 server additions (they finish already-built-but-dormant UI).

## What was built (do not rebuild - reference these)
- Plan & phase status: `docs/plans/fix-2-ui-redesign.md` (F2.1-F2.6 all `[x]`).
- Design north-star with the FROZEN shared-component prop contracts (section D):
  `docs/plans/fix-2-ui-design-principles.md`. Build any new UI to these props.
- Work allocation / dependency waves: `docs/plans/fix-2-ui-worktree-allocation.md`.
- The code is on `main`. 45 route files under `client/src/routes/_authed/`
  (purchases/receipts, purchases/orders, sales/deliveries, sales/orders,
  stock/{transfers,adjustments,opnames}, reports/{stock-on-hand,stock-card,
  valuation}, catalog/{products,partners,warehouses}.$id, dashboard at index).
  Legacy `/receive` `/delivery` `/opname` are redirects.
- Shared components in `client/src/components/`: record-shell, doc-list,
  status-badge, empty-state, confirm-dialog, product/partner/warehouse-combobox,
  line-grid, scanner-dialog; app shell in `client/src/components/shell/`.
- Theme tokens/fonts in `client/src/styles.css` (primary→near-black,
  `--warning`/`--success` added, Geist Sans UI font).

## What is NOT done (deliberate, documented)
- `docs/discovery/fix-2-deferred-scope.md` - the two categories:
  A) M2 features (printing/surat-jalan, numbering UI, approval gate, backorder,
     Excel, invoicing) - UI slots reserved.
  B) API-blocked affordances → `docs/discovery/incidents.md` INC-1/2/3.
- `docs/discovery/incidents.md` - six API gaps (INC-1 draft-delete, INC-2
  document lifecycle timestamps/actor, INC-3 opname `systemQty`, INC-4 PO/SO
  fulfillment rollup, INC-5 list filter/pagination, INC-6 product search).
  INC-1/2/3 are M1 severity and small; INC-4/5/6 are `scale`.

## Suggested next task (if continuing)
Implement INC-1/2/3 server-side, spec-first (CLAUDE.md rule: edit
`server/api/openapi.yaml`, then `go generate .` in server/ and
`pnpm generate-api` in client - never edit generated files). Each unlocks
existing client plumbing:
- INC-1: `DELETE /{document}/{id}` allowed only while `status=draft` → wire the
  already-present `onDelete`/delete-confirm props to show "Hapus draf".
- INC-2: add created/posted/reversed timestamps + actor to document responses →
  RecordShell timeline shows actor+time (client already reads what's available).
- INC-3: capture+return opname line `systemQty` → posted opname renders the
  berita acara variance instead of counts+links.
Note there is no `formatDateTime` in `client/src/lib/format.ts` yet; INC-2's UI
polish (minute-precision timeline) needs one added there (format via that file
ONLY per CLAUDE.md).

## Process notes / conventions used this session
- Parallel worktrees under `.wt/`, one per task, branch `feat/ui-revamp-<name>`,
  squash/merge to `main`, then `git worktree remove` + delete branch. All 16 UI
  worktrees/branches are already cleaned up.
- Integration conflicts were only ever `messages/en.json`+`id.json` (additive
  union) and `client/src/routeTree.gen.ts` (regenerate). Resolution routine that
  worked every time:
  - messages: `perl -0777 -i -pe 's/<<<<<<< HEAD\n//g; s/\n=======\n/,\n/g; s/>>>>>>> [^\n]*\n//g'` on both files, then validate with `node -e "JSON.parse(...)"`.
  - routeTree: `git checkout --theirs src/routeTree.gen.ts` then `pnpm generate-routes`.
  - After any messages merge in the main worktree, run `pnpm generate-i18n`
    before `pnpm typecheck` (paraglide output is gitignored and goes stale).
- Gate per branch and on main: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
- Pre-existing lint noise: 2 warnings + 2 infos in `main.tsx`/`barcode-scanner.tsx`
  are NOT from this work; `pnpm lint` still exits 0.

## Concurrency warning (important)
A SEPARATE workstream has been committing to `main` in parallel during this
session - a server config/env refactor (`chore(config): load runtime config
from a single root .env`, commit `e07efd2`) and a remote sync (`bb17748 Merge
remote-tracking branch 'origin/main'`). These are NOT part of the UI work and
were left untouched. Before starting, run `git pull`/`git status` and expect
`main` to have moved; do not assume the UI commits are the tip.

## Suggested skills
- `/tdd` - CLAUDE.md mandates test-first for all feature/handler/domain work
  (including the INC-1/2/3 server changes). Invoke before writing impl.
- `/code-review` - review the fix-2 changes on `main` since branch point for a
  standards + spec pass before further build-out.
- `/verify` or `/run` - smoke-test the new nav and a document flow in the
  browser (`pnpm dev`); nothing in this session was manually run in-app.
- `tanstack-form` / `tanstack-router` / `tanstack-table` - reference skills for
  the client stack if extending any screen.
- `/security-review` - before shipping, given new document-mutation flows.
