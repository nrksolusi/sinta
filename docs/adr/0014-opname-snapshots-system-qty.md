# Opname lines snapshot systemQty at posting

When a stock opname posts, each line stores the system on-hand quantity it was
counted against (`system_qty`) alongside `counted_qty`, so the posted berita
acara renders System / Counted / Selisih exactly as it was adjusted. We snapshot
this computed value onto the line rather than re-derive it later. The journal
remains the sole source of truth for *stock* (ADR-0001); `system_qty` is a
point-in-time attribute of the *count event* - document data, like `doc_date` -
not a competing stock balance. The general principle: point-in-time computed
values that back an immutable posted-document artifact are snapshotted onto the
document, not reconstructed.

## Considered Options

- **Recompute against current stock** (the M1 client estimate): drifts as later
  movements post, so the posted variance shown can disagree with what was
  actually adjusted. This is exactly the INC-3 gap.
- **Derive from the opname's own journal movements**: exact in principle, but
  fragile in practice here - opname variances are written as
  `movement_type = 'adjustment'` (indistinguishable from manual adjustments),
  and zero-variance lines emit no movement at all, so matched lines cannot be
  reconstructed. Deriving would couple berita-acara rendering to movement
  linkage forever.
- **Snapshot `system_qty` at post** (chosen): one computed number, already
  calculated during posting, persisted onto the line. Uniform across
  zero-variance lines, batch-split lines, and the no-variance-opname fast path.

## Consequences

- Add `system_qty numeric` to `stock_opname_lines`; populate it inside the
  posting transaction where variance (`counted - on-hand`) is already computed,
  for every line - including zero-variance lines and the no-variance opname path
  that bypasses the journal poster.
- The value is written once at post and never updated; the line belongs to a
  posted, immutable document.
- Returned on the opname line response; the posted detail shows System / Counted
  / Selisih directly, replacing the counted-only + kartu-stok fallback.
- No change to the journal or to how variance movements are posted; this is a
  document-data addition, not a stock-truth change.
