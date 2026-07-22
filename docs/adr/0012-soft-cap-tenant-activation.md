# Soft cap on self-served tenant activation

Amends D14. Any user may create tenants through the onboarding wizard without
operator involvement, but only their first 3 created tenants start `active`.
From the 4th onward the tenant is created with `active = false` and every
tenant-scoped request answers 403 `tenant_inactive` until the operator flips
the flag after invoicing ("menunggu aktivasi" in the UI). Creation is also
rate-limited per user. The activation flag therefore works both ways: a gate
for tenants past the cap, a kill switch for non-payers.

## Considered Options

- **Strict manual activation (D14 as written)**: every tenant starts inactive.
  Safest commercially, but it puts the operator in the critical path of every
  trial and breaks the self-served onboarding flow that makes multi-company
  users (ADR-0005) cheap to support.
- **Unbounded self-served activation**: what the code did before this ADR.
  Trial-friendly, but a single account could mint unlimited free active
  tenants with no operator touchpoint at all.

## Consequences

- `tenants.created_by` records who created each tenant; the cap counts
  creations, not owned memberships, so ownership transfers do not free slots.
- Tenants created before this ADR have `created_by = NULL` and count toward
  nobody's cap.
- Deactivating a tenant does not free a creation slot; the cap is deliberately
  on lifetime creations to keep the abuse math simple.
- The client must render an explicit waiting state, because an inactive
  tenant's API surface is 403 across the board.
