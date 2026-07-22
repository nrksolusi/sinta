# UUIDv7 primary keys everywhere

**Status:** Accepted - implemented.

Every table uses UUIDv7 primary keys - no bigint identities, no exceptions.
In a shared-schema multi-tenant database (ADR-0004), sequential IDs advertise
volume and turn any missed tenant check into an enumeration vulnerability;
UUIDv7 is non-enumerable while staying time-ordered, so B-tree indexes do not
suffer the fragmentation that random UUIDv4 causes.

## Considered Options

- **bigint identity**: smaller and marginally faster joins, rejected for
  enumeration risk across tenants.
- **UUIDv7 + Stripe-style prefixed public IDs** (`po_01H...`): nicer in logs
  and support, deferred - it adds an encode/decode layer at every boundary and
  pays off only when external API developers become a real audience.

## Consequences

- IDs are safe to expose in URLs and exports as-is.
- Human-facing identity for documents comes from document numbers (ADR-0010),
  not primary keys.
