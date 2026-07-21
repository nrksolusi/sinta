# Dual costing engines, tenant-selectable, switchable at fiscal-year boundary

Each tenant chooses weighted average or FIFO at onboarding, and may switch once
per fiscal year at the boundary via a revaluation run. We ship both engines in
v1 despite having no customers yet, because the founder judges tenant-selectable
costing a hard requirement for the Indonesian SME distributor segment.

## Considered Options

- **Weighted average only** (the original recommendation): half the valuation
  work, FIFO addable later thanks to the journal design (ADR-0001). Rejected by
  explicit founder decision, with the doubled engine and test cost accepted.
- **Switch anytime**: rejected - unbounded recomputation and audit problems.
  Fiscal-year-boundary switching contains the migration to one revaluation
  event with an audit trail.

## Consequences

- Both engines implement one interface: a pure fold over ordered journal
  movements. Neither engine may write state of its own.
- Average ships in milestone M1; FIFO in M2; the boundary switch in M3
  (see PLAN.md D15).
- FEFO batch picking is a consumption-order concern in the warehouse flow, not
  a third costing engine.
