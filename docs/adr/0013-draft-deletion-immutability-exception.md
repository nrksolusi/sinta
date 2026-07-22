# Draft documents are deletable - the sole exception to document immutability

An unposted draft document can be hard-deleted via `DELETE /v1/{document}/{id}`,
guarded to `status = draft`. This is deliberately the one place a document row is
removed rather than reversed. It does not conflict with the append-only journal
(ADR-0001) or with posted-document immutability, because a draft has written no
`stock_movements` and has been assigned no gapless number (ADR-0010) - there is
nothing to leave a gap and no history to rewrite. We chose hard delete over a
soft-delete tombstone because a never-posted draft carries no audit or
referential weight worth preserving, and lingering drafts (the current M1
workaround) have no way to be cleared.

## Considered Options

- **Soft-delete (archived flag / `status = 'deleted'`)**: keeps a tombstone but
  pollutes every list and query with a state that has no audit value on a
  document that never posted.
- **No delete (drafts linger)**: the M1 status quo; abandoned drafts accumulate
  with no user-facing way to remove them (INC-1).
- **Hard delete, draft-only** (chosen): removes the draft and its lines cleanly;
  posted history is untouched because none exists yet.

## Consequences

- `DELETE` is permitted only while `status = draft`; any other status returns
  `409`. Posted and reversed documents are never deletable - cancellation
  remains a reversal document.
- For a gated document mid-approval (`pending_approval` / `approved` but still
  unposted and unnumbered), reject it back to `draft` first, then delete
  (ADR-0015).
- Deletion cascades to the document's line rows; no `stock_movements` exist to
  touch, so the append-only trigger is never involved.
- The client's existing `onDelete` / `ConfirmDialog` seam drives it; delete is a
  destructive confirmation, never a defaulted action (ADR-0011).
