// "This number looks wrong" reports: what a seller can flag on an order.
// Shared by the order panel and the server, so keep it free of server code.

export const REPORT_FIELDS = [
  { id: "sale_price", label: "Sale price" },
  { id: "ebay_fees", label: "eBay fees" },
  { id: "shipping", label: "Shipping" },
  { id: "refund", label: "Refund" },
  { id: "profit", label: "Profit" },
  { id: "other", label: "Something else" },
] as const;

export type ReportField = (typeof REPORT_FIELDS)[number]["id"];

export const REPORT_MESSAGE_MAX = 1000;

export function isReportField(value: unknown): value is ReportField {
  return REPORT_FIELDS.some((field) => field.id === value);
}

// Trims the seller's note and drops control characters (new lines stay).
export function cleanReportMessage(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
  return text.length > REPORT_MESSAGE_MAX ? null : text;
}
