# Jobs

Load-bearing (referenced from root `CLAUDE.md`). A **job** is one clean unit of
handoff+execution: references, context, workflow, and an append-only log in a
single file an agent can pick up and finish. Goal: log **the work** - intent,
decisions, dead-ends, verification - not just the commit.

**Jobs vs plans.** `../plans/` is *thinking* - design docs, ADR-backed plans, no
handoff. `jobs/` (here) is *doing* - self-contained handoffs that cite those
plans. A job never restates a plan; it links to it.

Start here: the live board is **[BOARD.md](BOARD.md)**.

## In one minute

- One **job file** per unit of work: `wo/SN-####.md`. Front-matter (state) +
  Objective / References / Scope fence / Acceptance gate (the handoff) + an
  append-only `## Log` (history). That file is the source of truth.
- `BOARD.md`, `INCIDENTS.md`, `JOURNAL.md` are **generated** - never edit them.
- Mint and regenerate with the one script (stdlib Python, no deps):
  ```bash
  python3 docs/jobs/_jobs.py new --type FEAT --title "Add X"   # in the main tree
  python3 docs/jobs/_jobs.py gen                               # after editing a job
  python3 docs/jobs/_jobs.py done SN-0007                      # finish + cascade-unblock
  python3 docs/jobs/_jobs.py check                             # report blocking-rule drift
  ```

## Layout

```
docs/jobs/
  README.md        this file — protocol + landing
  BOARD.md    (gen)  job state, sorted by id
  INCIDENTS.md (gen) incident state
  JOURNAL.md  (gen)  every log entry, newest first
  _job.md            job template
  _incident.md       incident template
  _jobs.py           the only script: new | gen | done | check | reconcile | guard | onread
  wo/                SN-####.md   ← the jobs (source of truth)
  incidents/         SN-####.md
```

## IDs

`SN-<NNNN>` - one global, zero-padded, immutable sequence shared by jobs and
incidents (e.g. `SN-0004`). Kind lives in front-matter (`type:`
FEAT/FIX/CHORE/REFACTOR/DOCS; incidents are any `SN-####` under `incidents/`).
`FIX4-04` (in the plans), `ADR-0016`, `INC-1..6` are citations, not ids.

**Minted in the main working tree only.** The sequence is one shared counter, so
two worktrees each grabbing "the next id" would collide. Enforced by:

- **The script** (`_jobs.py new`) refuses to run inside a `.wt/` worktree.
- **A Claude hook** - `.claude/settings.json` runs `_jobs.py guard` on `Write`;
  it blocks creating a new `SN-####.md` under `wo/`/`incidents/` from a worktree.
  Editing an existing job there (log/status/branch) is fine.

Worktree flow: mint on `main`, commit, then branch/rebase the worktree onto it.

**Worked in a worktree, not on main.** The complement to the mint rule: mint the
id on `main`, but do the *implementation* in a worktree under `.wt/`. A
`PostToolUse` Read hook (`_jobs.py onread`) reminds when a `ready`/`in-progress`
job is read from the main checkout - move to a worktree
(`git worktree add .wt/<slug> -b <type>/<slug>`), set the job's `branch`, and log
from there.

## Job file

Front-matter: `id`, `title`, `type`, `status`, `epic` (or `-`), `plan` (link to
the plan it executes, or `-`), `blocked_by` (SN ids or `-`), `lane`
(BE/FE/Joint), `size` (S/M/L), `risk`, `priority` (P0–P2), `branch` (empty until
you start), `created`, `updated`. Body: Objective, References, Scope fence,
Acceptance gate, Log.

**Status:** `backlog → ready → in-progress → in-review → done`, plus `blocked`
(unmet `blocked_by`) and `cancelled`.

## The blocking rule (enforced)

`blocked_by` is not just a label - it gates work. `_jobs.py` is the authority:

- **A job is workable only when `ready`** - i.e. every id in `blocked_by` is
  `done`. A job with an unmet blocker belongs in `blocked` and **must not be
  started**. The `onread` hook refuses it: reading a `blocked` job (on main or in
  a worktree) surfaces a stop message.
- **Finishing cascades.** Mark a job done with
  `python3 docs/jobs/_jobs.py done SN-#### [--note "..."]`. It sets `done`, then
  promotes every dependent whose blockers are now all `done` from `blocked →
  ready` (logging an `unblocked` entry on each). This is the "mark done → unblock
  what it was blocking" step - don't hand-edit statuses for it.
- **`check`** reports drift and exits non-zero (for a pre-commit / CI gate):
  active-but-unmet (should be `blocked`), stale-`blocked` (should be `ready`), and
  done-while-a-blocker-isn't. **`reconcile`** auto-heals the one safe case
  (`blocked → ready` when all blockers are done); the rest need a human decision.
- `done` refuses if the job itself still has an unmet blocker - you can't complete
  what couldn't have been started.

## The gates (what keeps an agent from straying)

- **Definition of Ready** (may start): all `blocked_by` jobs are `done`; the
  agent has read the References and can restate the Scope fence.
- **Scope fence + stop rule:** work only inside *In scope*. **Stop and escalate,
  don't improvise**, if the job seems to need a frozen-contract change, a
  migration beyond what its blocker landed, an edit to a generated file
  (`api-types.ts`, `server/internal/api/`, sqlc output, `routeTree.gen.ts`,
  `src/paraglide/`), "fixing" something an ADR marks deliberate, or another job's
  files.
- **Definition of Done:** every acceptance box checked; lane gate green (BE:
  `go build/vet/test`; FE: `pnpm typecheck/test/lint`, `generate-i18n`/`-api`
  clean); test-first evidence in the log; no generated file hand-edited; glossary
  vocabulary (`../reference/CONTEXT.md`); branch merged, `main` deployable.

## Log entries (append-only)

Never edit a past entry - append a new one:

```
### 2026-07-23T16:05 · decision
Advisory lock keyed on order-line id, not doc id. commit abc1234
```

- Timestamp `YYYY-MM-DD` or `...THH:MM`.
- Kind (fixed): `filed · start · progress · decision · blocked · unblocked ·
  handoff · verify · done`.
- Cite commits/PRs; capture what git can't.

## Incidents

Same id space, in `incidents/`. Front-matter: `id`, `recap`, `status`
(`open → investigating → mitigated → resolved`, or `wontfix`), `related` (fix
job), `introduced` (commit), `created`, `updated`. Mint with
`_jobs.py new --type INC --title "..."`. Operational only - design-time API gaps
(INC-1..6) stay in `../discovery/incidents.md`.

## Workflow

1. **File the job first**, on `main`: `_jobs.py new --type <T> --title "..."`
   (or, for planned work, one already exists - move it to `ready`).
2. **Log as you go**: `start` (set `branch`), a `decision` per non-obvious
   choice, `blocked`/`unblocked` around waits, `verify` with gate results, `done`
   citing the merge commit.
3. **Done** per the Definition of Done above.
4. **Regenerate** (`_jobs.py gen`) and commit the job file with its code.

A one-line chore is still a job - its log can be just `start` + `done`. Nothing
lands without a trace.
