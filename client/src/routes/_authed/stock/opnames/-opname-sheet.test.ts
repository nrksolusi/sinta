import { describe, expect, test } from "vitest";
import type { components } from "@/lib/api-types";
import {
  appendOffSheetRow,
  buildSheet,
  computeReview,
  countedLines,
  resumeSheet,
  toLineInput,
} from "./-opname-sheet";

type StockOnHandRow = components["schemas"]["StockOnHandRow"];
type StockValuationRow = components["schemas"]["StockValuationRow"];
type StockOpname = components["schemas"]["StockOpname"];

const wid = "wh-1";

function sohRow(over: Partial<StockOnHandRow>): StockOnHandRow {
  return {
    productId: "p1",
    productName: "Indomie Goreng",
    sku: "IDM-001",
    qtyOnHand: "40",
    warehouseId: wid,
    warehouseCode: "GD-01",
    warehouseName: "Gudang Utama",
    ...over,
  };
}

describe("buildSheet", () => {
  test("one row per stock-on-hand row, uncounted, carrying systemQty and uom key", () => {
    const rows = [
      sohRow({ productId: "p1", qtyOnHand: "40" }),
      sohRow({
        productId: "p2",
        productName: "Beras 5kg",
        sku: "BRS-5",
        qtyOnHand: "12",
      }),
    ];
    const products = new Map([
      ["p1", { baseUom: "dus" }],
      ["p2", { baseUom: "sak" }],
    ]);
    const sheet = buildSheet(rows, products);
    expect(sheet).toHaveLength(2);
    expect(sheet[0]).toMatchObject({
      productId: "p1",
      productName: "Indomie Goreng",
      sku: "IDM-001",
      systemQty: 40,
      uom: "dus",
      countedQty: null,
      offSheet: false,
    });
    // Uncounted rows carry no counted value (never defaulted to 0).
    expect(sheet[0].countedQty).toBeNull();
    expect(sheet[1].systemQty).toBe(12);
  });

  test("keys batch rows separately so the same product with two batches is two rows", () => {
    const rows = [
      sohRow({
        productId: "p1",
        batchId: "b1",
        batchNo: "L-1",
        qtyOnHand: "10",
      }),
      sohRow({
        productId: "p1",
        batchId: "b2",
        batchNo: "L-2",
        qtyOnHand: "30",
      }),
    ];
    const sheet = buildSheet(rows, new Map([["p1", { baseUom: "dus" }]]));
    expect(sheet).toHaveLength(2);
    expect(sheet.map((r) => r.batchId)).toEqual(["b1", "b2"]);
    expect(sheet.map((r) => r.key)).toEqual(["p1::b1", "p1::b2"]);
  });

  test("falls back to the product base uom, then a sensible default", () => {
    const rows = [sohRow({ productId: "pX" })];
    const sheet = buildSheet(rows, new Map());
    expect(sheet[0].uom).toBe("");
  });
});

describe("appendOffSheetRow", () => {
  const base = buildSheet(
    [sohRow({ productId: "p1", qtyOnHand: "40" })],
    new Map([["p1", { baseUom: "dus" }]]),
  );

  test("returns the existing row key when the product is already on the sheet", () => {
    const { sheet, key, appended } = appendOffSheetRow(base, {
      id: "p1",
      name: "Indomie Goreng",
      sku: "IDM-001",
      baseUom: "dus",
      status: "active",
      isBatchTracked: false,
    });
    expect(appended).toBe(false);
    expect(key).toBe("p1::");
    expect(sheet).toHaveLength(1);
  });

  test("appends a zero-system off-sheet row for a product not on the sheet", () => {
    const { sheet, key, appended } = appendOffSheetRow(base, {
      id: "p9",
      name: "Kopi Sachet",
      sku: "KP-9",
      baseUom: "renceng",
      status: "active",
      isBatchTracked: false,
    });
    expect(appended).toBe(true);
    expect(sheet).toHaveLength(2);
    const added = sheet.find((r) => r.key === key);
    expect(added).toMatchObject({
      productId: "p9",
      systemQty: 0,
      offSheet: true,
      countedQty: null,
      uom: "renceng",
    });
  });
});

describe("computeReview", () => {
  const valuation = [
    {
      productId: "p1",
      batchId: undefined,
      avgCost: "98000",
    } as StockValuationRow,
    {
      productId: "p2",
      batchId: undefined,
      avgCost: "60000",
    } as StockValuationRow,
  ];

  test("counted rows produce selisih and estimated value; uncounted are excluded and listed", () => {
    let sheet = buildSheet(
      [
        sohRow({ productId: "p1", qtyOnHand: "40" }),
        sohRow({
          productId: "p2",
          productName: "Beras 5kg",
          sku: "BRS-5",
          qtyOnHand: "12",
        }),
      ],
      new Map([
        ["p1", { baseUom: "dus" }],
        ["p2", { baseUom: "sak" }],
      ]),
    );
    // Count p1 as 38 (short by 2), leave p2 uncounted.
    sheet = sheet.map((r) =>
      r.productId === "p1" ? { ...r, countedQty: 38 } : r,
    );

    const review = computeReview(sheet, valuation);
    expect(review.counted).toHaveLength(1);
    expect(review.counted[0]).toMatchObject({
      productId: "p1",
      systemQty: 40,
      countedQty: 38,
      variance: -2,
    });
    // -2 * 98000 = -196000
    expect(review.counted[0].valueEstimate).toBe(-196000);
    expect(review.varianceLineCount).toBe(1);
    expect(review.totalValueEstimate).toBe(-196000);
    // p2 uncounted -> excluded, surfaced by name.
    expect(review.uncounted.map((u) => u.productName)).toEqual(["Beras 5kg"]);
  });

  test("a counted row equal to system is counted but not a variance line", () => {
    let sheet = buildSheet(
      [sohRow({ productId: "p1", qtyOnHand: "40" })],
      new Map([["p1", { baseUom: "dus" }]]),
    );
    sheet = sheet.map((r) => ({ ...r, countedQty: 40 }));
    const review = computeReview(sheet, valuation);
    expect(review.counted).toHaveLength(1);
    expect(review.varianceLineCount).toBe(0);
    expect(review.counted[0].variance).toBe(0);
    expect(review.counted[0].valueEstimate).toBe(0);
  });

  test("off-sheet counted row (zero system) is a positive variance valued at avgCost", () => {
    let sheet = appendOffSheetRow(buildSheet([], new Map()), {
      id: "p2",
      name: "Beras 5kg",
      sku: "BRS-5",
      baseUom: "sak",
      status: "active",
      isBatchTracked: false,
    }).sheet;
    sheet = sheet.map((r) => ({ ...r, countedQty: 5 }));
    const review = computeReview(sheet, valuation);
    expect(review.counted[0]).toMatchObject({
      systemQty: 0,
      countedQty: 5,
      variance: 5,
    });
    // 5 * 60000
    expect(review.counted[0].valueEstimate).toBe(300000);
  });

  test("matches avgCost per batch when batched", () => {
    let sheet = buildSheet(
      [sohRow({ productId: "p1", batchId: "b1", qtyOnHand: "10" })],
      new Map([["p1", { baseUom: "dus" }]]),
    );
    sheet = sheet.map((r) => ({ ...r, countedQty: 8 }));
    const review = computeReview(sheet, [
      { productId: "p1", batchId: "b1", avgCost: "1000" } as StockValuationRow,
      { productId: "p1", batchId: "b2", avgCost: "9999" } as StockValuationRow,
    ]);
    expect(review.counted[0].valueEstimate).toBe(-2000);
  });
});

describe("countedLines / toLineInput", () => {
  test("countedLines keeps only rows with a numeric count (uncounted skipped at posting)", () => {
    let sheet = buildSheet(
      [
        sohRow({ productId: "p1", qtyOnHand: "40" }),
        sohRow({ productId: "p2", qtyOnHand: "12" }),
      ],
      new Map([
        ["p1", { baseUom: "dus" }],
        ["p2", { baseUom: "dus" }],
      ]),
    );
    sheet = sheet.map((r) =>
      r.productId === "p1" ? { ...r, countedQty: 0 } : r,
    );
    const lines = countedLines(sheet);
    // p1 counted as explicit 0 stays; p2 uncounted is dropped.
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe("p1");
  });

  test("toLineInput serialises countedQty as a decimal string with product/uom/batch", () => {
    const line = toLineInput({
      key: "p1::b1",
      productId: "p1",
      productName: "X",
      sku: "S",
      batchId: "b1",
      batchNo: "L1",
      systemQty: 5,
      uom: "dus",
      countedQty: 3,
      offSheet: false,
    });
    expect(line).toEqual({
      productId: "p1",
      uom: "dus",
      batchId: "b1",
      countedQty: "3",
    });
  });
});

describe("resumeSheet", () => {
  const draft: StockOpname = {
    id: "op-1",
    docDate: "2026-07-22",
    docNumber: null,
    notes: "",
    status: "draft",
    warehouseId: wid,
    lines: [
      { id: "l1", lineNo: 1, productId: "p1", uom: "dus", countedQty: "38" },
      { id: "l2", lineNo: 2, productId: "p9", uom: "renceng", countedQty: "4" },
    ],
  };

  test("overlays saved counts onto the regenerated sheet and appends off-sheet saved lines", () => {
    const soh = [sohRow({ productId: "p1", qtyOnHand: "40" })];
    const products = new Map([
      ["p1", { name: "Indomie", sku: "IDM-001", baseUom: "dus" }],
      ["p9", { name: "Kopi", sku: "KP-9", baseUom: "renceng" }],
    ]);
    const sheet = resumeSheet(draft, soh, products);
    // p1 comes from stock-on-hand with its saved count; p9 is off-sheet appended.
    const p1 = sheet.find((r) => r.productId === "p1");
    const p9 = sheet.find((r) => r.productId === "p9");
    expect(p1).toMatchObject({
      systemQty: 40,
      countedQty: 38,
      offSheet: false,
    });
    expect(p9).toMatchObject({
      systemQty: 0,
      countedQty: 4,
      offSheet: true,
      productName: "Kopi",
      sku: "KP-9",
    });
  });
});
