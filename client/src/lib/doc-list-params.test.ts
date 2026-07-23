import { describe, expect, it } from "vitest";
import { buildDocListParams } from "./doc-list-params";

describe("buildDocListParams", () => {
  it("empty filters → empty params", () => {
    expect(buildDocListParams({})).toEqual({});
  });

  it("status filter → status param", () => {
    expect(buildDocListParams({ status: "draft" })).toEqual({
      status: "draft",
    });
  });

  it("warehouse filter → warehouseId param", () => {
    expect(buildDocListParams({ warehouse: "wh-id" })).toEqual({
      warehouseId: "wh-id",
    });
  });

  it("dateRange filter → dateFrom and dateTo", () => {
    expect(buildDocListParams({ dateRange: "2024-01-15" })).toEqual({
      dateFrom: "2024-01-15",
      dateTo: "2024-01-15",
    });
  });

  it("cursor passed → cursor param", () => {
    expect(buildDocListParams({}, "cursor-value")).toEqual({
      cursor: "cursor-value",
    });
  });

  it("all filters + cursor combined", () => {
    expect(
      buildDocListParams(
        { status: "posted", warehouse: "wh-id", dateRange: "2024-01-15" },
        "cursor-value",
      ),
    ).toEqual({
      status: "posted",
      warehouseId: "wh-id",
      dateFrom: "2024-01-15",
      dateTo: "2024-01-15",
      cursor: "cursor-value",
    });
  });
});
