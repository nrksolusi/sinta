// Locale split (see CLAUDE.md "Locale"):
//   - Numbers, currency, and numeric dates follow Indonesian region format
//     (id-ID / IDR), independent of the UI language.
//   - Month and day NAMES follow the active UI language, because they read as
//     words in the sentence (monthName / dayName below).
import { getLocale } from "@/paraglide/runtime";

const LOCALE = "id-ID";
const CURRENCY = "IDR";

// Money and quantities arrive from the API as numeric strings (never floats).
type Numeric = number | string;

function toNumber(value: Numeric): number {
  return typeof value === "number" ? value : Number(value);
}

// Rupiah is conventionally shown without minor units.
const currencyFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});
const numberFormat = new Intl.NumberFormat(LOCALE);
const dateFormat = new Intl.DateTimeFormat(LOCALE, { dateStyle: "medium" });

export function formatCurrency(value: Numeric): string {
  return currencyFormat.format(toNumber(value));
}

export function formatNumber(value: Numeric): string {
  return numberFormat.format(toNumber(value));
}

export function formatDate(value: string | number | Date): string {
  return dateFormat.format(new Date(value));
}

// month is 1-12 (JS Date months are 0-based). Name follows the UI language.
export function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString(getLocale(), {
    month: "long",
  });
}
