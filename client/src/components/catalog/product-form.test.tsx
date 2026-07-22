// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { Product } from "@/lib/catalog";
import { overwriteGetLocale } from "@/paraglide/runtime";
import { ProductForm } from "./product-form";

// The app's baseLocale is Indonesian (primary UI language); pin English here so
// these assertions on UI copy are deterministic.
overwriteGetLocale(() => "en");

const existing: Product = {
  id: "11111111-1111-1111-1111-111111111111",
  sku: "KOPI-200",
  name: "Kopi Bubuk 200g",
  baseUom: "pcs",
  isBatchTracked: false,
  barcode: "8991234567890",
  status: "active",
};

test("create mode submits the product and omits a blank barcode", async () => {
  const onSubmit = vi.fn();
  render(<ProductForm onSubmit={onSubmit} />);

  await userEvent.type(screen.getByLabelText("SKU"), "KOPI-200");
  await userEvent.type(
    screen.getByLabelText("Product name"),
    "Kopi Bubuk 200g",
  );
  await userEvent.type(screen.getByLabelText("Base unit"), "pcs");
  await userEvent.click(screen.getByLabelText("Batch tracked"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith({
    sku: "KOPI-200",
    name: "Kopi Bubuk 200g",
    baseUom: "pcs",
    isBatchTracked: true,
    barcode: undefined,
  });
});

test("edit mode locks the SKU and clearing the barcode sends an explicit empty string", async () => {
  const onSubmit = vi.fn();
  render(<ProductForm product={existing} onSubmit={onSubmit} />);

  const sku = screen.getByLabelText<HTMLInputElement>("SKU");
  expect(sku.disabled).toBe(true);

  await userEvent.clear(screen.getByLabelText("Barcode"));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  // Patch semantics (catalog.yaml): empty string clears the barcode; the SKU
  // is immutable and must not be part of the payload.
  expect(onSubmit).toHaveBeenCalledWith({
    name: "Kopi Bubuk 200g",
    baseUom: "pcs",
    isBatchTracked: false,
    barcode: "",
  });
});
