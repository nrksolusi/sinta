# PRD: Warehouse Management System for Indonesian Distributors

Status: draft v1
Evidence base: [wms-discovery-notes.md](wms-discovery-notes.md) - every
requirement below cites the pain (P#) or feature candidate (F#) it traces to.
Sections 3-4 of the notes hold the ranked pains and the full unfiltered
feature inventory.

## 1. Problem statement

Mid-size Indonesian distributors (5-15 warehouses, 2,000-10,000 SKUs) run
warehouse-level stock in an ERP and everything that actually operates the
warehouse - locations, putaway, picking, counting - in Excel and staff memory.
The measurable consequences at our reference company:

- Stock received is unsellable for up to a day (keying lag). [P1]
- Each picker loses 30-60 minutes daily hunting misplaced pallets. [P2]
- A full checker headcount layer exists solely because picks are not
  scan-verified; 0.3-0.5% of picks still reach checking wrong. [P3]
- FEFO is a wall poster, not a system rule: expiry write-offs and modern-trade
  dock rejections follow. [P4]
- Twice-yearly opname consumes 40 people for a 2-day weekend shutdown. [P9]

The wedge is the physical execution layer the ERP does not have, not a
replacement for the ERP.

## 2. Goals

- G1: Stock is system-available within 15 minutes of physical receipt
  confirmation at the dock.
- G2: Location accuracy >= 98% at bin-controlled sites (pallet is where the
  system says it is).
- G3: Pick error rate at or below 0.05% without a 100%-check layer.
- G4: 100% of expiry-tracked allocations follow FEFO or a logged override.
- G5: Opname duration halved against the paper baseline.
- G6: Field task flows complete in <= 3 taps, offline-tolerant, in Indonesian.

## 3. Non-goals

Stated up front because WMS projects die by drifting toward ERP replacement:

- No pricing, invoicing, tax documents, or accounts payable/receivable. Money
  appears only as stock valuation and finance export feeds.
- No transportation management (route optimization, fleet). We stop at
  scan-on-load and POD capture.
- No demand forecasting engine in v1; network replenishment uses min/max
  targets, not prediction.
- No RFID, no automation/conveyor integration, no voice picking.
- No full catch-weight support (data model must not preclude it; see notes
  F21).
- No manufacturing module; repack/kitting is a bounded flow (P2 phase), not
  MRP.
- Serial tracking beyond receive/ship capture for designated SKUs (no
  component-level genealogy).

## 4. Personas

- **Picker/Receiver (field)** - low-friction task execution; judged the app
  "in the first week". Android, gloves, Indonesian, offline corners.
- **Warehouse supervisor (field/office)** - assigns and monitors tasks,
  resolves discrepancies, approves small adjustments.
- **Inventory controller (office/field)** - counts, investigates variance,
  needs "who touched it last" in seconds.
- **Head of Warehouse (back office)** - network KPIs, adjustment analytics,
  expiry risk, slotting; the economic buyer's operator.
- **Purchasing admin (back office)** - same-day receipt discrepancies for
  credit-note fights.
- **Sales admin (back office)** - trustworthy per-warehouse ATP.
- **Finance (back office)** - journal, valuation, cutoff, exports; never
  touches quantities.

## 5. Scope and phasing

Filter applied (per Mr. C): P0 is only what the three named must-haves
require - scan-verified receiving with immediate availability, scan-verified
FEFO picking, real locations - plus the foundations they cannot exist
without. P1 has intent statements. P2 has one-liners. Everything else from
the inventory is explicitly deferred, not forgotten.

### 5.1 P0 - pilot at central warehouse

**Foundations**

- R1. Product master with structured fields, base-unit storage, unit
  conversions, multiple dated barcodes per product, duplicate detection at
  create. (F10-F16; base-unit rule is absolute - quantities are never stored
  in cartons.)
- R2. Per-product tracking depth: none / batch / batch+expiry. Serial
  deferred to P2. (F20, F74)
- R3. Warehouse > zone > location structure with location types (pick face,
  reserve, staging, quarantine, damaged, returns, dock) and per-warehouse
  granularity - a site may run warehouse-only. (F5, F6, F9)
- R4. Location blocking with reason + trapped-stock report. (F8)
- R5. Append-only movement journal; every movement stamped
  who/when/where/device; immutable. (F95, F96)
- R6. Role model: site-scoped, stackable; hard wall between quantity roles
  and valuation visibility. (F92, F97)
- R7. Mobile task app: Android, camera + hardware scanner, offline task
  execution with zero work loss, Indonesian UI, <= 3 taps per task step, no
  free-text typing in field flows. (F98-F103)

**Receiving and putaway**

- R8. Scan-driven receiving against a PO (imported or manually created):
  scan barcode, enter/confirm count, capture batch+expiry inline for tracked
  products; posting the receipt makes stock available immediately. (F32-F34)
- R9. Dock discrepancy capture per line (SJ vs physical vs PO) as structured
  data, exportable/visible same day. (F35)
- R10. Putaway tasks with suggested location by static rules (zone, one SKU
  per pick face), override-with-reason, scan-to-confirm destination. (F36,
  F37)

**Picking and dispatch**

- R11. Order import/entry producing pick tasks with hard allocation at
  release - allocated stock is invisible to other orders. (F42)
- R12. FEFO allocation for expiry-tracked products; override requires a
  reason and is logged. (F43)
- R13. Scan-verified picking: scan location, scan product, confirm quantity;
  quantities displayed as cartons + loose. (F41, F45)
- R14. Break-carton as a one-scan transaction into a broken-case location.
  (F48)
- R15. Short-pick capture with reason; order line flagged for back-office
  decision. (F53)
- R16. Dispatch confirmation generating the surat jalan; staging lane
  recorded. Scan-on-load deferred to P1. (F51)

**Counting (minimum viable trust loop)**

- R17. Ad-hoc and scheduled count tasks on device, blind entry, variance
  above threshold triggers recount before an adjustment draft. (F62, F63)
- R18. Adjustments with mandatory reason codes and two-level value-tiered
  approval; no self-approval (separation of duties). (F59, F60, F93)

**Back office**

- R19. Stock view: on-hand / allocated / quarantined / damaged / blocked by
  product, batch, location, warehouse. Excel export on every table. (F111)
- R20. Movement journal browser with "who touched this product/location
  last" filtering. (F96)

P0 acceptance criteria (samples - full set to be written per requirement):

- Receiving: a 20-line PO receipt with batch capture completes at the dock in
  under 10 minutes; stock is allocatable the moment posting succeeds; a line
  received short produces a discrepancy record visible in back office within
  the same session.
- Picking: a pick task cannot complete without location scan + product scan
  matching the allocation; a FEFO-violating manual pick requires a reason and
  appears in an override report; two concurrent orders can never allocate the
  same stock twice.
- Offline: a picker completes 10 pick lines in airplane mode; reconnecting
  syncs all 10 with zero loss and correct journal timestamps; a conflicting
  concurrent movement surfaces as an explicit exception, not silent
  overwrite.
- Locations: after two weeks of pilot operation, a spot audit of 100 random
  pallets finds >= 98 at their system location.

### 5.2 P1 - network operations (intent, not criteria)

- Transfers with in-transit state: transfer-out/in as separate scan
  confirmations, discrepancy document with photo evidence and escalation
  deadline. (P6; F54-F58)
- Ownership dimension on stock: entity A/B and consignment IN (principal
  ownership, usage report generated at issue). Ownership-aware ATP.
  (P7; F22-F25, F28, F29, F31)
- Pick-face min/max replenishment tasks generated before the face empties,
  prioritized against open pick work. (P11; F79)
- Wave/route grouping and pick-path sequencing; scan-on-load against a route
  manifest. (F46, F47, F50)
- Cycle count engine: ABC schedules, exception-triggered counts; count
  accuracy history. (F62, F65)
- Opname mode: scope freeze, blind double-count, live variance dashboard,
  per-owner variance split. (P9; F64)
- Expiry radar: 30/60/90-day value-at-risk report per site; expiry status
  tiers including promo-only. (P12; F75, F76)
- Batch trace and one-click network batch freeze (recall mode). (P10; F72,
  F73)
- Returns intake with per-line grading, photo capture, disposition routing;
  damaged-cage workflow; principal claim pack export. (F66-F69)
- ATP feed (API) per warehouse net of reservations/quarantine; reservation as
  a stock state with expiry and idle report. (F81, F87)
- Finance exports: valuation snapshot, goods-received-not-invoiced,
  in-transit value, adjustment audit; period locks. (F88, F89)
- License plate / handling unit for full-pallet moves. (F38)
- Versioned packaging definitions (the 48->40 carton problem). (P8; F15)
- Adjustment analytics per site/reason/approver. (F61)
- Branch mode: warehouse-level (bin-less) operation of the same document
  flows, camera scanning. (F9)

### 5.3 P2 - depth and differentiation (one-liners)

- Consignment OUT per-customer stock visibility with sales-report import and
  count-visit reconciliation. (F26, F27, F90)
- Network replenishment suggestions from branch min/max targets. (F80)
- Backorders with promise dates fed by inbound POs. (F82)
- Per-customer minimum shelf-life allocation rules. (F44)
- Cross-dock flow with dwell-time alerts for transit warehouses. (F40)
- Slotting and consolidation suggestion reports. (F83, F84)
- Serial capture for designated parts SKUs; supersession chains. (F19, F77,
  F78)
- Repack/kitting orders with yield variance. (notes 2.4 edge cases)
- Destruction workflow with witness record; POD capture; temporary
  warehouses; time-bounded access grants; role dashboards; three-way match
  deepening; principal statement import. (F70, F52, F4, F94, F112, F86, F91)

### 5.4 Explicitly out (with reason)

- RFID (business case fails at FMCG margin per carton - interview 1).
- Voice picking, automation integration (hardware reality: none installed).
- Full catch-weight (2 product lines; manual notes acceptable; model must not
  preclude).
- Demand forecasting (min/max first; forecasting without clean data is
  theater).
- Picker productivity leaderboards as a v1 feature (gaming risk flagged by
  interviewee; ship measurement before incentives).

## 6. Non-functional requirements

- N1. Offline-first field app: all assigned tasks executable without
  connectivity; sync is conflict-explicit, never lossy. A spinner mid-pick is
  a launch blocker. (notes 2.14, 2.16)
- N2. Field task interaction budget: <= 3 taps per step, no typing, glove-size
  touch targets, readable in warehouse light on cheap Android.
- N3. Localization: Indonesian primary, English secondary; id-ID number,
  currency, date formats throughout.
- N4. Every back-office table exports to Excel.
- N5. Journal immutability and full audit stamps (who/when/where/device) on
  every movement; corrections are new entries, never edits.
- N6. Quantities stored in base units as exact decimals (never floats, never
  cartons); presentation-unit conversion at display time only.
- N7. Concurrency: allocation and movement posting safe under simultaneous
  multi-device operation per site (peak sizing pending open question 3).
- N8. Multi-tenant isolation; within a tenant, site-scoped permissions.
- N9. Pilot-scale performance target: central warehouse, 3 shifts, all
  receiving/picking flows at peak season without degraded task latency
  (< 1s local task interactions; sync latency invisible to task flow).

## 7. Success metrics

Measured at the pilot site, baseline vs +90 days:

- Receiving-to-available lag: baseline up to 24h -> < 15 min (G1).
- Location accuracy spot audits: -> >= 98% (G2).
- Pick errors reaching checker: 0.3-0.5% -> <= 0.05%; checker sampling rate
  reduced from 100% to <= 20% without customer-complaint increase (G3).
- FEFO compliance: 100% enforced-or-logged (G4).
- Field adoption: >= 90% of receipts and picks executed on-device (not
  paper-then-keyed) by week 4 - the leading indicator that predicts
  everything else.
- Opname duration at first device-based opname: <= 50% of paper baseline
  (G5, first measurable at P1).

## 8. Risks

- Field rejection in week one (tap budget, offline loss, English leakage).
  Mitigation: pilot with pickers in the room during design; N1/N2 are launch
  gates, not aspirations.
- Bin data decay if transactions are slower than the physical act.
  Mitigation: time every field flow against a stopwatch in UAT; license-plate
  moves prioritized early in P1.
- Branch-manager incentive misalignment against adjustment controls.
  Mitigation: executive sponsor sign-off on approval matrix before branch
  rollout; branch rollout is P1-late, after central proves value.
- ERP integration surface unknown (open question 1) - could force file-drop
  integration; keep PO import format-agnostic (CSV first, API when possible).
- Scope gravity toward ERP replacement. Mitigation: non-goals section is
  contractual; any money-flow feature request routes to a PLAN change first.
- Master data quality at migration (duplicate SKUs, dead codes). Mitigation:
  migration tooling includes duplicate detection and lifecycle-state triage
  as part of onboarding, not an afterthought.

## 9. Open questions

Carried from discovery (notes section 7): ERP integration surface; peak
volume sizing; principal ASN availability; multi-entity tenancy model;
hardware budget per site tier; labor-regulation sensitivity of productivity
data. Owners and deadlines to be assigned before P0 build starts.

## 10. Traceability

Every P0/P1 requirement cites feature candidates (F#) and pains (P#) from
[wms-discovery-notes.md](wms-discovery-notes.md). When a stakeholder asks
"why is X not in P0", the answer is section 5's filter: X does not block
scan-verified receiving, scan-verified FEFO picking, or location truth - the
three things the Head of Warehouse named as the first release, and the three
whose absence makes everything else unmeasurable.
