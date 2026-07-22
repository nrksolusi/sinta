// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { CountStep } from "./-opname-flow";
import type { SheetRow } from "./-opname-sheet";

overwriteGetLocale(() => "en");

function renderStep(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // biome-ignore lint/suspicious/noExplicitAny: test-only router shim
  return render(<RouterProvider router={router as any} />);
}

const sheet: SheetRow[] = [
  {
    key: "p1::",
    productId: "p1",
    productName: "Indomie Goreng",
    sku: "IDM-001",
    systemQty: 40,
    uom: "dus",
    countedQty: 38,
    offSheet: false,
  },
  {
    key: "p2::",
    productId: "p2",
    productName: "Beras 5kg",
    sku: "BRS-5",
    systemQty: 12,
    uom: "sak",
    countedQty: null,
    offSheet: false,
  },
];

function noop() {}

test("count step shows the Sistem column and an uncounted row is flagged, not zeroed", async () => {
  renderStep(
    <CountStep
      sheet={sheet}
      blind={false}
      warehouseId="wh-1"
      flashKey={null}
      onCount={noop}
      onPick={noop}
      onOpenScanner={noop}
      onBack={noop}
      onSaveDraft={noop}
      saving={false}
      onNext={noop}
    />,
  );
  // Sistem column header present in show mode.
  expect(await screen.findByText("System")).toBeTruthy();
  // The uncounted row (Beras) shows the "not counted" flag and an empty input.
  expect(screen.getByText("not counted")).toBeTruthy();
  const berasInput = screen.getByLabelText(
    "Physical Beras 5kg",
  ) as HTMLInputElement;
  expect(berasInput.value).toBe("");
});

test("blind mode hides the Sistem column", async () => {
  renderStep(
    <CountStep
      sheet={sheet}
      blind
      warehouseId="wh-1"
      flashKey={null}
      onCount={noop}
      onPick={noop}
      onOpenScanner={noop}
      onBack={noop}
      onSaveDraft={noop}
      saving={false}
      onNext={noop}
    />,
  );
  await screen.findByText("Physical");
  expect(screen.queryByText("System")).toBeNull();
});

test("Lanjut is disabled until at least one row is counted", async () => {
  const uncountedOnly = sheet.map((r) => ({ ...r, countedQty: null }));
  renderStep(
    <CountStep
      sheet={uncountedOnly}
      blind={false}
      warehouseId="wh-1"
      flashKey={null}
      onCount={noop}
      onPick={noop}
      onOpenScanner={noop}
      onBack={noop}
      onSaveDraft={noop}
      saving={false}
      onNext={noop}
    />,
  );
  const next = await screen.findByRole("button", { name: "Next" });
  expect(next).toHaveProperty("disabled", true);
});

test("typing a count fires onCount with the row key and raw value", async () => {
  const user = userEvent.setup();
  const onCount = vi.fn();
  renderStep(
    <CountStep
      sheet={sheet}
      blind={false}
      warehouseId="wh-1"
      flashKey={null}
      onCount={onCount}
      onPick={noop}
      onOpenScanner={noop}
      onBack={noop}
      onSaveDraft={noop}
      saving={false}
      onNext={noop}
    />,
  );
  const berasInput = await screen.findByLabelText("Physical Beras 5kg");
  await user.type(berasInput, "9");
  expect(onCount).toHaveBeenCalledWith("p2::", "9");
});

test("off-sheet rows are labelled so they are visibly distinct", async () => {
  const withOffSheet: SheetRow[] = [
    {
      key: "p9::",
      productId: "p9",
      productName: "Kopi Sachet",
      sku: "KP-9",
      systemQty: 0,
      uom: "renceng",
      countedQty: 4,
      offSheet: true,
    },
  ];
  renderStep(
    <CountStep
      sheet={withOffSheet}
      blind={false}
      warehouseId="wh-1"
      flashKey={null}
      onCount={noop}
      onPick={noop}
      onOpenScanner={noop}
      onBack={noop}
      onSaveDraft={noop}
      saving={false}
      onNext={noop}
    />,
  );
  const table = await screen.findByRole("table");
  expect(within(table).getByText(/off-sheet/)).toBeTruthy();
});
