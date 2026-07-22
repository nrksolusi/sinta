# Fix 2 - UX redesign: information architecture and page prototypes

> **Status: Done - shipped to `main`.** All phases F2.1-F2.6 complete. Deferred
> scope is tracked in `../discovery/fix-2-deferred-scope.md`.

Rewrite of the first version of this plan, which restyled the existing
screens without questioning their shape. This version starts from the
information architecture: documents as first-class records, workflows that
match how a distributor actually operates, and only then the visual layer.

Grounding, in order of authority:

1. The server API (documents.yaml, reports.yaml): all seven document types
   already implement list / get / update-draft / post / reverse with
   draft -> posted -> reversed lifecycle, doc numbers at posting, and
   reversal cross-links (reversesId / reversedById). Receipt lines carry
   purchaseOrderLineId, delivery lines carry salesOrderLineId, so
   receive-from-PO and deliver-from-SO pre-fill is buildable today. The
   stock card report returns docType/docId per movement, enabling
   movement-to-document links. The current client uses create+post only
   and discards the result - most of this plan is exposing what exists.
2. Reference ERPs (Odoo, ERPNext, SAP B1): all three converge on the same
   architecture - source document spawns a pre-filled operational
   document, posting is a one-way door, undo is a reversal document. That
   is exactly the model our ADRs chose; the UI must show it.
3. Indonesian competitors (Accurate Online, Mekari Jurnal, Kledo): supply
   the vocabulary pilot users already know and the table-stakes artifacts
   (surat jalan without prices, opname with selisih, Excel round-trip).
4. Interaction research (NN/g, Pencil and Paper, SAP Fiori, AG Grid,
   Linear/Stripe patterns): the component-level mechanics. Sources listed
   at the end.

Fix 1 (`fix-1-ui-stack-retrofit.md`) remains the mechanical vehicle
(shadcn, TanStack Table/Form); this plan defines what those mechanics
build.

## Design decisions

Numbered so later work can cite them. Each records the choice, the
rationale, and what it replaces.

**UX-D1. Documents are records, not transactions.** Every document type
gets a list page and a detail page with its own URL. Posting navigates TO
the document detail (the moment you get the doc number and the printable
artifact), never away from it. The current fire-and-forget forms
(post -> toast -> dashboard) are removed. Rationale: the posted document
is the product of an inventory system - the thing shown to a supplier in
a dispute; every reference ERP works this way.

**UX-D2. Draft is a real state in the UI.** The entry form and the
document are the same thing: `/purchases/receipts/new` is an unsaved
draft, "Save draft" creates it server-side (POST) and navigates to
`/purchases/receipts/$id`, which renders as an editable form while status
is draft and as a read-only record once posted. Post = save + post with a
confirmation restating specifics ("Post receipt of 12 lines, total 340
qty, to Gudang Utama?" - NN/g: confirm irreversible actions by restating
what will happen). A half-entered 30-line receipt survives a closed tab.

**UX-D3. Opname is a count-sheet workflow, not a form.** The current
screen (add products one by one from a select, type counts, post) is
inverted: it can only find variance on products someone remembers, so a
product that vanished entirely never gets adjusted. New flow, following
ERPNext's fetch-from-stock shape with Odoo's two grafts:

1. Setup: pick warehouse, date, count mode - "Tampilkan qty sistem"
   (default) or blind count (hide system qty; counter types what they
   see). The sheet is generated from the stock-on-hand report for that
   warehouse (per product and batch).
2. Count: sheet table with a scan/search box; scanning or picking jumps
   to the row (or adds an off-sheet product). Uncounted rows stay
   visibly uncounted.
3. Review: variance table - system qty, counted qty, selisih, estimated
   value impact (from the valuation report's avgCost). Uncounted rows
   are EXCLUDED by default (ERPNext/Odoo: never zero implicitly); bulk
   actions "Isi sesuai sistem" and an explicit "Hitung sebagai nol" exist
   for deliberate choices. Post from here, with the variance summary in
   the confirm.

The posted opname persists as the count report (berita acara - an
artifact Indonesian SMEs expect; Jurnal publishes templates for it).
API note: opname lines store only countedQty; the server computes
variance at post. The review screen's preview is computed client-side
against current stock on hand and labeled as an estimate. See API gaps.

**UX-D4. The purchase and sales chains become visible and skippable.**
PO and SO screens exist (the API is fully implemented; the client never
built them). On a posted PO: "Buat penerimaan" creates a receipt
pre-filled from PO lines (purchaseOrderLineId set), Odoo-style. Same for
SO -> delivery. Direct receipt/delivery without a source document stays
one click away - Accurate explicitly supports skipping the chain, and so
do we. Received/delivered progress per PO/SO line is computed client-side
from linked documents (no server rollup yet - see API gaps). Backorder
prompts on short receipt are M2; M1 just shows remaining qty on the
source document.

**UX-D5. Heavy pickers are comboboxes; scan is a mode of the same
input.** One shared ProductCombobox (cmdk, `shouldFilter` off, debounced
filtering): searches SKU, name, and barcode; option rows show name, mono
SKU, unit, and stock on hand right-aligned (prevents pick-then-discover-
empty); empty query shows recently used products; no-match offers
"Create product" inline (admin roles). Supplier/customer/warehouse
pickers use the same pattern sized down. The tenant switcher becomes a
combobox too. M1 datasets fit client-side (list endpoints return all
rows); the component keeps an async seam for server search later.

**UX-D6. Line entry is keyboard-first.** The line grid's happy path:
scan/search box above the grid (ERPNext pattern) - picking a product
appends a row (or increments qty if the product is already present, with
a visible flash, never a silent merge) and focuses the qty cell,
pre-filled "1" and selected; Enter commits and returns focus to the
search box; Tab walks qty -> cost -> next row. Validation on cell blur;
errors block posting, not typing. Running totals (lines, total qty,
total value where costs exist) in a sticky bar. Mobile keeps the
card-per-line layout for viewing and simple entry.

**UX-D7. Status drives the surface.** Every document page has a header
with the doc number (or "Draft"), a StatusBadge, and an action bar
showing only legal transitions: draft = Edit fields inline / Post /
Hapus draf; posted = Cetak (M2) / Buat dokumen lanjutan / Batalkan
(reverse); reversed = read-only with links. Edit affordances are REMOVED
on posted documents, not disabled (NN/g), with a passive notice: "Posted
documents cannot be changed. Cancel creates a reversal document."
Reversal links render both ways ("Membatalkan GR-2026-0012" /
"Dibatalkan oleh GR-2026-0015"). A mini timeline (created, posted,
reversed - actor and time) sits at the bottom of every detail page.

**UX-D8. Entities get detail pages wired to the reports.** Product,
partner, and warehouse rows link to record pages. Product detail is the
anchor: identity card, stock per warehouse (inline table from
stock-on-hand), kartu stok (movement history from the stock card report,
each row linking to its document via docType/docId), UOM conversions,
batches. Partner detail: identity plus their documents. Warehouse
detail: stock on hand in that warehouse plus its documents. This is what
gives the app depth: every noun connects to the documents and reports
that touch it.

**UX-D9. Navigation is grouped by business flow, not by feature type.**
Sidebar (Indonesian labels are what ships; see vocabulary):

- Dashboard
- Pembelian: Pesanan Pembelian, Penerimaan Barang
- Penjualan: Pesanan Penjualan, Pengiriman
- Stok: Transfer Gudang, Penyesuaian Stok, Stok Opname
- Laporan: Stok per Gudang, Kartu Stok, Nilai Persediaan
- Katalog: Produk, Mitra, Gudang
- Pengaturan (pinned bottom)

**UX-D10. Interaction hygiene rules (house rules, enforced in review).**
No disabled control without an adjacent visible reason. Confirmations
only for irreversible actions, always restating specifics; destructive
confirm for delete-draft, reverse, remove member, revoke invite,
archive. EmptyState (why empty + what belongs here + primary action)
distinguishes first-use from filtered-to-empty. Skeletons for page and
table loads; cached data preferred on revisits. Tables: text left,
numbers right with tabular-nums, codes and doc numbers mono, dense rows,
sticky header, newest first, filter state in URL search params (shareable,
survives back navigation).

**UX-D11. Printing and approval are designed now, shipped later.** The
surat jalan PDF (no prices, qty + satuan, ship-to, customer PO number,
three signature blocks: pengirim/sopir/penerima) and the numbering
template UI are M2 per PLAN.md, as is the minimal adjustment/PO approval
(Kledo-style status gate: Draft -> Menunggu Persetujuan -> Disetujui,
one approver role, reject requires a reason). The prototypes reserve
their places (a Cetak action on posted deliveries, an approval slot in
the status pipeline) so M2 slots in without a redesign.

## Route map

```
/                                dashboard
/purchases/orders                PO list          /purchases/orders/$id
/purchases/orders/new
/purchases/receipts              GR list          /purchases/receipts/$id
/purchases/receipts/new          (accepts ?purchaseOrderId= for pre-fill)
/sales/orders                    SO list          /sales/orders/$id
/sales/orders/new
/sales/deliveries                delivery list    /sales/deliveries/$id
/sales/deliveries/new            (accepts ?salesOrderId=)
/stock/transfers                 list + $id + new
/stock/adjustments               list + $id + new
/stock/opnames                   list + $id       /stock/opnames/new (count flow)
/reports/stock-on-hand           /reports/stock-card    /reports/valuation
/catalog/products                list             /catalog/products/$id
/catalog/partners                list             /catalog/partners/$id
/catalog/warehouses              list             /catalog/warehouses/$id
/settings/...                    unchanged from v1 (profile, members, invites)
```

The old /receive, /delivery, /opname routes redirect to the new entry
routes.

## Foundations (unchanged in substance from v1, condensed)

- Geist Sans becomes the UI font; Geist Mono is demoted to data only
  (SKU, barcode, doc numbers, codes, quantities, money) with
  tabular-nums. `--primary` moves from the current bright yellow to the
  near-black shadcn neutral; the amber becomes `--warning` (pending
  states, provisional-stock flags). Status palette in one StatusBadge
  component: draft = gray, posted = green, reversed = gray strikethrough
  accent, menunggu persetujuan = amber (M2).
- Type scale: page title text-lg semibold, section title font-medium,
  data text-sm, metadata text-xs muted. Controls h-9 (forms) / h-8
  (toolbars). Table rows ~44px. Page padding p-6 desktop / p-4 mobile.
- App shell: collapsible left sidebar with the UX-D9 groups, topbar with
  breadcrumb + tenant-switcher combobox + user menu, banner slot for
  pending activation. Mobile: Sheet drawer. (Same shell as v1, new nav
  content.)

## Shared components

- **RecordShell** - detail-page frame: breadcrumb, mono doc number/code +
  StatusBadge + action bar (per-state), content sections, mini timeline.
  Used by every document and entity detail page.
- **DocList** - thin preset over DataTable for document lists: columns
  No. (mono) / Tanggal / counterparty / Gudang / Total / Status;
  status + date-range + warehouse filter bar as removable chips, state
  in URL; row click opens detail. Skeleton rows; EmptyState per type.
- **ProductCombobox** (UX-D5) and **PartnerCombobox / WarehouseCombobox**
  (same skeleton, simpler rows).
- **LineGrid** (UX-D6) - scan/search box + editable lines table + sticky
  totals bar; props: withCost, qtyLabel, readOnly (posted view renders
  the same grid frozen).
- **StatusBadge, EmptyState, ConfirmDialog** (specifics prop required),
  **DataTable**, skeletons - as in v1.
- **BarcodeScanner** - unchanged internals, hosted in a Dialog, feeds the
  same input path as typed search.

## Prototypes

### D1 Document list (template - all seven types)

```
Penerimaan Barang                              [ + Penerimaan baru ]
[ status: Semua v ] [ tanggal v ] [ gudang v ]   (chips, URL-backed)
+------------------------------------------------------------------+
| No.           Tanggal     Pemasok         Gudang   Total   Status|
| GR-2026-0015  21 Jul 2026 PT Maju Jaya    GD-01    1.240k  posted|
| Draft         -           CV Sinar Baru   GD-01    -       draft |
| GR-2026-0012  19 Jul 2026 PT Maju Jaya    GD-02    880k    rev'd |
+------------------------------------------------------------------+
| 23 dokumen                                                       |
```

Per-type column variations: PO/SO add progress ("3/5 diterima",
computed client-side from linked receipts); transfers show
Dari -> Ke gudang; adjustments show Alasan; opnames show Gudang and
line count. Drafts sort first, then newest.

### D2 Document detail - posted (RecordShell)

```
Pembelian / Penerimaan / GR-2026-0015
GR-2026-0015   [posted]                [ Buat faktur (M2) ] [ Batalkan ]
Pemasok: PT Maju Jaya      Gudang: GD-01 Gudang Utama
Tanggal: 21 Jul 2026       Sumber: PO-2026-0008 ->        Catatan: ...
+-- Baris ---------------------------------------------------------+
|  #  Produk              SKU       Qty      Satuan  Harga   Jumlah|
|  1  Indomie Goreng      IDM-001   24,00    dus     98.000  2.352k|
|  2  ...                                                          |
+------------------------------------------------------------------+
|                        2 baris - total qty 36 - total Rp 3.240k  |
i  Dokumen yang sudah diposting tidak dapat diubah. Batalkan akan
   membuat dokumen pembalikan.
-- Riwayat -------------------------------------------------------
   Diposting oleh Ardianto - 21 Jul 2026 14:02
   Dibuat oleh Ardianto - 21 Jul 2026 13:55
```

Reversed variant: banner "Dibatalkan oleh GR-2026-0018 ->" at top, no
actions except viewing. The reversal document links back. "Batalkan"
opens ConfirmDialog restating doc number, line count, and stock effect.

### D3 Document entry - draft (same route, editable state)

```
Penerimaan baru                       [ Simpan draf ]  [ Posting ]
+-- Detail --------------------------------------------------------+
|  Pemasok *  [ PT Maju Jaya       v]   Gudang  [ GD-01 (default) v]|
|  Tanggal    [ 22-07-2026 ]            Sumber  PO-2026-0008 (jika  |
|  Catatan    [.............................]   dibuat dari PO)     |
+------------------------------------------------------------------+
+-- Baris ---------------------------------------------------------+
| [ /) Cari SKU / nama / scan barcode....................... ] [[]]|
|  #  Produk            SKU      Qty        Satuan  Harga/unit     |
|  1  Indomie Goreng    IDM-001  [ 24,00]   dus     [ 98.000]  [x] |
|  >  (baris baru muncul saat produk dipilih; qty terfokus)        |
|  EmptyState: "Belum ada baris. Cari produk atau scan barcode."   |
+------------------------------------------------------------------+
+== bar lengket ===================================================+
|  2 baris - total qty 36 - Rp 3.240.000    [ Simpan draf ][Posting]|
+==================================================================+
```

Posting reason shown when unavailable (caption under the button:
"Pilih pemasok", "Tambah minimal satu baris") - never a bare disabled
button. When created from a PO, lines arrive pre-filled with ordered
qty; short quantities just post short (M1), remaining shows on the PO.
Delivery variant: Pelanggan, no cost column. Transfer variant: Dari/Ke
gudang. Adjustment variant: Alasan (required), signed qty (+/- toggle
per line), unit cost.

### D4 Purchase order detail with chain

```
PO-2026-0008   [posted]                        [ + Buat penerimaan ]
Pemasok: PT Maju Jaya   Gudang: GD-01   Tanggal: 15 Jul 2026
+-- Baris ---------------------------------------------------------+
|  #  Produk            Qty dipesan   Diterima   Sisa    Harga     |
|  1  Indomie Goreng    100,00        76,00      24,00   98.000    |
+------------------------------------------------------------------+
-- Penerimaan terkait --------------------------------------------
   GR-2026-0012  19 Jul  40,00 qty   [posted]  ->
   GR-2026-0015  21 Jul  36,00 qty   [posted]  ->
```

"Diterima" and the related list are client-side joins over
listGoodsReceipts filtered by purchaseOrderId. SO detail mirrors this
with deliveries.

### D5 Stock opname flow (three steps, one route)

```
Step 1 - Setup            Step 2 - Hitung           Step 3 - Tinjau
+------------------+  +------------------------+  +---------------------+
| Gudang * [GD-01v]|  | [ /) cari / scan .... ]|  | Produk  Sistem Fisik|
| Tanggal [22-07]  |  | Produk   Sistem  Fisik |  |         Selisih  Rp |
| Mode:            |  | Indomie  40,00  [38  ] |  | Indomie 40 38 -2 -196k|
| (o) Tampilkan    |  | Beras 5k 12,00  [    ] |  | Beras   (tidak      |
|     qty sistem   |  |   ^ belum dihitung     |  |  dihitung - lewati) |
| ( ) Blind count  |  | ...120 baris dari stok |  | 2 selisih, est.     |
| [ Buat lembar ]  |  | [Simpan draf][Lanjut ->]| |  -Rp 196.000        |
+------------------+  +------------------------+  | [<- Kembali][Posting]|
                                                  +---------------------+
```

- The sheet is every stock-on-hand row for the warehouse (product and
  batch). Blind mode hides the Sistem column in step 2.
- Uncounted rows are skipped at posting, listed by name in the review so
  skipping is a visible decision. Bulk row actions: "Isi sesuai sistem"
  (confirm no change), "Hitung sebagai nol" (explicit zeroing).
- Review computes selisih and value estimate client-side (current stock
  on hand and avgCost), labeled "estimasi - dihitung final saat
  posting". Posting confirm restates: "Posting opname GD-01: 2 selisih
  akan disesuaikan?"
- Posted opname detail (D2 frame) shows the count sheet with counted
  values; the movements it produced are visible per product in kartu
  stok. Off-sheet additions (scan finds a product with zero stock)
  append rows.

### D6 Reports

```
Kartu Stok
[ Produk * (combobox) ]  [ Gudang: Semua v ]
+------------------------------------------------------------------+
| Tanggal   Dokumen         Jenis        Qty      Saldo    Nilai   |
| 21 Jul    GR-2026-0015 -> receipt      +24,00   64,00    6.272k  |
| 19 Jul    DO-2026-0031 -> issue        -12,00   40,00    3.920k  |
|   (provisional rows flagged amber)                               |
+------------------------------------------------------------------+
```

Stok per Gudang: filter gudang/produk, columns SKU, Produk, Gudang,
Batch, Qty. Nilai Persediaan: adds Avg Cost and Nilai, footer
totalValue. Every Dokumen cell links to the document via docType/docId.
Report tables are the same DataTable preset; export (Excel/CSV) is an
M2 slot on the toolbar.

### D7 Product detail

```
Katalog / Produk / IDM-001
Indomie Goreng   IDM-001   [aktif] [batch]        [ Ubah ] [ Arsipkan ]
Satuan dasar: dus   Barcode: 8991234567890   Konversi: 1 karton = 40 dus
+-- Stok per gudang ----------------+  +-- Ringkas ----------------+
| Gudang   Batch    Qty     Nilai   |  | Total qty      64,00 dus  |
| GD-01    -        40,00   3.920k  |  | Total nilai    Rp 6.272k  |
| GD-02    -        24,00   2.352k  |  | Avg cost       Rp 98.000  |
+-----------------------------------+  +---------------------------+
-- Kartu stok (20 terakhir)  [ Lihat semua -> /reports/stock-card ]
   21 Jul  GR-2026-0015 ->  +24,00   ...
-- Konversi satuan --  -- Batch (jika batch) --
```

Edit stays in a Sheet over this page. Partner detail: identity card +
document list filtered to the partner (client-side join). Warehouse
detail: stock-on-hand table for the warehouse + its documents.

### D8 Dashboard

```
Selamat datang, Ardianto        [ + Penerimaan ] [ + Pengiriman ]
+-- Draf saya (3) --------------------------------------------+
| Draft penerimaan - CV Sinar Baru - 2 baris    [ Lanjutkan ] |
+-------------------------------------------------------------+
| Produk 128 | Mitra 34 | Gudang 3 | Nilai persediaan Rp 84,2jt|
+-------------------------------------------------------------+
-- Dokumen terbaru (10) --  (union of document lists, newest)
   GR-2026-0015  Penerimaan  PT Maju Jaya  21 Jul  [posted] ->
```

Draf saya is the resume-work surface UX-D2 creates; nilai persediaan
comes from the valuation report's totalValue. All buildable with
existing endpoints.

### Catalog lists, settings, auth, onboarding

Catalog lists follow D1 (products: SKU / Nama / Satuan / Barcode /
Status; partners add role badges and filter; warehouses add default
badge) with row click to D7-style details and edit in a Sheet. Settings,
auth (split-panel), and the onboarding wizard keep the v1 prototypes;
the only change is shell integration and the D-series house rules
(ConfirmDialogs, empty states, no disabled-without-reason).

## Vocabulary (UI labels, id locale)

Per CONTEXT.md glossary plus competitor-standard terms; English locale
mirrors these.

| Concept | UI label (id) | Note |
|---|---|---|
| Purchase order | Pesanan Pembelian | universal across competitors |
| Goods receipt | Penerimaan Barang | Accurate's exact label |
| Sales order | Pesanan Penjualan | |
| Delivery | Pengiriman | printout is "Surat Jalan" (M2) |
| Transfer | Transfer Gudang | |
| Adjustment | Penyesuaian Stok | glossary: penyesuaian |
| Opname | Stok Opname | universal, keep English-origin form |
| Variance | Selisih | |
| Supplier | Pemasok | glossary term; Accurate uses it |
| Customer | Pelanggan | universal |
| Post action | Posting | standard in Indonesian accounting |
| Reversal | Pembalikan / "Batalkan" as the action verb | |
| Draft | Draf | |
| Statuses | Draf, Diposting, Dibatalkan | M2 adds Menunggu Persetujuan |

## API gaps surfaced by this design (small server additions, not blockers)

1. Posted opname variance: lines return countedQty only; the variance
   actually posted lives in the journal. Add systemQty (captured at
   post) to the opname line response so the detail page can render the
   berita acara without recomputing. Until then the detail shows counts
   and links to kartu stok.
2. PO/SO fulfillment rollup: received/delivered qty per line is a
   client-side join for now; a server rollup field becomes worthwhile
   when list sizes grow.
3. List endpoints have no filters/pagination (M1 returns all,
   tenant-scoped) - acceptable at pilot scale; the DocList filter bar
   filters client-side behind the same URL-param interface, so moving to
   server params later changes no UX.
4. Product search endpoint for the combobox: client-side over the full
   list at M1 scale; async seam reserved.
5. Printing (surat jalan), numbering template UI, approval gate,
   backorder prompts, Excel import/export: M2 per PLAN.md - the layouts
   reserve their slots (UX-D11).

## Implementation phases

Each phase is a branch + squash merge; TDD at the component seam per
CLAUDE.md. fix-1 steps fold in where noted.

1. **F2.1 Foundations + shell** (`feat/ui-foundations-shell`): fonts,
   colors, tokens, shadcn primitives sweep (fix-1 step 1), sidebar/
   topbar/switcher shell with the UX-D9 nav, RecordShell / StatusBadge /
   EmptyState / ConfirmDialog / DataTable + DocList skeleton.
2. **F2.2 Pickers + line grid** (`feat/ui-pickers-linegrid`):
   ProductCombobox and siblings, LineGrid with the keyboard flow, scanner
   in Dialog. Replaces the raw selects and LineEditor internals.
3. **F2.3 Document lifecycle** (`feat/ui-doc-lifecycle`): D1 lists, D2/D3
   detail-entry pages for receipt, delivery, transfer, adjustment;
   draft save; post-lands-on-detail; reverse with confirm; old routes
   redirect. Largest phase; can split per document type.
4. **F2.4 Chains** (`feat/ui-po-so`): PO and SO screens (D4),
   create-from-source pre-fill, fulfillment display.
5. **F2.5 Opname flow** (`feat/ui-opname-flow`): D5 three-step flow
   replacing the current form.
6. **F2.6 Reports + entity details + dashboard** (`feat/ui-reports-details`):
   D6, D7, D8.

TanStack Form (fix-1 step 3) folds into whichever phase touches each
form. Rules carried from v1: no payload changes beyond the new
endpoints' documented shapes; existing tests keep passing; colors via
tokens only; new copy through Paraglide id+en with the industry-term
rule.

## Status

- [x] F2.1 Foundations + shell
- [x] F2.2 Pickers + line grid
- [x] F2.3 Document lifecycle
- [x] F2.4 Purchase/sales chains
- [x] F2.5 Opname flow
- [x] F2.6 Reports, entity details, dashboard

## Sources

Reference ERP mechanics: Odoo docs (receipts/deliveries, inventory
counting, print-on-validation, barcode ops), ERPNext docs (Purchase
Receipt, Delivery Note, Stock Reconciliation, workflows, barcode), SAP
B1 guides (GRPO copy-from, inventory counting/posting, cancellation
documents). Indonesian market: help.accurate.id (perintah/hasil stok
opname, penomoran, persetujuan, faktur dari penerimaan barang), Kledo
help (penyesuaian stok "Perhitungan Stok", surat jalan, scan barcode),
Mekari Jurnal help center, majoo panduan. Interaction patterns: NN/g
(confirmation dialogs, empty states, skeletons, disabled buttons,
breadcrumbs), Pencil and Paper enterprise data-table and filtering
guides, SAP Fiori value-help guidance, AG Grid keyboard-editing model,
cmdk/shadcn async combobox patterns, Stripe/Attio/Linear record-page
breakdowns.
