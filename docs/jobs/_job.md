<!-- Template. Mint via `python3 docs/jobs/_jobs.py new --type <TYPE> --title "..."` (preferred). -->
---
id: SN-NNNN
title: <one-line name>
type: FEAT
status: backlog
epic: -
plan: -
blocked_by: -
lane: -
size: -
risk: -
priority: -
branch:
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

## Objective

<What this delivers, from the user's perspective.>

## References

<Links to the plan / ADRs this executes. The thinking lives in ../plans/ and
../adr/ — cite it, don't copy it.>

## Scope fence

**In scope** - <what to touch>

**Out of scope** - <what not to touch; STOP and escalate if the work needs it>

## Acceptance gate

- [ ] <criterion>
- [ ] Lane gate green (BE: `go build/vet/test`; FE: `pnpm typecheck/test/lint`)

## Log

### YYYY-MM-DD · filed
<Why this job exists; blockers if any.>
