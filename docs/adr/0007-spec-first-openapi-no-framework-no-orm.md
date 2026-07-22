# Spec-first OpenAPI contract; stdlib HTTP and sqlc instead of framework/ORM

**Status:** Accepted - implemented.

`server/api/openapi.yaml` is the single API contract: Go server interfaces are
generated with oapi-codegen and the React client generates types from the same
file (already wired via `generate-api` in client/package.json). The server uses
stdlib `net/http` routing (Go 1.22+) rather than a web framework, and sqlc over
pgx rather than an ORM.

Spec-first keeps a solo developer's client and server from drifting, and the
contract is the natural parallelization seam if the team grows. sqlc was chosen
over an ORM because the core of this system is careful SQL - journal ordering,
advisory-locked posting, RLS interaction - where an ORM's query generation is a
liability, and sqlc keeps queries reviewable while generating the boring
bindings.

## Consequences

- The spec is edited first; handlers that do not match the spec fail codegen,
  not code review.
- No ORM means migrations and queries are hand-written SQL; goose owns schema
  evolution (embedded goose-format migrations, run via `cmd/migrate`), and sqlc
  reads the same migration files as its schema source.
