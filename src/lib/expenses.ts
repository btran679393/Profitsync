// Suggested categories for business expenses that aren't tied to one order.
// Sellers can also type their own.
export const EXPENSE_CATEGORIES = [
  "Packing supplies",
  "Shipping supplies",
  "eBay Store subscription",
  "Software & tools",
  "Sourcing & travel",
  "Mileage",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const MAX_CATEGORY_LENGTH = 40;

// A tidy category name, or null if it isn't usable.
export function cleanCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!text || text.length > MAX_CATEGORY_LENGTH) return null;
  return text;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Each month a repeating expense counts in, from its first date up to today
// (or the day it was stopped). Days past the end of a short month land on
// that month's last day (e.g. the 31st becomes Feb 28).
export function repeatDates(firstDate: string, endedOn: string | null, today: string): string[] {
  const [y, m, d] = firstDate.split("-").map(Number);
  const last = endedOn && endedOn < today ? endedOn : today;
  const dates: string[] = [];
  for (let i = 0; i < 600; i++) {
    const year = y + Math.floor((m - 1 + i) / 12);
    const month = ((m - 1 + i) % 12) + 1;
    const day = Math.min(d, new Date(year, month, 0).getDate());
    const date = `${year}-${pad(month)}-${pad(day)}`;
    if (date > last) break;
    dates.push(date);
  }
  return dates;
}

// ------------------------------------------------------------
// Mileage: miles driven for the business (sourcing trips, post office
// runs) times a rate per mile. Saved as an ordinary expense whose note
// starts with the miles and rate, e.g. "42 mi × $0.70 · Goodwill run".
// ------------------------------------------------------------

export const MILEAGE_CATEGORY = "Mileage";
// The IRS standard rate for 2025 was 70 cents a mile. Sellers can change it.
export const DEFAULT_MILEAGE_RATE_CENTS = 70;
const MILEAGE_NOTE = /^(\d{1,5}(?:\.\d)?) mi × \$(\d\.\d{2,3})(?: · (.*))?$/;

// Miles as typed: up to 5 digits and one decimal place, more than 0.
export function cleanMiles(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,5}(\.\d)?$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

// Rate per mile in dollars as typed, e.g. "0.70" or "$0.725" (1¢ to $2).
export function cleanRate(value: string): number | null {
  const text = value.trim().replace(/^\$/, "");
  if (!/^\d?(\.\d{1,3})?$/.test(text) || text === "" || text === ".") return null;
  const n = Number(text);
  return n >= 0.01 && n <= 2 ? n : null;
}

export function mileageAmount(miles: number, rate: number): string {
  return (Math.round(miles * rate * 100) / 100).toFixed(2);
}

// "0.70", or "0.725" when the rate has a tenth of a cent.
export function rateText(rate: number): string {
  return Math.round(rate * 1000) % 10 === 0 ? rate.toFixed(2) : rate.toFixed(3);
}

export function mileageNote(miles: number, rate: number, note: string): string {
  const head = `${miles} mi × $${rateText(rate)}`;
  const rest = note.trim();
  return (rest ? `${head} · ${rest}` : head).slice(0, 200);
}

export function parseMileageNote(note: string | null | undefined): { miles: number; rate: number; note: string } | null {
  const match = MILEAGE_NOTE.exec((note ?? "").trim());
  if (!match) return null;
  return { miles: Number(match[1]), rate: Number(match[2]), note: match[3] ?? "" };
}
