# Sinta

Multi-tenant SaaS inventory management for Indonesian SME distributors.
Go server in `server/`, React client in `client/`. Solo developer, side-project
pace - keep changes small and scoped.

## Read before designing anything

- `docs/PLAN.md` - scope, decision record (D1-D16), schema sketch, milestones.
  Scope changes go through this file first.
- `docs/adr/` - rationale for hard-to-reverse decisions. Do not "fix" what an
  ADR says is deliberate.
- `docs/CONVENTIONS.md` - git and naming rules.
- `docs/CONTEXT.md` - glossary. Use these exact terms in code, API, and UI;
  respect the avoid-lists. Extended version with relationships and flagged
  ambiguities: `docs/UBIQUITOUS_LANGUAGE.md`.

## Load-bearing rules

- The `stock_movements` journal is append-only and the sole source of truth
  for stock. Never update or delete journal rows; corrections are new entries
  (ADR-0001, ADR-0003).
- Every tenant-owned table carries `tenant_id` with an RLS policy. A new table
  without one is a security bug (ADR-0004).
- Quantities and money are Postgres `numeric`, never floats; quantities are
  stored in base units.
- API is spec-first: edit `server/api/openapi.yaml`, then run `go generate .`
  in server/ (oapi-codegen + sqlc) and `pnpm generate-api` in client. Never
  edit generated files (`api-types.ts`, `routeTree.gen.ts`, `src/paraglide/`,
  `server/internal/api/`, sqlc output in `server/internal/store/` - the
  `queries/*.sql` files are the hand-written source).
- Migrations: goose format in `server/migrations/`, applied with
  `go run ./cmd/migrate up`; sqlc reads the same files as schema.
- Primary keys are UUIDv7 everywhere (ADR-0009). Document numbers are a
  separate, human-facing concept assigned at posting (ADR-0010).
- Posted documents are immutable; cancellation is a reversal document.
- Banned vocabulary: ledger, workspace, organization, stocktake, item.
  See the glossary for the canonical terms.

## Workflow

- All feature implementation is test-first: invoke the /tdd skill before
  writing implementation code. Red-green-refactor; no production code without
  a failing test first. Applies to domain logic, handlers, and client logic;
  not to config, migrations scaffolding, or generated code.

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
