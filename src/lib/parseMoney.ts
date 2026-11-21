// A money amount typed by the seller: a non-negative number with at most two
// decimals ("12", "4.5", "4.50"). Returns the rounded amount, or null when
// it isn't valid.
export function parseMoney(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 100))) return null;
  if (Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) return null;
  return Math.round(n * 100) / 100;
}
