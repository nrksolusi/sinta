# Document approval gate: opt-in per tenant per document type, fixed-role authority

**Status:** Proposed - not yet implemented (see fix-3/fix-4).

Tenants may require an approval step before a document can be posted, enabled per
tenant and per document type. When enabled for a type, a document of that type
moves `draft -> pending_approval (Menunggu Persetujuan) -> approved (Disetujui)
-> posted`; approval authorizes, and posting stays the separate step that writes
the journal and assigns the gapless number (ADR-0010 unchanged). Approval
authority reuses the fixed D10 roles - owner and admin approve - so no new role
is introduced (ADR-0005 intact). Self-approval is allowed: the gate is a
deliberate confirmation, not a separation-of-duties control. Rejecting returns
the document to `draft` with a required reason. Approval is opt-in because the
solo-owner tenants behind ADR-0012 must not be burdened with a mandatory step.

## Considered Options

- **Always-on, or a single per-tenant switch**: rejected as too blunt - it
  burdens solo owners and cannot express "gate adjustments only", the most
  common real need.
- **Dedicated approver role**: rejected - it expands the fixed-role set for no
  benefit at this scale; owner/admin authority suffices and keeps ADR-0005.
- **Approve == post (one action)**: rejected in favour of separate actions, so
  "authorized" and "posted" are distinct visible states and posting keeps its
  existing numbering + journal transaction untouched.
- **Enforced separation of duties (no self-approval)**: rejected for now - it
  would dead-end single-user tenants; revisitable if a tenant needs it.
- **Opt-in per tenant per document type, approve-then-post, self-approval
  allowed** (chosen).

## Consequences

- The document status domain gains `pending_approval` and `approved`, added
  per-table by dropping and re-adding the `status` CHECK constraint (the same
  mechanism migration `0300` used to add `reversed`). Non-gated document types
  keep today's `draft -> posted` flow, unaffected.
- New per-tenant config table `approval_settings (tenant_id, doc_type,
  requires_approval)`, carrying `tenant_id` with an RLS policy (ADR-0004).
- Post handlers gain a precondition: a gated document must be `approved` to post;
  a non-gated document posts from `draft` as today.
- New `submit` / `approve` / `reject` transitions; approval lifecycle actor+time
  columns (`submitted_*`, `approved_*`, `rejected_*` + reason) are recorded and
  surfaced in the UX-D7 timeline, sharing the schema change with INC-2.
- Reject and delete remain destructive confirmations, never defaulted
  (ADR-0011); a gated draft is deleted by rejecting to `draft` first (ADR-0013).
- The client wires the already-defined but dormant `pending` StatusBadge, adds an
  `approved` ("Disetujui") variant, and the submit/approve/reject actions with a
  reject-reason dialog.
