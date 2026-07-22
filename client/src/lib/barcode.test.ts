import { afterEach, describe, expect, test, vi } from "vitest";
import type { components } from "./api-types";
import {
  createBarcodeReader,
  hasNativeBarcodeDetector,
  resolveProductByBarcode,
} from "./barcode";

type Product = components["schemas"]["Product"];

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
    baseUom: "pcs",
    isBatchTracked: false,
    status: "active",
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveProductByBarcode", () => {
  test("matches a product by exact barcode", () => {
    expect(resolveProductByBarcode("8991234567890", products)).toBe(
      products[0],
    );
  });

  test("trims whitespace before matching", () => {
    expect(resolveProductByBarcode("  8991234567890 ", products)).toBe(
      products[0],
    );
  });

  test("returns null when nothing matches", () => {
    expect(resolveProductByBarcode("0000000000000", products)).toBeNull();
  });

  test("returns null for an empty scan", () => {
    expect(resolveProductByBarcode("   ", products)).toBeNull();
  });

  test("ignores products without a barcode", () => {
    expect(resolveProductByBarcode("", products)).toBeNull();
  });
});

describe("createBarcodeReader native path", () => {
  test("uses the native BarcodeDetector when present", async () => {
    const detect = vi.fn().mockResolvedValue([{ rawValue: "8991234567890" }]);
    class FakeBarcodeDetector {
      detect = detect;
    }
    vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);

    expect(hasNativeBarcodeDetector()).toBe(true);
    const reader = await createBarcodeReader();
    const value = await reader.scan({} as HTMLVideoElement);

    expect(value).toBe("8991234567890");
    expect(detect).toHaveBeenCalledOnce();
  });
});

describe("createBarcodeReader fallback path", () => {
  test("falls back to @zxing/browser when BarcodeDetector is undefined", async () => {
    // The required test: with no native detector, the reader must come from the
    // zxing fallback and still decode a frame.
    vi.stubGlobal("BarcodeDetector", undefined);
    expect(hasNativeBarcodeDetector()).toBe(false);

    const decodeOnceFromVideoElement = vi.fn().mockResolvedValue({
      getText: () => "8991234567890",
    });
    vi.doMock("@zxing/browser", () => ({
      BrowserMultiFormatReader: class {
        decodeOnceFromVideoElement = decodeOnceFromVideoElement;
      },
    }));

    // Re-import with the mock active so the lazy import resolves to the stub.
    vi.resetModules();
    const { createBarcodeReader: create } = await import("./barcode");
    const reader = await create();
    const value = await reader.scan({} as HTMLVideoElement);

    expect(value).toBe("8991234567890");
    expect(decodeOnceFromVideoElement).toHaveBeenCalledOnce();

    vi.doUnmock("@zxing/browser");
  });

  test("fallback returns null when the frame has no barcode", async () => {
    vi.stubGlobal("BarcodeDetector", undefined);

    vi.doMock("@zxing/browser", () => ({
      BrowserMultiFormatReader: class {
        decodeOnceFromVideoElement = vi
          .fn()
          .mockRejectedValue(new Error("NotFoundException"));
      },
    }));

    vi.resetModules();
    const { createBarcodeReader: create } = await import("./barcode");
    const reader = await create();
    const value = await reader.scan({} as HTMLVideoElement);

    expect(value).toBeNull();
    vi.doUnmock("@zxing/browser");
  });
});
