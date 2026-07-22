import { expect, test } from "vitest";
import {
  type EntityDocumentSources,
  partnerDocRows,
  warehouseDocRows,
} from "./entity-documents";

const WH: Record<string, string> = { w1: "GD-01", w2: "GD-02" };
const PARTNER: Record<string, string> = { p1: "PT Maju Jaya", p2: "CV Sinar" };
const warehouseCode = (id: string) => WH[id] ?? id;
const partnerName = (id: string) => PARTNER[id] ?? id;

const label = {
  purchaseOrder: "Pesanan Pembelian",
  goodsReceipt: "Penerimaan Barang",
  salesOrder: "Pesanan Penjualan",
  delivery: "Pengiriman",
};

const sources: EntityDocumentSources = {
  purchaseOrders: [
    {
      id: "po1",
      docNumber: "PO-2026-0008",
      docDate: "2026-07-15",
      status: "posted",
      supplierId: "p1",
      warehouseId: "w1",
      lines: [],
      notes: "",
    },
  ],
  goodsReceipts: [
    {
      id: "gr1",
      docNumber: "GR-2026-0015",
      docDate: "2026-07-21",
      status: "posted",
      supplierId: "p1",
      warehouseId: "w1",
      lines: [],
      notes: "",
    },
    {
      id: "gr2",
      docNumber: null,
      docDate: "2026-07-22",
      status: "draft",
      supplierId: "p2",
      warehouseId: "w2",
      lines: [],
      notes: "",
    },
  ],
  salesOrders: [
    {
      id: "so1",
      docNumber: "SO-2026-0003",
      docDate: "2026-07-20",
      status: "posted",
      customerId: "p1",
      warehouseId: "w2",
      lines: [],
      notes: "",
    },
  ],
  deliveries: [
    {
      id: "do1",
      docNumber: "DO-2026-0031",
      docDate: "2026-07-19",
      status: "reversed",
      customerId: "p2",
      warehouseId: "w1",
      lines: [],
      notes: "",
    },
  ],
};

test("partnerDocRows joins PO/GR by supplierId and SO/DO by customerId", () => {
  const rows = partnerDocRows("p1", sources, { warehouseCode, label });
  // p1 is supplier on po1+gr1 and customer on so1 -> three docs.
  expect(rows.map((r) => r.id).sort()).toEqual(["gr1", "po1", "so1"]);
});

test("partnerDocRows carries docType label as counterparty and warehouse code", () => {
  const rows = partnerDocRows("p2", sources, { warehouseCode, label });
  // p2 is supplier on gr2 (draft) and customer on do1 (reversed).
  const gr2 = rows.find((r) => r.id === "gr2");
  expect(gr2?.counterparty).toBe("Penerimaan Barang");
  expect(gr2?.warehouse).toBe("GD-02");
  expect(gr2?.number).toBeNull();
  expect(gr2?.status).toBe("draft");
});

test("warehouseDocRows filters every doc type by warehouseId", () => {
  const rows = warehouseDocRows("w1", sources, { partnerName, label });
  // w1 appears on po1, gr1, do1.
  expect(rows.map((r) => r.id).sort()).toEqual(["do1", "gr1", "po1"]);
});

test("warehouseDocRows resolves counterparty to the partner name", () => {
  const rows = warehouseDocRows("w1", sources, { partnerName, label });
  expect(rows.find((r) => r.id === "gr1")?.counterparty).toBe("PT Maju Jaya");
  expect(rows.find((r) => r.id === "do1")?.counterparty).toBe("CV Sinar");
});

test("rows carry no total (documents have no total field)", () => {
  const rows = partnerDocRows("p1", sources, { warehouseCode, label });
  expect(rows.every((r) => r.total === null)).toBe(true);
});
