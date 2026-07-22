# UI design principles (build north-star)

> **Status: Living contract.** Originated in the fix-2 redesign; now the standing
> UI design system - build all new UI to the component prop contracts here.

The design contract every page in the fix-2 redesign is built against. Derived
from `../plans/fix-2-ui-redesign.md` (UX-D1..D11) - that plan is authoritative; this doc
turns its decisions into concrete tokens, flows, and component prop contracts so
three engineers building in parallel produce compatible APIs.

Non-negotiables carried from CLAUDE.md: Indonesian UI labels (vocabulary table
in the plan); every number/currency/date goes through
`client/src/lib/format.ts` only (never `Intl.*`, `toLocaleString`, or a locale
at the call site); interactive primitives come from
`client/src/components/ui/*` (shadcn/base-ui) - do not hand-roll inputs, selects,
or tables; banned words: ledger, workspace, organization, stocktake, item.

---

## A. Design principles

1. **The document is the destination, not the form.** Posting navigates to the
   record detail, never a toast+redirect. Why: the posted document (doc number,
   printable artifact) is the product of the app (UX-D1).
2. **Draft is a first-class, resumable state.** `/new` is an unsaved draft; the
   same route renders editable while `draft`, frozen once `posted`. Why: a
   half-entered 30-line receipt must survive a closed tab (UX-D2).
3. **Status decides the surface, and illegal actions are absent, not disabled.**
   Show only legal transitions per state; remove edit affordances on posted docs
   with a passive notice instead of greying them out. Why: a disabled control
   with no reason is a dead end (UX-D7, UX-D10).
4. **Keyboard-first line entry; scan is the same input in another mode.** Search
   box appends a row and focuses qty (pre-filled, selected); Enter commits and
   returns to search; Tab walks qty->cost->row. Validation on blur blocks
   posting, never typing. Why: throughput on 30+ line docs (UX-D6).
5. **Irreversible actions confirm by restating specifics.** Post, reverse, and
   delete-draft dialogs name the doc, line count, qty/value, and stock effect -
   never a bare "Are you sure?". Why: the confirm is the last chance to catch a
   wrong warehouse (UX-D2, UX-D7, UX-D10).
6. **Never zero implicitly.** Uncounted opname rows, unreceived PO lines, and
   empty stock are shown as themselves, not silently treated as zero. Why: an
   implicit zero is a phantom stock correction (UX-D3).
7. **Dense, scannable tables with typed alignment.** Text left; numbers right
   with `tabular-nums`; codes and doc numbers mono; sticky header; newest first;
   filter state in URL search params. Why: these are inventory reports read all
   day (UX-D10).
8. **Every noun links to the documents and reports that touch it.** Product,
   partner, warehouse rows open detail pages wired to stock-on-hand, kartu stok,
   and their document lists. Why: depth comes from cross-links, not more fields
   (UX-D8).
9. **Progressive disclosure over dumping the screen; peek linked documents
   inline.** Prefer a collapsible/accordion to forcing every detail onto the
   page at once, and when a record links to another document (PO <-> receipt,
   SO <-> delivery, opname <-> kartu stok), expand an inline accordion showing
   that document's **line detail only** in place, with a link to open the full
   document - rather than navigating straight away. Component selection follows
   the same rule: reach for `ui/collapsible` / `ui/accordion` (or DataTable's
   expandable row) before adding another always-visible panel. Why: a linked-doc
   preview answers "what was on that receipt?" without losing the current
   context, and collapsible sections keep dense records scannable (extends
   principle 8; posting and primary nav still navigate per principle 1).

---

## B. Visual foundations (drop-in token values)

Read against the current `client/src/styles.css`: today `--primary` is bright
yellow `oklch(0.852 0.199 91.936)`, the base font is Geist Mono (`html {
font-mono }`), and Geist Sans is not yet imported. The changes below are the
target set.

### Typography

Geist Sans is the UI font; Geist Mono is demoted to **data only** (SKU, barcode,
doc numbers, codes, quantities, money). Add the sans import and flip the base
font family:

```css
@import "@fontsource-variable/geist";      /* add alongside geist-mono */
/* @theme inline */
--font-sans: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
--font-heading: var(--font-sans);          /* was var(--font-mono) */
/* @layer base */
html { @apply font-sans; }                 /* was font-mono */
```

| Role | Tailwind classes | tabular-nums? |
|---|---|---|
| Page title (doc no. / page H1) | `text-lg font-semibold tracking-tight` | mono + `tabular-nums` when it's a doc number/code |
| Section title ("Baris", "Riwayat") | `text-sm font-medium` | no |
| Body / label | `text-sm` | no |
| Data cell - text (product name) | `text-sm` | no |
| Data cell - number (qty, money) | `text-sm font-mono tabular-nums text-right` | **yes** |
| Data cell - code (SKU, doc no.) | `text-sm font-mono` | `tabular-nums` if it contains sequence digits |
| Metadata (timestamps, captions, "23 dokumen") | `text-xs text-muted-foreground` | `tabular-nums` for counts/times |

Rule: `font-mono` + `tabular-nums` applies to any rendered value that came
through `format.ts` (money, qty, counts) and to codes/doc numbers. Never mono on
prose or labels.

### Color tokens (light mode - replace the yellow-derived set)

`--primary` moves to the near-black shadcn neutral; the old amber becomes
`--warning` (pending / provisional-stock). Keep `--background`, `--foreground`,
`--muted`, `--border` as they already are (neutral). Replace:

```css
:root {
  --primary:              oklch(0.205 0 0);   /* near-black neutral */
  --primary-foreground:   oklch(0.985 0 0);
  --ring:                 oklch(0.205 0 0);   /* match primary, was neutral-gray */

  /* new semantic tokens */
  --warning:              oklch(0.852 0.199 91.936);  /* the retired amber */
  --warning-foreground:   oklch(0.421 0.095 57.708);
  --success:              oklch(0.52  0.14  155);      /* posted green */
  --success-foreground:   oklch(0.985 0 0);
}
```

Register each new token in the `@theme inline` block as
`--color-warning: var(--warning);` etc. so `bg-warning` / `text-success` exist.
Retire the yellow `--chart-*` ramp only if charts land; leave otherwise.
**Dark mode mirrors:** set `--primary: oklch(0.985 0 0)` /
`--primary-foreground: oklch(0.205 0 0)`, keep `--warning` / `--success` at the
same hue with lightness nudged up ~0.05 for contrast on the dark surface.

### StatusBadge palette

One component maps status -> variant. Values (light; dark mirrors by swapping
the muted/50 surfaces):

| Status (id label) | Fill | Text | Note |
|---|---|---|---|
| `draft` -> **Draf** | `bg-muted` | `text-muted-foreground` | neutral gray |
| `posted` -> **Diposting** | `bg-success/12` | `text-success` | green |
| `reversed` -> **Dibatalkan** | `bg-muted` | `text-muted-foreground line-through` | gray + strikethrough accent |
| `pending` -> **Menunggu Persetujuan** | `bg-warning/15` | `text-warning-foreground` | amber (M2, reserve now) |

### Spacing / sizing

- **Form controls: h-9.** Use `<Button size="lg">` and pass `className="h-9"` to
  `Input` inside forms (primitives default to h-8). This is the entry surface.
- **Toolbar / filter-bar controls: h-8.** Button default size, default Input.
- **Table row: ~44px** (`h-11`), dense; header sticky (`sticky top-0`).
- **Page padding:** `p-6` desktop, `p-4` mobile (`p-4 md:p-6`).
- **Radius:** unchanged (`--radius: 0.45rem`).
- **Sticky totals bar (LineGrid):** `h-14`, `border-t`, `bg-background`,
  `sticky bottom-0`.

---

## C. Core user flows (the good flow)

**(1) Document entry happy path.** `/new` (blank draft) -> pick counterparty +
warehouse (warehouse pre-selects default) -> focus search box -> scan/type ->
row appends, qty focused & selected -> type qty, Enter -> repeat -> click
**Posting** -> ConfirmDialog restates *"Posting penerimaan 12 baris, total qty
340, ke Gudang Utama?"* -> lands on `/$id` detail with the new doc number.

**(2) Draft resume.** Dashboard "Draf saya" or a `Draf` row in the DocList ->
click **Lanjutkan** / row -> opens `/$id` in editable state with all lines
intact -> continue at flow (1)'s post step.

**(3) Post lands on detail.** Post succeeds -> navigate to `/$id` (RecordShell,
posted) showing doc number, `Diposting` badge, frozen LineGrid, passive
"cannot be changed" notice, and the mini timeline (created/posted, actor, time).
No toast-and-redirect-to-dashboard.

**(4) Reverse.** Posted detail -> **Batalkan** -> ConfirmDialog (destructive)
restates *"Batalkan GR-2026-0015 (2 baris, 36 qty)? Stok akan dikembalikan lewat
dokumen pembalikan."* -> confirm creates the reversal doc -> original shows
banner "Dibatalkan oleh GR-... ->", reversal links back "Membatalkan GR-...".

**(5) Opname three-step (one route).** *Setup:* pick Gudang, Tanggal, mode
(Tampilkan qty sistem / Blind) -> **Buat lembar** generates a row per
stock-on-hand line. *Hitung:* scan/search jumps to the row (or appends off-sheet);
type Fisik; uncounted rows stay visibly uncounted; **Simpan draf** or **Lanjut**.
*Tinjau:* variance table (Sistem/Fisik/Selisih/est. Rp, labeled "estimasi"),
uncounted rows excluded and listed by name, bulk "Isi sesuai sistem" / explicit
"Hitung sebagai nol" -> **Posting**, confirm restates *"Posting opname GD-01: 2
selisih akan disesuaikan?"*.

Confirmation dialogs in flows 1, 4, 5 MUST restate the specific doc/qty/warehouse
- pass them via `ConfirmDialog`'s `specifics` prop (section D).

---

## D. Component contract checklist

Prop names below are the contract - build to these exact names so parallel work
merges. TS types are illustrative; put real ones in each component file.

### `StatusBadge`
- Props: `status: "draft" | "posted" | "reversed" | "pending"`.
- Renders the id label + palette from section B. No `className` override of
  color. Icon optional and internal. Single source of status->label mapping.

### `RecordShell` (detail-page frame, UX-D1/D7)
- Props: `breadcrumb: {label, to?}[]`, `title: ReactNode` (mono doc no. or
  "Draf"), `status`, `actions: ReactNode` (the per-state action bar, caller
  supplies only legal transitions), `banner?: ReactNode` (reversed/pending
  notice slot), `timeline: TimelineEntry[]` (`{action, actor, at}`),
  `children` (content sections).
- Required states: **draft** (actions = edit-inline / Post / Hapus draf),
  **posted** (actions = Cetak(M2) / Buat dokumen lanjutan / Batalkan; passive
  "cannot be changed" notice), **reversed** (banner + read-only, no actions).
- MUST render the mini timeline at the bottom in every state. Timestamps via
  `format.ts`.

### `DocList` (thin preset over DataTable, UX-D10)
- Props: `docType`, `rows`, `columns?` (per-type override; default No./Tanggal/
  counterparty/Gudang/Total/Status), `filters` (status + date-range + warehouse,
  rendered as removable chips), `onRowClick`.
- Required states: **loading** (skeleton rows), **empty-first-use** vs
  **empty-filtered** (distinct EmptyState), **populated**. Drafts sort first,
  then newest. Filter state MUST live in URL search params (shareable, survives
  back-nav). Numbers right + `tabular-nums`; No. mono.

### `EmptyState` (UX-D10)
- Props: `variant: "first-use" | "filtered"`, `title`, `description` (why empty
  + what belongs here), `action?: ReactNode` (primary action; usually present
  for first-use, absent/`Reset filter` for filtered), `icon?`.
- Both variants required; caller picks based on whether filters are active.

### `ConfirmDialog` (UX-D2/D7/D10)
- Props: `open`, `onOpenChange`, `title`, `specifics: ReactNode` (**required** -
  the restated qty/doc/warehouse line), `confirmLabel`, `onConfirm`,
  `destructive?: boolean` (delete-draft, reverse, remove member, revoke,
  archive), `pending?: boolean`.
- Required states: idle, `pending` (confirm button busy, dialog non-dismissable),
  destructive styling. `specifics` is not optional - a bare confirm is a review
  failure.

### `ProductCombobox` (UX-D5) + `PartnerCombobox` / `WarehouseCombobox`
- Props: `value`, `onSelect(product)`, `disabled?`, `allowCreate?: boolean`
  (admin inline "Create product"), `recentIds?` (empty-query recents),
  `warehouseId?` (for stock-on-hand display), async seam:
  `onSearch?: (q) => Promise<Option[]>` (client-side filter at M1).
- Option row: name (left) / mono SKU / unit / **stock on hand right-aligned**
  via `format.ts`. `shouldFilter` off, debounced. Required states: empty query
  (recents), no-match (create affordance or "Tidak ditemukan"), loading, list.
- Sibling comboboxes share the skeleton with simpler rows (no stock column).

### `LineGrid` (UX-D6)
- Props: `lines`, `onChange`, `withCost: boolean`, `qtyLabel: string`,
  `readOnly: boolean` (posted view renders the same grid frozen), `signedQty?:
  boolean` (adjustment +/- toggle), `totals` (lines / total qty / total value)
  rendered in the sticky bar.
- Behavior contract: search box appends a row (or increments existing qty with a
  visible flash, never silent merge) and focuses qty pre-filled "1" selected;
  Enter commits -> refocus search; Tab qty->cost->next; validation on blur
  (blocks post, not typing). Required states: empty (EmptyState "Belum ada
  baris. Cari produk atau scan barcode."), editing, `readOnly` frozen. Mobile:
  card-per-line layout. All qty/cost/total via `format.ts`.

---

## E. Accessibility & interaction hygiene (self-review checklist)

Restatement of UX-D10 as a checklist. Every PR self-checks before review:

- [ ] No disabled control without an adjacent visible reason (prefer a caption
      like "Pilih pemasok" / "Tambah minimal satu baris" over a bare greyed
      button; on posted docs, edit affordances are removed, not disabled).
- [ ] Every irreversible action (post, reverse, delete-draft, remove member,
      revoke invite, archive) goes through `ConfirmDialog` with populated
      `specifics`; destructive ones set `destructive`.
- [ ] Empty screens use `EmptyState` and distinguish first-use from
      filtered-to-empty.
- [ ] Page and table loads show skeletons; cached data preferred on revisit.
- [ ] Tables: text left, numbers right + `tabular-nums`, codes/doc numbers mono,
      dense rows, sticky header, newest first, drafts first.
- [ ] Filter/sort/tab state is in URL search params (shareable, survives
      back-nav).
- [ ] Every number, currency, and date renders through `client/src/lib/format.ts`
      - no `Intl.*` / `toLocaleString` / ad-hoc locale at the call site.
- [ ] Keyboard: line entry is fully operable without the mouse (search->qty->
      Enter->search; Tab across cells); focus is visible; focus returns to a
      sensible element after append/commit.
- [ ] Interactive elements come from `components/ui/*`; forms use TanStack Form,
      data tables use TanStack Table (no hand-rolled input/select/table).
- [ ] All user-facing copy goes through Paraglide (id + en), using the plan's
      vocabulary and the industry-term rule (keep English-origin terms like
      Opname, FIFO, Weighted Average where practitioners do).
- [ ] Dialogs/comboboxes are labeled (`aria-label`/`aria-labelledby`), trap
      focus, and close on Esc; the scanner Dialog feeds the same input path as
      typed search.
- [ ] Every noun (product/partner/warehouse) row and every report `Dokumen` cell
      is a link to the relevant detail (via docType/docId).
- [ ] Progressive disclosure preferred: dense or secondary detail sits in a
      collapsible/accordion (or DataTable expandable row), not forced onto the
      screen; a linked document peeks its line detail inline before offering a
      full-page navigation to open it.
