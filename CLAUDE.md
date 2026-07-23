# Sinta

Multi-tenant SaaS inventory management for Indonesian SME distributors.
Go server in `server/`, React client in `client/`. Solo developer, side-project
pace - keep changes small and scoped.

## Read before designing anything

- `docs/README.md` - index of all docs with their status (done / proposed).
- `docs/reference/PLAN.md` - scope, decision record (D1-D16), schema sketch,
  milestones. Scope changes go through this file first.
- `docs/adr/` - rationale for hard-to-reverse decisions. Do not "fix" what an
  ADR says is deliberate.
- `docs/reference/CONVENTIONS.md` - git and naming rules.
- `docs/plans/` - **thinking only**: design docs and ADR-backed plans (fix-*, m*,
  roadmap, catalog). No handoffs here.
- `docs/jobs/README.md` - **jobs protocol (load-bearing).** Executable work is
  handed off as job files `docs/jobs/wo/SN-####.md` (references + scope fence +
  gates + append-only log); `BOARD.md`/`INCIDENTS.md`/`JOURNAL.md` are generated.
  File a job and log the work - not just the commit. See the load-bearing rule
  below.
- `docs/reference/CONTEXT.md` - glossary. Use these exact terms in code, API, and
  UI; respect the avoid-lists. Extended version with relationships and flagged
  ambiguities: `docs/reference/UBIQUITOUS_LANGUAGE.md`.
- `docs/discovery/` + `docs/plans/` - active planning. Before assuming a missing
  server capability, check `docs/discovery/incidents.md` (known API gaps
  INC-1..6). Newest slices: `plans/fix-3-lifecycle-and-slice-a.md`,
  `plans/fix-4-ui-ux-revamp.md`, `plans/tenant-configurability-catalog.md`
  (decisions in ADR-0013..0020; proposed, not yet built - do not assume the code
  exists).

## Load-bearing rules

- Work is tracked per `docs/jobs/README.md`; invoke the **`jobs` skill** (`.claude/skills/jobs`)
  when filing, working, logging, or closing a job - it drives this protocol.
  Before writing code, mint a job
  with `python3 docs/jobs/_jobs.py new --type <TYPE> --title "..."` (ids are a
  global `SN-####` sequence; job files live in `docs/jobs/wo/`). Jobs/incidents
  may only be created in the **main working tree**, never a `.wt/` worktree - a
  `.claude/settings.json` PreToolUse hook enforces this. Keep an append-only
  `## Log` of the actual work - decisions, dead-ends, verification, hand-offs -
  citing commits rather than restating diffs; set the job's `branch`. Mint ids on
  main, but do the implementation **in a worktree** under `.wt/` - a PostToolUse
  Read hook reminds when a `ready`/`in-progress` job is read on the main checkout.
  `BOARD.md`/`INCIDENTS.md`/`JOURNAL.md` are generated - never hand-edit them; run
  `python3 docs/jobs/_jobs.py gen`. A change lands with its job file, not just a
  commit. Plans in `docs/plans/` are the thinking a job cites - never a handoff.
- `docs/jobs/_jobs.py` command surface and when to trigger each (invoke the
  `jobs` skill, or run directly):
  - `new --type <T> --title "..."` - file a job. Run on **main**, before writing
    any code for it.
  - `gen` - regenerate `BOARD.md`/`INCIDENTS.md`/`JOURNAL.md`. Run after **any**
    hand-edit to a job file (status, `branch`, a `## Log` entry). Those three
    files are generated - never hand-edit them.
  - `done SN-#### [--note "..."]` - run when a job's acceptance gate + lane gate
    are green. Sets `done`, appends the log entry, and **cascade-unblocks**
    dependents (`blocked → ready`). Never hand-set `status: done` - that skips the
    cascade.
  - `check` - report blocking-rule drift (exit 1 if any). Run before committing
    job changes, or whenever the board looks off.
  - `reconcile` - auto-promote `blocked → ready` where all blockers are done
    (heals manual drift). The unsafe cases stay for `check` to surface.
  - `guard` (PreToolUse/Write) and `onread` (PostToolUse/Read) are **internal
    hooks** wired in `.claude/settings.json` - never run them by hand.
  Blocking rule the tooling enforces: a job is workable only when its status is
  `ready` (every `blocked_by` is `done`); a `blocked` job cannot proceed, and the
  `onread` hook refuses to let one be started.
- The `stock_movements` journal is append-only and the sole source of truth
  for stock. Never update or delete journal rows; corrections are new entries
  (ADR-0001, ADR-0003).
- Every tenant-owned table carries `tenant_id` with an RLS policy. A new table
  without one is a security bug (ADR-0004).
- Quantities and money are Postgres `numeric`, never floats; quantities are
  stored in base units.
- API is spec-first: edit `server/api/openapi.yaml` + `server/api/paths/*.yaml`
  (the source), then run `go generate ./...` in server/ (bundles to
  `openapi.gen.yaml` via `cmd/bundle`, then oapi-codegen + sqlc) and
  `pnpm generate-api` in client. Never edit generated files (`openapi.gen.yaml`,
  `api-types.ts`, `routeTree.gen.ts`, `src/paraglide/`, `server/internal/api/`,
  sqlc output in `server/internal/store/` - the `queries/*.sql` files are the
  hand-written source).
- Migrations: goose format in `server/migrations/`, applied with
  `go run ./cmd/migrate up`; sqlc reads the same files as schema.
- Primary keys are UUIDv7 everywhere (ADR-0009). Document numbers are a
  separate, human-facing concept assigned at posting (ADR-0010).
- Posted documents and journal rows are immutable; corrections are new
  (reversal) documents. A draft is the one deletable state (ADR-0013). Lifecycle
  extensions - approval gate (ADR-0015), order cancellation as a terminal
  `cancelled` status rather than a reversal (ADR-0018) - are proposed in
  fix-3/fix-4; treat as not-yet-built until the code exists.
- Locale: the default UI message language is Indonesian (Paraglide `baseLocale`
  is `id`, `messages/`); English exists as an alternate locale, no switcher yet.
  Numbers, currency, and numeric dates use the Indonesian region format
  regardless of UI language - `id-ID`, `IDR`. Month and day names follow the
  active UI language, because they read as words. Format only through
  `client/src/lib/format.ts`; do not call `toLocaleString`, `Intl.*`, or pass a
  locale ad hoc at call sites.
- Industry terms in messages: for an English-origin domain/technical term, do
  not translate reflexively. Check what Indonesian practitioners in this
  industry actually say, and use that form - which is often the English term
  kept as-is (e.g. `Weighted Average`, `FIFO`, both standard in Indonesian
  accounting per PSAK 14 and local tools). Translate only when the Indonesian
  word is the genuinely native usage. When unsure, search before deciding.
- Banned vocabulary: ledger, workspace, organization, stocktake, item.
  See the glossary for the canonical terms.
- Client UI stack (docs/reference/PLAN.md stack decision): interactive primitives come
  from shadcn components in `client/src/components/ui` - generate the component
  (`pnpm dlx shadcn@latest add <name>`) instead of hand-rolling styled
  `<input>`/`<select>`/`<table>` elements. Forms go through TanStack Form; data
  lists and reports go through TanStack Table. Retrofit of pre-existing screens
  is tracked in `docs/plans/fix-1-ui-stack-retrofit.md`; layout and visual
  design (app shell, page templates, prototypes) in
  `docs/plans/fix-2-ui-redesign.md`. Frozen component prop contracts and UI
  design principles (incl. progressive disclosure - peek linked documents inline,
  prefer collapsibles over cramming the screen) live in
  `docs/design/ui-design-principles.md`; build new UI to those contracts.

## Workflow

- All feature implementation is test-first: invoke the /tdd skill before
  writing implementation code. Red-green-refactor; no production code without
  a failing test first. Applies to domain logic, handlers, and client logic;
  not to config, migrations scaffolding, or generated code.
- Client gate before merge: `pnpm typecheck && pnpm test && pnpm lint`. After any
  change or merge touching `messages/id.json`/`en.json`, run `pnpm generate-i18n`
  first - Paraglide output is gitignored and goes stale, which breaks typecheck
  with confusing missing-message errors.
- All work implementation uses git worktrees under `.wt/` (see load-bearing rule
  and global rules). Mint job ids on main, then switch to a worktree to
  implement. The only recurring merge conflicts are the additive
  `messages/*.json` and the generated `client/src/routeTree.gen.ts` (take
  theirs, then `pnpm generate-routes`).

## Git

- Trunk-based: `main` always deployable, short-lived `type/short-slug`
  branches (feat, fix, chore, refactor, docs), squash merge only.
- Conventional Commits on main, types matching branch prefixes. This
  deliberately overrides the global plain-imperative preference.

## Commands

Client (run in `client/`, pnpm):

- `pnpm dev` - dev server on :3000
- `pnpm lint` / `pnpm lint:fix` - Biome
- `pnpm typecheck` - tsc
- `pnpm test` - vitest
- `pnpm generate-api` - client types from the OpenAPI spec
- `pnpm generate-i18n` - Paraglide message compilation (id/en)

Server (run in `server/`): standard Go tooling - `go build ./...`,
`go test ./...`, `go vet ./...`.
