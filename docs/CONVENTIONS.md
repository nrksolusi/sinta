# Conventions

Git and naming rules for Sinta. Decided 2026-07-21. Hard-to-reverse choices
have ADRs (see `adr/`); everything here is binding either way.

## Git

- **Model**: trunk-based. `main` is always deployable. Work happens on
  short-lived branches merged within days. No develop or release branches.
- **Branches**: `type/short-slug`. Types: `feat`, `fix`, `chore`, `refactor`,
  `docs`. Slugs are kebab-case and use the domain language from `CONTEXT.md`
  (`feat/opname-posting`, never `feat/stocktake`). No issue numbers.
- **Merge**: squash only. One branch = one commit on `main`.
- **Commits on main**: Conventional Commits, types matching branch prefixes 1:1
  (`feat: add stock journal posting`). No scopes. This project deliberately
  overrides the plain-imperative global preference.

## API contract (`server/api/openapi.yaml`)

- JSON fields: camelCase (`warehouseId`, `effectiveDate`).
- URLs: kebab-case, plural resources, `/v1` prefix (`GET /v1/goods-receipts`).
- Casing and paths are locked once a pilot tenant exists; changing them is a
  breaking change requiring `/v2`.

## Database

- Tables: snake_case, plural (`stock_movements`, `memberships`).
- Line tables: `parent_lines` (`goods_receipt_lines`).
- Foreign keys: `singular_id` (`warehouse_id`, `tenant_id`).
- Primary keys: UUIDv7, no exceptions (ADR-0009).
- Columns: snake_case; timestamps as `*_at`, business dates as `*_date`.

## Client

- Files: kebab-case (`theme-provider.tsx`), as already established.
- shadcn components stay under `src/components/ui` (excluded from Biome).
- Formatting and lint: Biome as configured - double quotes, spaces.
- Form inputs carry smart defaults where safe; auth forms are the exception
  (ADR-0011).

## Go

- Standard Go idiom: gofmt, MixedCaps, package names short and lowercase.
- Domain vocabulary follows `CONTEXT.md` (`Opname`, `Movement`, `Posting`).

## Document numbers (user-facing)

- Assigned only at posting; drafts are unnumbered (ADR-0010).
- Gapless per tenant, document type, and year.
- Tenant-configurable template, editable with effect at year rollover only.
- Default template: `{TYPE}-{YYYY}-{NNNNN}` (e.g. `PO-2026-00042`).
