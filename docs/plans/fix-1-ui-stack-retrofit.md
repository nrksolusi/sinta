# Fix 1 - UI stack retrofit (shadcn, TanStack Form, TanStack Table)

> **Status: Done - shipped to `main`** (its steps were absorbed into the fix-2
> implementation phases).

The stack decision (`../reference/PLAN.md` "Stack stands as-is: TanStack
Router/Query/Table/Form, Tailwind 4 + shadcn") was set up in M0 but never
enforced: all three are installed in `client/package.json` and shadcn is
configured (`components.json`), yet only `Button` and `Sonner` were ever
generated. Every screen since was built as the smallest thing that passed its
test, so the client accumulated hand-rolled styled `<input>`/`<select>`
elements, `useState`-per-field forms, and `<ul className="divide-y">` lists.

This is drift, not a decision - no ADR covers it, and the divergence deepens
with every new screen. The reports and document screens are exactly where
Table and Form start paying off, so the retrofit should land before those
grow further.

The CLAUDE.md load-bearing rule ("Client UI stack") now enforces the stack
for new work; this plan tracks bringing the existing screens in line.

Design counterpart: `fix-2-ui-redesign.md` specifies the information
architecture and what each screen should be (document lifecycle, page
prototypes). fix-2 is the driving plan; its "Implementation phases"
absorb the steps below (step 1 into F2.1, step 2 into F2.3, step 3
folds in per form).

## Affected surface (as of 552067a)

Hand-rolled form state and/or raw styled elements:

- `client/src/components/login-form.tsx`
- `client/src/components/catalog/product-form.tsx` (+ test)
- `client/src/components/warehouse/line-editor.tsx`
- `client/src/routes/register.tsx`
- `client/src/routes/_authed/onboarding.tsx`
- `client/src/routes/_authed/route.tsx` (raw `<select>` tenant switcher)
- `client/src/routes/_authed/settings/{profile,members,invites}.tsx`
- `client/src/routes/_authed/catalog/{products,partners,warehouses}.tsx`
- `client/src/routes/_authed/{receive,delivery,opname}.tsx`

List rendering as `<ul>` instead of a table/column model: catalog products,
partners, warehouses; settings members, invites; any M1 report screen that
copied the pattern.

## Steps (ordered by value, each its own branch + squash merge)

### Step 1 - shadcn primitives sweep (`fix/ui-shadcn-primitives`)

Generate the missing primitives into `src/components/ui` (excluded from
Biome per `../reference/CONVENTIONS.md`): `input`, `label`, `select`, `checkbox`,
`card`, `table`, `badge`, `dialog`. Then sweep every raw styled element to
the generated component:

- `<input className="w-full rounded-md border px-3 py-2">` -> `<Input>` +
  `<Label>`.
- Raw `<select>` (tenant switcher, any filter dropdowns) -> shadcn `Select`.
- Ad-hoc `rounded-md border p-4` panels -> `Card` where it reads better;
  status chips (e.g. `catalog_status_archived`) -> `Badge`.

Mechanical, no behavior change; existing component tests must pass
unmodified (they assert on roles/labels, not markup). Biggest
visual-consistency win, unblocks nothing but de-risks the later steps.

Done notes:

- Also generated `textarea` (document-note fields) - same primitive family,
  not in the original list. Swept the barcode-scanner manual-entry input too
  (postdates the 552067a snapshot).
- Left intentionally native/unswept: the `line-editor.tsx` product picker
  `<select>` (its test drives a native `combobox` via `selectOptions`; it is a
  Step 3 target) and the onboarding costing radios (no `radio-group` primitive
  in scope). Panels stay as bordered `<div>`s - `Card`/layout is fix-2's remit.
- Base UI (not Radix) quirks: `Checkbox` renders an interactive control plus a
  hidden input, so a `<label htmlFor>` double-matches in tests. Pattern used:
  caption in a `<span id="x-label">` with `aria-labelledby="x-label"` on the
  `Checkbox`. `Select.onValueChange` yields `string | null`, so handlers guard
  the value; numeric selects (onboarding fiscal month) round-trip via `String`.

### Step 2 - TanStack Table for list screens (`fix/ui-tanstack-table`)

Introduce one shared thin wrapper (e.g. `src/components/data-table.tsx`
composing `useReactTable` + shadcn `Table`), then convert:

- catalog products, partners, warehouses
- settings members, invites

Column defs per screen; keep current inline-edit behavior (row expands to
form) by rendering an expansion row. Sorting on name/code/status comes free
and is the point: report screens (stock card, stock balance) inherit this
wrapper instead of the `<ul>` pattern.

TDD seam: component tests per converted screen asserting rows render and
sort toggles order (English locale pinned via `overwriteGetLocale`).

Done notes:

- The tested seam is `data-table.tsx` itself (rows render, sortable header
  toggles order, expanded row renders) - `data-table.test.tsx`. The route
  screens need router/query/session context to render, so they are covered by
  typecheck + build and by keeping behavior identical, not per-screen tests;
  the sort/expansion logic they rely on is proven once at the wrapper seam.
- `DataTable` API: `columns`/`data`/`getRowId`, client-side sorting on accessor
  columns (headers become buttons; icon-only indicators keep the accessible
  name = header text), and controlled inline edit via `expandedRowId` +
  `renderExpandedRow`. Column defs live in each screen behind `useMemo`;
  per-row mutation handlers are wrapped in `useCallback` (Biome
  exhaustive-deps).
- Added header message keys `field_name`/`field_email`/`field_role` (en+id) for
  the members/invites columns; ran `pnpm generate-i18n`.
- Left as `<ul>`: the UomSection unit list inside the product edit expansion (a
  small key-value sub-list, not a primary data list) and `line-editor.tsx`
  document lines (a Step 3 target).

### Step 3 - TanStack Form migration (`fix/ui-tanstack-form`)

Lowest urgency - current forms are simple - but do it before document entry
screens grow line-item editing, where hand-rolled field arrays get painful.

- Convert in this order: ProductForm, PartnerForm, WarehouseForm (smallest,
  already component-tested), then settings profile/invites, then
  login/register/onboarding, last the warehouse `line-editor.tsx` (field
  array - the real payoff).
- Validation stays minimal (required, cross-field like PartnerForm's
  "supplier or customer" rule); wire it through the form library, not
  ad-hoc `disabled` logic.
- Existing payload-shape tests (e.g. `product-form.test.tsx` barcode
  omit/clear semantics) are the regression net; they must pass unmodified.

Done notes:

- Migrated to `useForm`: ProductForm, PartnerForm, WarehouseForm, settings
  profile, settings invites (create-invite role picker). login/register/
  onboarding were already on TanStack Form. `product-form.test.tsx` passes
  unmodified.
- PartnerForm's "supplier or customer" rule now runs through the form
  (`validators.onMount`/`onChange`) and the submit button reflects
  `form.state.canSubmit` instead of ad-hoc `disabled`.
- Profile split into a loader section + `TenantProfileForm` child so `useForm`
  defaultValues bind to the loaded tenant (hooks can't sit after the null
  guard). PATCH now always sends the current name/legalName rather than
  omitting untouched fields - idempotent, same observed result.
- `line-editor.tsx` field-array deferred by decision: it is a controlled
  component (parents own `lines`), so the field-array payoff only lands when
  receive/delivery/opname adopt `useForm` with `lines` as a field array. That
  belongs with the document-entry form work under fix-2's document lifecycle,
  not a risky refactor of those untested screens here. line-editor keeps its
  controlled `lines`/`onChange` contract and its test is untouched.

## Rules

- No behavior or API change anywhere in this plan; payloads stay identical.
- Squash merge per step; `main` stays deployable between steps.
- New screens built while this plan is open follow the CLAUDE.md rule from
  day one - the affected-surface list above must only shrink.

## Status

- [x] Step 1 - shadcn primitives sweep
- [x] Step 2 - TanStack Table list screens
- [x] Step 3 - TanStack Form migration (line-editor field array deferred to the
      document-entry form work; see done notes)
