# Document numbers: gapless at posting, tenant templates locked per year

**Status:** Accepted - implemented.

Document numbers are assigned only when a document is posted - drafts are
unnumbered - so the posted sequence is gapless per tenant, document type, and
year, which Indonesian audit practice expects. The rendered format is a
tenant-configurable template (tokens: sequence, type, month incl. roman
numerals, year) because Indonesian SMEs have entrenched house formats like
`042/PO/VII/2026`; a fixed format was rejected by explicit founder decision.

## Considered Options

- **Fixed format only** (the original recommendation): less v1 scope, rejected
  as a segment mismatch.
- **Numbering at draft creation**: users see numbers earlier, but abandoned
  drafts create gaps in the posted sequence - the first thing auditors ask
  about.
- **Renumbering on template change**: rejected outright; renumbering documents
  already printed and sent to partners is an integrity violation.

## Consequences

- Template edits take effect at the next year rollover only, eliminating
  mid-year renumbering and mixed-format years. Sequences reset yearly.
- Tenants who never configure anything get `{TYPE}-{YYYY}-{NNNNN}`
  (e.g. `PO-2026-00042`).
- Number assignment participates in the posting transaction (advisory locks),
  since gaplessness under concurrency cannot be retrofitted.
- Sequencing: M1 ships posting-time gapless numbering with the default
  template; the template configuration UI lands in M2.
