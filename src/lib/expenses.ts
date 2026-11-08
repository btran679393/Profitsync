// Suggested categories for business expenses that aren't tied to one order.
// Sellers can also type their own.
export const EXPENSE_CATEGORIES = [
  "Packing supplies",
  "Shipping supplies",
  "eBay Store subscription",
  "Software & tools",
  "Sourcing & travel",
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
