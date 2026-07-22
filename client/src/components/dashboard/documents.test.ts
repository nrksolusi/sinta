import { expect, test } from "vitest";
import { overwriteGetLocale } from "@/paraglide/runtime";
import {
  draftDocs,
  type RawDocLists,
  recentDocs,
  toDashboardDocs,
} from "./documents";

overwriteGetLocale(() => "en");

const partners = [
  { id: "p1", name: "PT Maju Jaya", isCustomer: true, isSupplier: true },
  { id: "p2", name: "CV Sinar Baru", isCustomer: true, isSupplier: true },
];
const warehouses = [
  { id: "w1", name: "Gudang Utama", code: "GD-01" },
  { id: "w2", name: "Gudang Cabang", code: "GD-02" },
];

function lists(overrides: RawDocLists): RawDocLists {
  return overrides;
}

test("resolves supplier and warehouse names and builds the detail route", () => {
  const docs = toDashboardDocs(
    lists({
      goodsReceipt: [
        {
          id: "gr1",
          docNumber: "GR-2026-0015",
          docDate: "2026-07-21",
          status: "posted",
          lines: [{}, {}],
          supplierId: "p1",
          warehouseId: "w1",
        },
      ],
    }),
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    partners as any,
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    warehouses as any,
  );

  expect(docs).toHaveLength(1);
  expect(docs[0]).toMatchObject({
    id: "gr1",
    to: "/purchases/receipts/gr1",
    number: "GR-2026-0015",
    counterparty: "PT Maju Jaya",
    lineCount: 2,
    status: "posted",
  });
});

test("describes a transfer by its from/to warehouses", () => {
  const docs = toDashboardDocs(
    lists({
      stockTransfer: [
        {
          id: "t1",
          docNumber: null,
          docDate: "2026-07-20",
          status: "draft",
          lines: [{}],
          fromWarehouseId: "w1",
          toWarehouseId: "w2",
        },
      ],
    }),
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    partners as any,
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    warehouses as any,
  );

  expect(docs[0].to).toBe("/stock/transfers/t1");
  expect(docs[0].number).toBeNull();
  expect(docs[0].counterparty).toContain("Gudang Utama");
  expect(docs[0].counterparty).toContain("Gudang Cabang");
});

test("draftDocs keeps only drafts, newest first", () => {
  const docs = toDashboardDocs(
    lists({
      goodsReceipt: [
        {
          id: "old",
          docDate: "2026-07-10",
          status: "draft",
          lines: [],
          supplierId: "p1",
          warehouseId: "w1",
        },
        {
          id: "new",
          docDate: "2026-07-19",
          status: "draft",
          lines: [],
          supplierId: "p1",
          warehouseId: "w1",
        },
        {
          id: "posted",
          docDate: "2026-07-22",
          status: "posted",
          lines: [],
          supplierId: "p1",
          warehouseId: "w1",
        },
      ],
    }),
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    partners as any,
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    warehouses as any,
  );

  const drafts = draftDocs(docs);
  expect(drafts.map((d) => d.id)).toEqual(["new", "old"]);
});

test("recentDocs unions all kinds, newest first, capped at the limit", () => {
  const docs = toDashboardDocs(
    lists({
      goodsReceipt: [
        {
          id: "gr",
          docDate: "2026-07-21",
          status: "posted",
          lines: [],
          supplierId: "p1",
          warehouseId: "w1",
        },
      ],
      delivery: [
        {
          id: "dl",
          docDate: "2026-07-22",
          status: "posted",
          lines: [],
          customerId: "p2",
          warehouseId: "w1",
        },
      ],
      stockAdjustment: [
        {
          id: "adj",
          docDate: "2026-07-20",
          status: "draft",
          lines: [],
          warehouseId: "w2",
        },
      ],
    }),
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    partners as any,
    // biome-ignore lint/suspicious/noExplicitAny: trimmed test fixtures
    warehouses as any,
  );

  const recent = recentDocs(docs, 2);
  expect(recent.map((d) => d.id)).toEqual(["dl", "gr"]);
});

test("falls back to placeholders when a lookup is missing", () => {
  const docs = toDashboardDocs(
    lists({
      goodsReceipt: [
        {
          id: "gr",
          docDate: "2026-07-21",
          status: "draft",
          lines: [],
          supplierId: "missing",
          warehouseId: "w1",
        },
      ],
    }),
    [],
    [],
  );

  expect(docs[0].counterparty).toBeTruthy();
});
