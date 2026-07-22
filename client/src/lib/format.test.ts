import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatNumber, monthName } from "./format";

// Formatting must stay Indonesian (id-ID / IDR) regardless of UI language.
describe("format (id-ID locale)", () => {
  it("groups thousands with a dot", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
  });

  it("accepts numeric strings from the API", () => {
    expect(formatNumber("1234567")).toBe("1.234.567");
  });

  it("formats currency as whole Rupiah", () => {
    const out = formatCurrency(1234567);
    expect(out).toContain("Rp");
    expect(out).toContain("1.234.567");
  });

  it("formats dates day-month-year in Indonesian", () => {
    expect(formatDate("2026-07-22T00:00:00Z")).toBe("22 Jul 2026");
  });

  // Names follow the UI language, not the region format; the base locale is
  // Indonesian.
  it("names months in the UI language", () => {
    expect(monthName(1)).toBe("Januari");
    expect(monthName(8)).toBe("Agustus");
  });
});
