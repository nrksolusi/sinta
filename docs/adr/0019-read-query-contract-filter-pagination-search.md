# Read-query contract: server-side filtering, cursor pagination, and typeahead search

List endpoints gain a uniform query contract - `status`, `warehouseId`,
`dateFrom`/`dateTo`, `q`, plus `cursor` + `limit` - and entity pickers are backed
by server-side typeahead search (`q` over name/code/SKU/barcode/id with fuzzy
ranking) instead of loading the full set and filtering in the browser. Filtering,
pagination, and search move to the server because the client-side approach
(fetch-all then in-memory filter and substring match - INC-5, INC-6) does not
scale past small tenants and cannot drive the list status/fulfillment tabs or
large catalogs. The contract is locked now, while there is still no pilot tenant,
because CONVENTIONS makes API casing and paths a breaking change to alter once a
tenant depends on them.

## Considered Options

- **Keep client-side filter + substring (status quo)**: simplest, but caps
  tenant size and cannot support tabs or large catalogs at scale.
- **Offset/limit pagination**: simpler UI, but moving to cursor later is itself a
  contract break; rejected for the durable contract.
- **Cursor + filters + typeahead search** (chosen).

## Consequences

- All document list endpoints accept `status`, `warehouseId`, `dateFrom`,
  `dateTo`, `q`, `cursor`, `limit`; responses carry `nextCursor`. Catalog lists
  extend their existing `status`/`role` filters with `q` + `cursor`.
- Entity search: products, partners, and warehouses gain a `q` typeahead
  (fuzzy/trigram ranking, e.g. `pg_trgm`) wired to the combobox `onSearch` seam.
  The picker becomes a Command dialog (Sheet on mobile per `useIsMobile`); the
  client keeps a small recents list.
- The client `DocList` moves from client-side predicates to server params. The
  per-route URL search state already models this contract, so URLs and UX are
  unchanged; only the data source moves server-side.
- A trigram (or equivalent) index backs the searchable columns; exact ranking is
  decided at implementation.
- The cursor is opaque keyset pagination (on `created_at`, `id`); default sort
  stays `created_at desc`, with drafts-first as a presentation concern.
- Supersedes the `scale`-severity framing of INC-5 and INC-6: both are built now
  as prerequisites of the fix-4 revamp, not deferred.
