import { expect, test } from "vitest";
import type { StockCardEntry } from "./-stock-card-data";
import { docHref, signedQty, sortEntriesNewestFirst } from "./-stock-card-data";

test("docHref maps known doc types to their record routes", () => {
  expect(docHref("goods_receipt", "d1")).toBe("/purchases/receipts/d1");
  expect(docHref("stock_adjustment", "d6")).toBe("/stock/adjustments/d6");
  expect(docHref("delivery", "d9")).toBe("/sales/deliveries/d9");
});

test("docHref returns null when doc type is unknown or ids are missing", () => {
  expect(docHref("mystery_doc", "d1")).toBeNull();
  expect(docHref("goods_receipt", undefined)).toBeNull();
  expect(docHref(undefined, "d1")).toBeNull();
});

test("signedQty prefixes positive quantities and leaves negatives as-is", () => {
  expect(signedQty("24")).toBe("+24");
  expect(signedQty("-12")).toBe("-12");
  expect(signedQty("0")).toBe("0");
});

test("sortEntriesNewestFirst orders by descending seq without mutating input", () => {
  const entries = [
    { seq: 1, movementId: "a" },
    { seq: 3, movementId: "c" },
    { seq: 2, movementId: "b" },
  ] as StockCardEntry[];
  const sorted = sortEntriesNewestFirst(entries);
  expect(sorted.map((e) => e.movementId)).toEqual(["c", "b", "a"]);
  expect(entries.map((e) => e.movementId)).toEqual(["a", "c", "b"]);
});
