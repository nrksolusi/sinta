// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Product, ProductOption } from "@/lib/pickers-data";
import { productToOption } from "@/lib/pickers-data";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { ProductCombobox } from "./product-combobox";

overwriteGetLocale(() => "en");

const products: Product[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    sku: "SKU-1",
    name: "Kopi Bubuk 200g",
    baseUom: "pcs",
    isBatchTracked: false,
    barcode: "8991234567890",
    status: "active",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    sku: "SKU-2",
    name: "Teh Celup",
    baseUom: "box",
    isBatchTracked: false,
    status: "active",
  },
];

const options: ProductOption[] = products.map(productToOption);

function search(query: string): Promise<ProductOption[]> {
  const q = query.trim().toLowerCase();
  return Promise.resolve(
    q === ""
      ? options
      : options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            (o.code ?? "").toLowerCase().includes(q),
        ),
  );
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Select product" }));
}

test("typing filters the option list", async () => {
  const user = userEvent.setup();
  render(<ProductCombobox onSelect={() => {}} onSearch={search} />);

  await openPicker(user);
  const input = await screen.findByRole("combobox");
  await user.type(input, "Teh");

  expect(await screen.findByText("Teh Celup")).toBeTruthy();
  expect(screen.queryByText("Kopi Bubuk 200g")).toBeNull();
});

test("selecting an option fires onSelect with the product", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(<ProductCombobox onSelect={onSelect} onSearch={search} />);

  await openPicker(user);
  await user.type(await screen.findByRole("combobox"), "Kopi");
  await user.click(await screen.findByText("Kopi Bubuk 200g"));

  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect.mock.calls[0][0].id).toBe(
    "11111111-1111-1111-1111-111111111111",
  );
});

test("empty query shows recents", async () => {
  const user = userEvent.setup();
  render(
    <ProductCombobox
      onSelect={() => {}}
      onSearch={search}
      recentIds={["22222222-2222-2222-2222-222222222222"]}
    />,
  );

  await openPicker(user);

  expect(await screen.findByText("Recent")).toBeTruthy();
  expect(screen.getByText("Teh Celup")).toBeTruthy();
  expect(screen.queryByText("Kopi Bubuk 200g")).toBeNull();
});

test("no match shows the create affordance when allowCreate", async () => {
  const user = userEvent.setup();
  render(<ProductCombobox onSelect={() => {}} onSearch={search} allowCreate />);

  await openPicker(user);
  await user.type(await screen.findByRole("combobox"), "Nonexistent");

  expect(await screen.findByText(/Create product "Nonexistent"/)).toBeTruthy();
});

test("no match without allowCreate shows the not-found message", async () => {
  const user = userEvent.setup();
  render(<ProductCombobox onSelect={() => {}} onSearch={search} />);

  await openPicker(user);
  await user.type(await screen.findByRole("combobox"), "Nonexistent");

  expect(await screen.findByText("Not found")).toBeTruthy();
  expect(screen.queryByText(/Create product/)).toBeNull();
});

test("renders on-hand stock via format when the option carries it", async () => {
  const user = userEvent.setup();
  const withStock: ProductOption[] = [{ ...options[0], stock: 1500 }];
  render(
    <ProductCombobox
      onSelect={() => {}}
      onSearch={() => Promise.resolve(withStock)}
      warehouseId="ware-1"
    />,
  );

  await openPicker(user);
  await user.type(await screen.findByRole("combobox"), "Kopi");
  // 1500 renders through format.ts (id-ID) as "1.500".
  expect(await screen.findByText("1.500")).toBeTruthy();
});
