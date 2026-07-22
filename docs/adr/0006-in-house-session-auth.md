# In-house email/password auth with server-side sessions

**Status:** Accepted - implemented.

Authentication is built into the Go server - argon2id password hashing,
server-side sessions, email verification and reset - instead of a managed
provider (Clerk/Auth0) or a self-hosted IdP (Keycloak/Zitadel). Per-MAU vendor
pricing compounds badly against many small SME tenants, managed providers raise
data-residency questions for Indonesian customers, and running an identity
server 24/7 pre-revenue is unjustified ops burden.

## Consequences

- We own the security surface: hashing, session fixation, rate limiting, reset
  flows. Google sign-in and TOTP 2FA are planned later (M3).
- If enterprise SSO (SAML/OIDC) is ever demanded, that is the point to
  reconsider an IdP - not before.
