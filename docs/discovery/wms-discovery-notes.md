# WMS Discovery Notes - Head of Warehouse Interview

Raw findings from a discovery interview with "Mr. X", Head of Warehouse at a
medium-to-large Indonesian distribution company. This document is the evidence
base; the filtered requirements live in [wms-prd.md](wms-prd.md). Nothing here
is a commitment - it is the unfiltered inventory of problems, feature
candidates, and opportunities.

## 1. Interview subject profile

- 16 years warehouse and supply chain experience, 6 as Head of Warehouse.
- Two legal entities (PT A main distribution, PT B for exclusive
  distributorships) sharing the same warehouses and staff.
- Network: 1 central warehouse (Jakarta, ~12,000 m2), 3 regional warehouses
  (Surabaya, Medan, Makassar), 7 branch warehouses under sales branch
  managers, 2 transit/cross-dock warehouses.
- ~8,500 active SKUs: ~7,000 FMCG, ~1,500 spare parts. 60-80 new SKUs/month.
- ~60 direct staff at central, three shifts; single shift elsewhere.
- Current systems: aging ERP with warehouse-level stock only; everything below
  warehouse level (bins, putaway, picking routes, count schedules) lives in
  Excel and staff memory. Barcode scanning at central + 2 regionals validates
  product only, not location. Branches are paper-based. No RFID (cost-killed).
- Upper end of "medium": several hundred billion IDR revenue, no automation,
  forklifts and pallet racking.

## 2. Findings by topic

### 2.1 Company structure and warehouse hierarchy

Process reality:

- Two tax entities, one physical operation. Stock of both entities (plus
  principal-owned consignment stock) sits under one roof, handled by one team.
- Hub-and-spoke: central buys from principals, replenishes regionals,
  regionals replenish branches. Transit warehouses consolidate eastern-island
  shipments; goods legally dwell there but are never "stored".
- Branch warehouses report to branch (sales) managers, not to the Head of
  Warehouse. The person approving branch adjustments carries a sales target,
  not an accuracy target.
- Inventory controllers nominally report to site managers whose bonuses depend
  on the numbers being audited.

Pains:

- Cross-entity picking (physically same product) creates month-end
  inter-company paperwork reconstruction.
- Branch stock accuracy is the worst in the network (no scanners, misaligned
  incentives).
- Transit warehouses are an ERP black hole: "in transit warehouse" and "on a
  ship" are indistinguishable; stock ages invisibly.
- Seasonal rented overflow warehouses need fast creation and clean closure.
- Staff float between sites; access should follow the person quickly.

### 2.2 Storage locations and bin management

Process reality:

- ERP knows stock per warehouse only. Physical discipline is manual:
  zone-aisle-rack-level-position addressing at central/regionals, location
  barcodes already installed but unused by software.
- Location types in physical use: pick face (ground, one SKU per facing),
  reserve/bulk racking, floor stacking lanes (FIFO by lane discipline),
  outbound staging lanes by route, quarantine, returns corner, damaged cage,
  air-conditioned room for heat-sensitive products.
- Slotting reviewed quarterly in Excel. Branches have no bins at all
  ("ask Pak Dedi").

Pains (ranked by the interviewee):

1. Phantom locations - pallets moved without record; 30-60 min/day/picker lost
   hunting. Called "my single biggest daily productivity leak".
2. Pick-face stockout while reserve stock sits overhead - replenishment is
   reactive, discovered by the picker.
3. Peak-season overflow chaos - floor-dumped inbound, "temporary" placements
   becoming permanent.
4. Slotting rot - dead SKUs squatting in golden-zone pick faces.
5. Partial-pallet proliferation - same SKU fragmented across reserve
   locations, nobody consolidates.

Edge cases: one pallet holding two batches (grain is location+SKU+batch, not
location+SKU); oversized/promo stock that fits no bin; blocked locations (roof
leak, damaged racking) with trapped stock; same SKU split across storage
conditions with one portion customer-reserved; bin-less rented overflow inside
an otherwise bin-controlled network.

Design warning from the field: over-modeling kills bin control. If a location
transaction is not doable one-handed, with gloves, in under five seconds,
staff will move stock physically and batch-fix the system later - making
location data "fiction with a timestamp".

### 2.3 Inventory ownership and consignment

Core principle stated: custody (where stock is) and ownership (whose it is)
are different dimensions; every ownership mistake becomes a tax, insurance, or
principal-relationship problem.

Ownership variants physically present:

- Own stock of entity A and entity B on the same shelves.
- Consignment IN from 2 principals (new-product push; slow expensive parts
  line). Ownership flips at the moment of sale to a customer, not at receipt.
  Kept in dedicated bays purely to make monthly principal reconciliation
  survivable. ERP does not see this stock at all.
- Consignment OUT to ~30 modern trade stores and 2 project customers - own
  stock in other people's buildings, tracked in per-customer Excel, decremented
  by customer sales reports, reconciled by occasional count visits. ~2 billion
  IDR of stock tracked this way.
- Customer-owned goods in custody (sold, invoiced, held for staged delivery).

Pains:

- Ownership flip lags physical movement by 1-3 days (usage report -> principal
  invoice), causing month-end cutoff wars with Finance.
- Consignment IN stockouts invisible to any system; replenishment depends on
  someone remembering to email the principal.
- Consignment OUT shrinkage eaten silently to protect commercial
  relationships.
- Cross-picking between owners: contractual breach invisible to physical eyes.
- Insurance exposure: unclear ownership records become disasters at claim time
  (competitor's fire anecdote: one year of insurer-vs-principal argument).

Edge cases: damaged principal stock converts to forced purchase; returns of
sold consignment stock physically re-shelved into the consignment bay
(books/shelves diverge); same SKU simultaneously owned and consigned (FEFO vs
sell-theirs-first allocation policy conflict); consignment customer
insolvency requiring an immediate defensible statement of goods; opname
variance allocation across owners (pro-rata unless attributable).

Design warning: do not model consignment as a special warehouse. Ownership is
an attribute of stock, not a place.

### 2.4 SKU management and units of measure

Process reality:

- Every product has >= 3 identities: internal code, principal article code,
  retail EAN-13. Parts add OEM part numbers and one-directional supersession
  chains.
- No variant grouping in the ERP; franchise-level reporting is Excel
  gymnastics.
- UoM stack: PCS base unit; some inner boxes; carton (CTN) as the operational
  unit; pallet as receiving/storage unit. Sales sells PCS to modern trade, CTN
  to wholesale; purchasing buys CTN.
- Orders in base units decompose on the floor into full cartons + loose pieces
  from a broken-case shelf. Breaking a carton is (or should be) a controlled,
  recorded act.

Pains:

1. Conversion factor changes mid-life (carton 48 -> 40 PCS, same piece EAN,
   both versions racked simultaneously for months). Called "my number one
   master data war story"; a single static conversion factor per SKU
   guarantees systematically wrong stock.
2. Duplicate SKUs from failed search + free-text descriptions; stock splits,
   purchasing double-orders.
3. Promo/free goods: zero-price bonus lines; dedicated promo packs
   ("170ml + 20% FREE") that are physically different SKUs with own EANs,
   living one quarter, polluting the master file forever.
4. Description chaos: no naming convention enforcement.
5. Loose-piece shrinkage: broken-case remainders are the least accurate stock
   in the building.
6. Dead SKUs never retired - nobody's KPI.

Edge cases: same outer barcode mapping to 2 SKUs (regular vs banded promo
pack); one SKU with 4+ concurrent valid barcodes (piece EAN, inner, ITF-14
carton, principal's legacy carton code); near-catch-weight lines (bulk oil,
rice) invoiced by actual weight on some contracts; repacking as
production-lite (buy 5kg bags, repack to 500g own-label pouches, with yield
loss - today booked as an adjustment with a memo); UoM rounding traps
(rounding 11.458 cartons silently short-ships 22 pieces).

Design hill-to-die-on: stock quantities must never be stored in cartons.
Pieces (base units) in the database, cartons on the screen.

### 2.5 Receiving and putaway

- Flow: security gate log -> count vs surat jalan -> check vs PO -> office
  keying hours later. Keying lag reaches a full day at peak; stock physically
  present is invisible to Sales.
- Dock-level discrepancy decisions (SJ 100 / physical 98 / PO 105) currently
  recorded as pencil notes.
- Batch/expiry captured by hand at the dock, typed later; typos become
  permanent batch-record lies.
- Putaway: forklift drivers place pallets "somewhere sensible" unrecorded -
  the phantom-location factory. Peak-time floor dumps become archaeology.
- Field constraint: receiving UX above scan-count-confirm per line gets
  batched back to the office, recreating the keying lag.

### 2.6 Picking, packing, shipping

- Flow: printed pick lists, assignment by supervisor intuition, self-routed
  pickers, 100% re-check by a dedicated checker (error rate 0.3-0.5% at
  check). The checker role exists only because picks are not scan-verified.
- No allocation/reservation logic: two pickers race for the last pallet;
  loser's order short-ships silently.
- Wave picking exists manually: admin groups orders by delivery route each
  morning.
- Packing meaningful only for modern trade and parts; wholesale ships in
  cartons.
- Shipping: surat jalan is the legal record of what left. Loading checked
  against paper; wrong-truck loading happens monthly. Staging lanes by route
  exist physically; no scan-on-load.
- POD (proof of delivery): signed paper returns days later; until then stock
  is legally in limbo and invoicing is dirty.

### 2.7 Transfers

- ERP has no in-transit state: stock subtracted at dispatch keying, added at
  receipt keying; for the 4 days in between, goods belong to nobody.
- Short receipts at branches dissolve into WhatsApp arguments; no structured
  discrepancy document, no escalation deadline.
- Needed: transfer-out and transfer-in as separate confirmations; in-transit
  visibility; receipt-vs-dispatch discrepancy flow with auto-escalation.

### 2.8 Adjustments, cycle counting, opname

- Adjustment is "the garbage chute": unexplained variance becomes reason
  "correction". Branch managers approve their own adjustments.
- Wanted: mandatory structured reason codes; value-tiered approval routing
  (supervisor < 500k IDR < Head of Warehouse < 5M IDR < Finance director);
  monthly adjustment report per site per reason code that names names.
- Cycle counting: central only, ABC-based (A monthly), collapses under load
  because lists are Excel.
- Opname: twice yearly, full network, weekend shutdown, ~40 people, blind
  paper counts, two rounds, 2 a.m. variance meetings. Halving opname duration
  pays for itself in overtime alone.

### 2.9 Returns, damaged goods, quarantine

- Returns arrive with drivers, with or without paperwork. Grading (sellable /
  damaged / expired) happens days later in the returns corner.
- Expired destruction requires a tax-officer witness for some categories - a
  real Indonesian regulatory flow.
- Principal damage claims need timestamped photo evidence; claim money is lost
  today because photos and paperwork drift apart.
- Recall scenario: freeze every carton of a batch across 13 warehouses in
  under an hour, including on-truck stock and shipped-in-last-N-days customer
  trace. Today: phone calls. Batch-trace with one-click network freeze was
  called "a board-level selling point".

### 2.10 Batch, expiry, serial

- Batch + expiry non-negotiable for FMCG; FEFO must be enforced at allocation,
  not aspirational.
- Per-customer shelf-life rules: modern trade rejects below ~70% remaining
  shelf life at their dock; allocation must know per-customer minimums.
- Serial numbers: only ~200 warranty-relevant parts SKUs. Serializing FMCG
  would double task times for zero value - tracking depth must be per-product.

### 2.11 Replenishment, backorders, reservations

- Two distinct replenishment loops: (a) pick-face min/max within a warehouse,
  task generated before the face empties, prioritized against open pick work;
  (b) network replenishment - branch stock targets driving suggested transfer
  orders. Branches currently order by feel.
- Backorders: currently cancel-and-reorder because held backorders without
  visibility create ghost commitments. A backorder with an honest promise date
  fed by inbound POs would change Sales behavior.
- Reservations: project stock held for weeks under a "JANGAN AMBIL" sticker.
  Needed as a system state with expiry dates and a reserved-but-idle report.

### 2.12 Purchasing, Sales, Finance touchpoints

- Purchasing: three-way match (PO / receipt / principal invoice); same-day
  visibility of short receipts to fight for credit notes.
- Sales: real-time per-warehouse ATP net of reservations and quarantine -
  "ATP is the whole relationship".
- Finance: journal access, valuation, month-end cutoff discipline,
  goods-received-not-invoiced report, in-transit value, adjustment audit
  trail. Hard rule: warehouse never touches valuation; finance never touches
  quantities.

### 2.13 Roles, approvals, audit

- Field roles: receiver, checker, picker, packer, dispatcher, forklift driver,
  inventory controller, supervisor, site manager.
- Role stacking must be allowed at small sites, separation of duties
  enforceable at large ones (counter cannot approve own count's adjustment;
  receiver cannot approve own discrepancy).
- Every movement stamped who/when/where/what/device, immutable. "Who touched
  it last" currently takes a day of Excel forensics.

### 2.14 Mobile and offline

- Android, cheap devices, big buttons, glove-operable. Camera scanning
  acceptable at branch volume; dedicated scanners at central/regionals.
- Offline-first is mandatory: dead corners, weekly internet loss at Makassar.
  Tasks download, execute offline, sync with conflict rules. A spinner during
  a pick sends staff back to paper permanently.
- Bahasa Indonesia UI for field staff.

### 2.15 KPIs and reporting

Head of Warehouse weekly set: stock accuracy per site (count variance %),
fill rate, order-to-ship lead time, receiving-to-available lag, picks per hour
per picker, adjustment value per site per reason, expiry risk (value expiring
in 30/60/90 days), dead stock > 180 days, space utilization.

Director set: inventory turnover, stock value by site and owner, shrinkage as
% of throughput.

Quote: the 90-day expiry-risk report "would save more money than most
features" - monthly Excel is too late for promo-driven salvage.

### 2.16 Adoption constraints (stated rejection triggers)

- Any task needing more than three taps.
- Any field screen requiring typing.
- Sync that loses work.
- English menus for field staff.
- Back office: any report that does not export to Excel.
- Verdict forms in the first week; win the pickers first.

## 3. Top problems, ranked by stated business impact

1. Receiving-to-available lag (up to 1 day at peak) - unsellable sellable
   stock.
2. Phantom locations - 30-60 min/day/picker of hunting.
3. No scan verification of picks - a full checker headcount layer plus
   0.3-0.5% error escaping to check.
4. FEFO not enforced systemically - expiry write-offs and customer dock
   rejections.
5. Adjustment abuse + self-approval at branches - shrinkage laundering.
6. In-transit invisibility on transfers - four-day ownership limbo, WhatsApp
   dispute resolution.
7. Consignment (both directions) tracked in Excel - ~2B IDR at customer sites,
   invisible principal stock in-house.
8. Conversion-factor drift (carton redefinition) - systematic stock error.
9. Opname cost - 40 people, 2 days, twice a year, paper.
10. Recall response time - hours-to-days instead of minutes.
11. Pick-face stockout with reserve overhead - short-ships with stock in
    house.
12. No expiry-risk forward visibility - salvage promos start too late.

## 4. Feature inventory (unfiltered)

Every candidate raised or implied in the interview. Tags: [F] field-facing,
[B] back-office-facing, [F/B] both.

### Master data and structure

1.  [B] Multi-entity (company) support over shared physical warehouses.
2.  [B] Warehouse types with distinct behavior: storage, transit/cross-dock,
    virtual/temporary.
3.  [B] Warehouse hierarchy with operational meaning (replenishment paths,
    transfer approval routing).
4.  [B] Fast creation and gated closure (zero-stock check) of temporary
    warehouses.
5.  [B] Zones and locations as first-class structure; per-warehouse
    granularity (warehouse-only, zone-level, full bin).
6.  [B] Location types with behavior: pick face, reserve, staging, quarantine,
    damaged, returns, receiving dock.
7.  [B] Location attributes (storage condition, weight limit, level).
8.  [F/B] Location blocking with reason codes + trapped-stock report.
9.  [B] Progressive granularity migration path (branch "grows into" bins
    without re-implementation).
10. [B] Product master with structured fields (brand, variant group, size,
    principal, category) and generated naming template.
11. [B] Duplicate-SKU detection at creation (EAN, principal code, name
    similarity).
12. [B] SKU lifecycle states (draft, active, phase-out, discontinued) driving
    ATP, replenishment, counts, slotting.
13. [B] Multiple barcodes per product, mapped to product + packaging level +
    validity period.
14. [F] Ambiguous-barcode resolution prompt at scan time.
15. [B] Versioned, dated packaging hierarchies (the 48->40 carton problem);
    carton version as a property of received stock.
16. [B] All quantities stored in base units; contextual display units
    (cartons + loose for field, any unit for reports).
17. [B] Variant/franchise grouping for rolled-up reporting.
18. [B] Promo-pack linkage to parent SKU (shared demand history, grouped
    reporting).
19. [B] Spare-parts supersession chains, direction-aware, applied at
    allocation.
20. [B] Per-product tracking depth: none / batch / batch+expiry / serial.
21. [B] Catch-weight-tolerant data model (not full support; do not preclude).

### Ownership and consignment

22. [B] Ownership as an attribute of every stock record (entity A/B, principal
    P, customer C) alongside product, batch, location.
23. [B] Ownership transfer as a recorded movement type with document trail
    (consignment usage, inter-company transfer, sale-with-held-delivery).
24. [B] Auto-generated principal usage report at goods issue of
    consignment-IN stock.
25. [B] Consignment-IN stock visible with min-level alerts driving principal
    replenishment requests.
26. [F/B] Consignment-OUT per-customer stock view: per product, per batch,
    decremented by customer sales reports, reconciled by count visits, with
    aging and variance history.
27. [B] "Value of our goods in other people's buildings" dashboard number.
28. [B] Ownership-aware allocation policy (consume consigned before own,
    FEFO override precedence, configurable).
29. [B] Ownership-aware ATP (customer-owned and quarantined stock never
    promised).
30. [B] Count variance allocation across owners (pro-rata or attributable)
    with per-owner paper trail.
31. [B] Inter-company transfer documents generated at the moment stock crosses
    entities.

### Receiving and putaway

32. [F] Scan-driven receiving against PO/ASN: scan, count, confirm per line;
    max 3 taps.
33. [F/B] Stock available for sale the moment receipt confirmation posts
    (kill keying lag).
34. [F] Batch/expiry capture at the dock via scan or minimal picker, validated
    at entry.
35. [F/B] Dock discrepancy recording (SJ vs physical vs PO) as a structured
    document, visible to Purchasing same day.
36. [F] Putaway tasks with suggested location, override-with-reason,
    scan-to-confirm at destination.
37. [B] Configurable putaway rules: velocity zone, weight, storage condition,
    one-SKU-per-pick-face.
38. [F] License plate / handling unit identity: build pallet at receiving,
    move the plate with one scan thereafter.
39. [B] Receiving queue/appointment visibility for peak-day dock planning.
40. [B] Cross-dock flow at transit warehouses: receive-split-dispatch without
    putaway, with dwell-time aging alerts.

### Picking, packing, shipping

41. [F] Scan-verified picking: scan location, scan product, confirm quantity.
42. [B] Hard allocation at order release (no two-pickers-one-pallet races).
43. [B] FEFO-enforced allocation for expiry-tracked products.
44. [B] Per-customer minimum remaining shelf-life rules applied at allocation.
45. [F] Pick tasks displayed in cartons + loose pieces, never raw base-unit
    totals.
46. [B] Wave/route grouping of orders (systemize the manual morning grouping).
47. [B] Pick path sequencing by location order.
48. [F] Broken-case management: break-carton as a one-scan recorded
    transaction to a broken-case location.
49. [B] Configurable check policy: 100% check, sampling by picker error rate,
    or no-check for scan-verified picks.
50. [F] Staging by route lane; scan-on-load against truck/route manifest
    (kill wrong-truck loading).
51. [B] Surat jalan generation at dispatch confirmation.
52. [F/B] POD capture (signature/photo/geotag) closing the delivery loop;
    "delivered vs in-limbo" stock states.
53. [B] Short-pick handling: reason capture, auto-notification to sales,
    backorder or cancel decision flow.

### Transfers

54. [B] Transfer order documents with suggested quantities from network
    replenishment.
55. [F] Transfer-out confirmation (scan-based) creating in-transit stock;
    transfer-in confirmation at destination.
56. [B] In-transit as a visible stock state with value reporting.
57. [F/B] Transfer discrepancy document when receipt != dispatch, with
    photo evidence, deadline, and auto-escalation.
58. [B] Transfer approval routing derived from warehouse hierarchy.

### Adjustments, counting, opname

59. [F/B] Adjustments with mandatory structured reason codes.
60. [B] Value-tiered adjustment approval routing; separation of duties
    (no self-approval).
61. [B] Monthly adjustment analytics per site, per reason, per approver.
62. [B] Cycle count scheduling engine: ABC class frequency, exception-triggered
    counts (short-pick location, negative stock), quiet-hour scheduling.
63. [F] Guided count tasks on device: blind counts, recount rules on variance.
64. [F/B] Opname mode: freeze scope, blind double-count workflow, variance
    dashboard live during the count, per-owner variance split, adjustment
    posting on approval.
65. [B] Count-accuracy history per site and per counter.

### Returns, damage, quarantine, recall

66. [F/B] Customer return document: expected vs received, per-line grading
    (sellable / damaged / expired), photo capture, disposition routing.
67. [B] Grading SLA tracking (returns corner aging).
68. [F/B] Damaged stock cage as a status+location: excluded from ATP, visible,
    with disposition workflow (claim, destroy, salvage).
69. [B] Principal claim pack generation: timestamped photos, receipt lineage,
    quantities - one export.
70. [B] Destruction workflow with witness record (tax officer) and certificate
    attachment.
71. [F/B] Quarantine status blocking allocation, with release approval.
72. [B] One-click batch freeze across all warehouses (recall mode).
73. [B] Batch trace: full movement lineage - received when, stored where,
    shipped to whom in last N days - in minutes.

### Batch, expiry, serial

74. [B] Batch+expiry tracking opt-in per product.
75. [B] Expiry risk report: value expiring in 30/60/90 days, by site, with
    enough lead time for salvage promos.
76. [B] Expiry status tiers: sellable, promo-only (below customer thresholds),
    blocked, destroy.
77. [F] Serial capture at receive/ship for the ~200 serialized parts SKUs
    only.
78. [B] Serial history for warranty lookups.

### Replenishment, reservation, backorder

79. [B] Pick-face min/max replenishment task generation, prioritized against
    open pick waves.
80. [B] Network replenishment suggestions: branch/regional stock targets
    generating draft transfer orders.
81. [B] Reservation as a stock state: per customer/project, with expiry date
    and reserved-but-idle report.
82. [B] Backorder management with promise dates fed by inbound POs.
83. [B] Consolidation suggestions for fragmented partial pallets.
84. [B] Slotting support: picks-per-period vs current zone ranking report.

### Integration

85. [B] PO integration (import or API) for receiving against POs.
86. [B] Three-way match support: receipt data to purchasing same day.
87. [B] Real-time ATP feed to sales channels, per warehouse, net of
    reservations/quarantine/customer shelf-life rules.
88. [B] Finance exports: movement journal, valuation snapshots,
    goods-received-not-invoiced, in-transit value, adjustment audit.
89. [B] Month-end cutoff support: period locks on effective dates.
90. [B] Customer sales report import (consignment OUT decrements).
91. [B] Principal statement import for consignment reconciliation.

### Roles, security, audit

92. [B] Role model: site-scoped, function-based, stackable at small sites.
93. [B] Configurable separation-of-duties rules (counter != adjuster,
    receiver != discrepancy approver).
94. [B] Time-bounded access grants (supervisor seconded to another site).
95. [B] Immutable audit: every movement stamped who/when/where/device.
96. [B] "Who touched this stock last" query in seconds, not a day of Excel.
97. [B] Hard permission wall: warehouse roles cannot see/touch valuation;
    finance roles cannot post quantity movements.

### Mobile and field UX

98. [F] Android app, cheap-device tolerant, big-target glove-friendly UI.
99. [F] Camera barcode scanning (branches) and hardware scanner support
    (central/regionals).
100. [F] Offline-first task execution: download, execute, sync; explicit
     conflict resolution rules; zero work loss.
101. [F] Bahasa Indonesia as primary field language.
102. [F] Max-3-tap task flows; no free typing in field screens.
103. [F] Task queue per worker with supervisor assignment and reassignment.
104. [B] Device management: which device did what, device-level disable.

### Reporting and KPIs

105. [B] Stock accuracy per site (count variance trend).
106. [B] Fill rate; order-to-ship lead time; receiving-to-available lag.
107. [B] Picks per hour per picker (with the explicit caveat it will be
     gamed if used as the sole productivity stick).
108. [B] Adjustment value per site per reason trend.
109. [B] Dead stock (>180 days) and space utilization.
110. [B] Inventory turnover; stock value by site and by owner; shrinkage %.
111. [B] Everything exportable to Excel. Non-negotiable for back office.
112. [B] Morning dashboard per role (Head of Warehouse vs site manager vs
     director).

## 5. Opportunities beyond parity

- Recall-readiness (batch freeze + trace in minutes) as a board-level
  differentiator; competitors' answer is phone calls.
- Expiry-risk forward radar tied to salvage-promo lead time - direct margin
  recovery.
- Consignment OUT visibility as a category gap: distributors uniformly run
  this on Excel; a real per-customer stock view is white space.
- Opname compression (blind double-count on devices, live variance) - directly
  monetizable as overtime savings; easy ROI story.
- Checker-layer elimination via scan-verified picking - a headcount-level
  saving, the strongest single ROI lever named.
- Indonesian regulatory fit (surat jalan formats, tax-witness destruction,
  faktur-friendly exports) as local moat against global WMS products.

## 6. Adoption risks

- Field rejection within week one if task UX exceeds 3 taps / requires typing
  / loses offline work / ships in English.
- Bin-level data decays into fiction if transactions are slower than the
  physical act.
- Branch sales managers are incentive-misaligned; they will resist adjustment
  controls. Executive sponsorship needed, not just warehouse sponsorship.
- Over-modeling: forcing bin codes or serial capture where the site/product
  does not need them.
- Big-bang network rollout; pilot central-first is strongly implied.

## 7. Open questions for next sessions

1. ERP integration surface: what can the incumbent ERP actually expose
   (API, file drop, database)? Deal-shaping constraint.
2. Who owns pricing/invoicing - stays in ERP? (Assumed yes; WMS stays out of
   money except valuation feeds.)
3. Volume peaks: order lines/day at central on a peak day, to size
   concurrency.
4. Labor regulations affecting shift/task data (productivity tracking may
   touch union/labor sensitivities).
5. Hardware budget reality per site tier.
6. Principal ASN availability: do any principals send advance shipping
   notices electronically, or is receiving always PO-only?
7. Multi-entity: is a single tenant with two legal entities the right model,
   or two tenants with shared warehouse views? (Interacts with tax/audit.)
