import type { components } from "./api-types";

type Product = components["schemas"]["Product"];

// A minimal barcode reader seam. Two implementations sit behind it: the native
// BarcodeDetector when the browser exposes it, and a @zxing/browser fallback
// for the rest (Safari, most desktop Chromium builds). The screens only ever
// see this interface, so the fallback path is exercised by swapping the reader.
export interface BarcodeReader {
  // Scans a single frame; resolves to the decoded value or null if nothing was
  // found in this frame.
  scan(video: HTMLVideoElement): Promise<string | null>;
  // Releases any decoder resources (the zxing reader holds a worker).
  stop(): void;
}

// Formats worth scanning for retail/warehouse goods. EAN/UPC cover most FMCG
// barcodes; code_128/code_39 cover internal labels.
const FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
] as const;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

// True when the browser ships the native BarcodeDetector API. Kept as a
// function so tests can assert both branches without module-level caching.
export function hasNativeBarcodeDetector(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector ===
      "function"
  );
}

function createNativeReader(): BarcodeReader {
  const Detector = (
    globalThis as unknown as {
      BarcodeDetector: new (opts?: {
        formats?: readonly string[];
      }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  const detector = new Detector({ formats: FORMATS });
  return {
    async scan(video) {
      const results = await detector.detect(video);
      return results[0]?.rawValue ?? null;
    },
    stop() {},
  };
}

async function createFallbackReader(): Promise<BarcodeReader> {
  // Lazy import so the ~200KB zxing bundle only loads on browsers that need it.
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();
  return {
    async scan(video) {
      try {
        // decodeOnceFromVideoElement resolves as soon as it finds a code in the
        // running stream; we call it per scan tick from the component loop.
        const result = await reader.decodeOnceFromVideoElement(video);
        return result.getText();
      } catch {
        // zxing throws NotFoundException when a frame has no barcode; that is a
        // normal "keep scanning" signal, not an error.
        return null;
      }
    },
    stop() {
      // Stream teardown is owned by the caller stopping the MediaStream; the
      // reader itself holds no long-lived worker in this version.
    },
  };
}

// Picks the best available reader. Native first, zxing fallback otherwise.
export async function createBarcodeReader(): Promise<BarcodeReader> {
  if (hasNativeBarcodeDetector()) return createNativeReader();
  return createFallbackReader();
}

// Resolves a scanned code to a product by exact barcode match. The catalog API
// has no barcode query param (confirmed against openapi.gen.yaml), so matching
// happens client-side over the already-loaded product list.
export function resolveProductByBarcode(
  barcode: string,
  products: readonly Product[],
): Product | null {
  const trimmed = barcode.trim();
  if (!trimmed) return null;
  return products.find((p) => p.barcode === trimmed) ?? null;
}
