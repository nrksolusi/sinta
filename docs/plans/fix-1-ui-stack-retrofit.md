# Fix 1 - UI stack retrofit (shadcn, TanStack Form, TanStack Table)

The stack decision (`../PLAN.md` "Stack stands as-is: TanStack
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
Biome per `../CONVENTIONS.md`): `input`, `label`, `select`, `checkbox`,
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

## Rules

- No behavior or API change anywhere in this plan; payloads stay identical.
- Squash merge per step; `main` stays deployable between steps.
- New screens built while this plan is open follow the CLAUDE.md rule from
  day one - the affected-surface list above must only shrink.

## Status

- [ ] Step 1 - shadcn primitives sweep
- [ ] Step 2 - TanStack Table list screens
- [ ] Step 3 - TanStack Form migration
