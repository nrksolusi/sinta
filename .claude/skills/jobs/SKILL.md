---
name: jobs
description: Sinta's work-tracking protocol. Use when filing, starting, working, logging, or closing a job/incident (an SN-#### under docs/jobs/), or when the user says "file a job", "work SN-####", "log this", or asks how work is tracked here. The gate that keeps implementing agents from straying.
---

# Jobs

The gate that keeps work on-scope and traceable. Every unit of work is one
`docs/jobs/wo/SN-####.md` file: handoff (Objective / References / Scope fence /
Acceptance gate) + an append-only `## Log`. Nothing lands without a job trace -
"a change lands with its job file, not just a commit."

**The full protocol is `docs/jobs/README.md` - read it; this skill drives it.**
`docs/reference/CONVENTIONS.md` and the ADRs it cites are the surrounding rules.

## Two hook-enforced rules (do not fight the hooks)

1. **Mint on `main` only.** IDs are one global `SN-####` counter; two worktrees
   grabbing "next" would collide. `_jobs.py new` and a `Write` guard hook refuse
   to create a job under `wo/`/`incidents/` from a `.wt/` worktree. Editing an
   existing job (log/status/branch) from a worktree is fine.
2. **Implement in a worktree, not on `main`.** A `Read` hook reminds when a
   `ready`/`in-progress` job is read on the main checkout. Mint the id on main,
   commit it, then `git worktree add .wt/<slug> -b <type>/<slug>` and work there.

## Filing a job

```bash
python3 docs/jobs/_jobs.py new --type FEAT --title "Add X"   # FEAT|FIX|CHORE|REFACTOR|DOCS|INC - run on main
```

Then fill the body from the template: **Objective** (user-facing outcome),
**References** (link the `../plans/`/`../adr/` thinking - cite, never copy),
**Scope fence** (In scope / Out of scope + stop rule), **Acceptance gate**. Set
front-matter (`lane` BE/FE/Joint, `size`, `risk`, `priority` P0-P2; leave
`branch` empty until start). Then `python3 docs/jobs/_jobs.py gen` and commit the
job file.

## Working a job

1. **Definition of Ready** before coding: every `blocked_by` job is `done`; you
   have read the References and can restate the Scope fence in your own words.
2. **Move to a worktree**, set `status: in-progress` and `branch:`, log `start`.
3. **Test-first** (invoke `/tdd`) - red before green, per CLAUDE.md.
4. **Stay inside the Scope fence.** STOP and escalate (don't improvise) if the
   work seems to need: a frozen-contract change, a migration beyond the blocker's,
   an edit to a generated file (`api-types.ts`, `server/internal/api/`, sqlc
   output, `routeTree.gen.ts`, `src/paraglide/`), "fixing" what an ADR marks
   deliberate, or another job's files.
5. **Log as you go** (append-only, never edit past entries):
   `### 2026-07-23T16:05 · decision` then one line, citing the commit. Kinds:
   `filed · start · progress · decision · blocked · unblocked · handoff · verify ·
   done`. Capture what git can't - intent, dead-ends, why.

## Definition of Done

- Every acceptance box checked.
- Lane gate green - BE: `go build/vet/test ./...`; FE: `pnpm typecheck && pnpm
  test && pnpm lint`, with `pnpm generate-i18n` / `generate-api` clean.
- Test-first evidence in the log; no generated file hand-edited; glossary
  vocabulary honored (`docs/reference/CONTEXT.md`, banned words).
- `status: done`, branch merged (squash), `main` deployable.
- `python3 docs/jobs/_jobs.py gen`; commit the job file with its code.

## Never

- Never hand-edit `BOARD.md` / `INCIDENTS.md` / `JOURNAL.md` - they are generated
  (`_jobs.py gen`).
- Never edit a past `## Log` entry - append a new one.
- Never let work land without a job.

Incidents share the id space under `incidents/` (`--type INC`); operational only -
design-time API gaps stay in `docs/discovery/incidents.md`.
