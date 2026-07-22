import { expect, test } from "vitest";
import { activeReportFilters, reportQuery } from "./-reports-data";

test("activeReportFilters lists only the filters that carry a value", () => {
  expect(activeReportFilters({})).toEqual([]);
  expect(activeReportFilters({ warehouseId: "w1" })).toEqual(["warehouseId"]);
  expect(activeReportFilters({ warehouseId: "w1", productId: "p1" })).toEqual([
    "warehouseId",
    "productId",
  ]);
});

test("activeReportFilters ignores empty-string values", () => {
  expect(
    activeReportFilters({ warehouseId: "", productId: undefined }),
  ).toEqual([]);
});

test("reportQuery drops absent filters and keeps present ones", () => {
  expect(reportQuery({})).toEqual({});
  expect(reportQuery({ warehouseId: "w1" })).toEqual({ warehouseId: "w1" });
  expect(reportQuery({ warehouseId: "w1", productId: "p1" })).toEqual({
    warehouseId: "w1",
    productId: "p1",
  });
  expect(reportQuery({ warehouseId: "", productId: "p1" })).toEqual({
    productId: "p1",
  });
});
