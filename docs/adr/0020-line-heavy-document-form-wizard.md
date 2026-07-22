# Line-heavy documents use a header -> lines -> summary wizard

**Status:** Proposed - not yet implemented (see fix-3/fix-4).

Creating and editing a line-heavy document - orders, receipts, deliveries,
transfers, opname - is structured as a three-step flow: header (the document),
then lines (the detail), then a summary/confirm, rather than one long screen.
Simple entity forms (product, warehouse, partner) stay single-step. This follows
the opname flow already shipped - the one existing wizard in the app - and keeps
each field-heavy step within the mobile-first, low-friction budget (D12) instead
of a single dense scroll where header fields and a long line grid compete.

## Considered Options

- **Single-step everywhere (status quo)**: fine for a three-field entity, cramped
  and error-prone for a header plus many lines on a phone.
- **Wizard everywhere, including simple entities**: uniform but ceremony for a
  trivial form.
- **Wizard for line-heavy documents only** (chosen).

## Consequences

- A shared step scaffold generalized from `stock/opnames/-opname-flow.tsx`
  (StepIndicator + sticky back/next bars) backs the line-heavy editors; the three
  steps map to the existing header grid, the shared `LineGrid`, and a new summary
  step that surfaces totals and the post action.
- The route-held draft is saved across steps, so a step change never loses work;
  posting stays the deliberate final action, taken from the summary step.
- Simple catalog forms keep their single-screen Sheet editors.
- Detail (read) pages keep `RecordShell`; this ADR governs create/edit only.
- Reviews treat the wizard as deliberate: a line-heavy editor collapsed back to
  one dense screen is a regression, not a simplification.
