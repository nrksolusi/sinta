# Smart default values on form inputs, except in auth flows

**Status:** Accepted - implemented.

Every form input outside the authentication modules should carry a smart default
whenever one can be reasonably inferred and pre-filling it is safe. A default is
inferred from context the system already holds - the current tenant and
membership, the user's warehouse scope, the last value they used, tenant
configuration, or a domain-obvious constant - so the common case is confirm, not
type. The target users are warehouse and back-office staff entering many
documents a day on mobile-first screens (D12); every field they can leave alone
is fewer keystrokes and fewer errors.

## What "safe" excludes

A default is safe only when a wrong-but-plausible value is visible and cheaply
corrected before any irreversible step. The boundary is posting: drafts are
mutable and unnumbered, so defaulting draft fields is safe because posting is a
deliberate second action (ADR-0010, ADR-0001). Do not default:

- **Anything in the auth modules** - login, registration, password reset, email
  verification, TOTP. Credentials and security fields are never pre-filled, and
  identity is never guessed (ADR-0006).
- **Destructive or reversing confirmations** - cancellation, reversal, delete.
  The confirming choice is always the user's.
- **Values a wrong default would silently misstate** - posted quantities, costs,
  and prices are pre-filled only from an authoritative source (e.g. last known
  cost per ADR-0003), never a convenience guess, and stay editable.

## Examples of safe defaults

- New-document business date defaults to today (`*_date`, editable for
  backdating per D7).
- Warehouse defaults to the membership's scoped or last-used warehouse (D9/D10).
- Unit of measure defaults to the product's base unit; currency and costing
  behaviour come from tenant settings.
- List and report screens default their filters (status, date range),
  pagination, and sort to the most common view.

## Consequences

- Client forms are built default-first: a field ships with its inferred default
  and the reason for it, or an explicit note that it is intentionally blank.
- "Last-used value" defaults need a small amount of client-side or per-user
  state; this is a UX affordance, not authoritative data.
- Auth screens are deliberately the plain, defaults-free exception, and reviews
  should treat a pre-filled auth field as a bug.
