# Flat tenants, global user accounts, membership-based access

A tenant is exactly one legal company (PT/CV); users are global accounts (one
login per email); a membership row links a user to a tenant with a role and
optional warehouse scoping. People who work across companies - shared staff, an
auditor serving company A and B - are one user with multiple memberships.

## Considered Options

- **Organization > workspace hierarchy**: the founder built this shape in a
  previous project and it produced persistent problems - every query,
  permission check, and report gains a second scoping dimension. Rejected from
  experience, not speculation. Do not reintroduce a workspace layer.
- **Users owned per tenant**: forces duplicate accounts for cross-company
  staff, the exact pain the membership model exists to solve.

## Consequences

- Consolidated cross-company reporting for owners of several legal entities is
  a future feature over multiple tenants, not a schema commitment now.
