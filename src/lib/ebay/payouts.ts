// Payouts: the money eBay sends to the seller's bank, the money still
// waiting (processing, ready to go out, on hold), and what each payout was
// made of. Read live from eBay's Finances API; nothing is saved.
// Shared by the server route and the page, so no server-only imports.

type Money = { value?: string; currency?: string };

export type PayoutStatus = "INITIATED" | "SUCCEEDED" | "RETRYABLE_FAILED" | "TERMINAL_FAILED" | "REVERSED";

export type Payout = {
  id: string;
  storeId: string;
  storeName: string | null;
  status: PayoutStatus | string;
  amount: number;
  date: string | null;
  // Bank account the money went to, e.g. "Checking" and "1234".
  bankName: string | null;
  bankLast4: string | null;
  transactionCount: number | null;
};

export type FundsSummary = {
  // Ready to go out with the next payout.
  available: number;
  // From recent sales, not ready yet.
  processing: number;
  // Held by eBay (for example a new seller hold or a case).
  onHold: number;
  total: number;
};

export type PayoutLineKind = "sale" | "refund" | "label" | "fee" | "dispute" | "other";

export type PayoutLine = {
  id: string;
  kind: PayoutLineKind;
  // What eBay calls it, e.g. "SALE", "NON_SALE_CHARGE".
  type: string;
  date: string | null;
  orderId: string | null;
  // What this line added to (+) or took from (−) the payout.
  net: number;
  // eBay fees taken from this line (already inside `net`).
  fees: number;
  memo: string | null;
};

export type PayoutBreakdown = {
  sales: number;
  fees: number;
  refunds: number;
  labels: number;
  otherCharges: number;
  disputes: number;
  other: number;
  net: number;
};

export type PayoutsResponse = {
  funds: FundsSummary;
  payouts: Payout[];
  // Stores whose eBay sign-in has expired (their payouts are missing).
  reconnect: string[];
  from: string;
  to: string;
};

const round = (n: number) => Math.round(n * 100) / 100;

// Dollars from an eBay amount; 0 for anything missing or not USD.
export function dollars(value?: Money | null): number {
  if (!value || (value.currency && value.currency !== "USD") || typeof value.value !== "string") return 0;
  const n = Number(value.value);
  return Number.isFinite(n) ? round(n) : 0;
}

export function parseFunds(data: unknown): FundsSummary {
  const d = (data ?? {}) as Record<string, Money | undefined>;
  return {
    available: dollars(d.availableFunds),
    processing: dollars(d.processingFunds),
    onHold: dollars(d.fundsOnHold),
    total: dollars(d.totalFunds),
  };
}

export function addFunds(a: FundsSummary, b: FundsSummary): FundsSummary {
  return {
    available: round(a.available + b.available),
    processing: round(a.processing + b.processing),
    onHold: round(a.onHold + b.onHold),
    total: round(a.total + b.total),
  };
}

export const NO_FUNDS: FundsSummary = { available: 0, processing: 0, onHold: 0, total: 0 };

type RawPayout = {
  payoutId?: string;
  payoutStatus?: string;
  amount?: Money;
  payoutDate?: string;
  lastAttemptedPayoutDate?: string;
  transactionCount?: number;
  payoutInstrument?: { nickname?: string; accountLastFourDigits?: string; instrumentType?: string };
};

export function parsePayouts(data: unknown, storeId: string, storeName: string | null): Payout[] {
  const list = ((data ?? {}) as { payouts?: RawPayout[] }).payouts ?? [];
  return list
    .filter((p) => typeof p.payoutId === "string" && p.payoutId)
    .map((p) => ({
      id: p.payoutId!,
      storeId,
      storeName,
      status: p.payoutStatus ?? "INITIATED",
      amount: dollars(p.amount),
      date: p.payoutDate ?? p.lastAttemptedPayoutDate ?? null,
      bankName: p.payoutInstrument?.nickname?.trim() || null,
      bankLast4: /^\d{2,4}$/.test(p.payoutInstrument?.accountLastFourDigits ?? "") ? p.payoutInstrument!.accountLastFourDigits! : null,
      transactionCount: typeof p.transactionCount === "number" ? p.transactionCount : null,
    }));
}

type RawLine = {
  transactionId?: string;
  transactionType?: string;
  transactionDate?: string;
  bookingEntry?: string;
  amount?: Money;
  totalFeeAmount?: Money;
  orderId?: string;
  transactionMemo?: string;
  references?: Array<{ referenceId?: string; referenceType?: string }>;
};

export function lineKind(type: string): PayoutLineKind {
  switch (type) {
    case "SALE":
      return "sale";
    case "REFUND":
      return "refund";
    case "SHIPPING_LABEL":
      return "label";
    case "NON_SALE_CHARGE":
      return "fee";
    case "DISPUTE":
      return "dispute";
    default:
      return "other";
  }
}

// The money lines behind one payout. eBay reports SALE amounts after fees;
// CREDIT adds to the payout and DEBIT takes from it.
export function parsePayoutLines(data: unknown): PayoutLine[] {
  const list = ((data ?? {}) as { transactions?: RawLine[] }).transactions ?? [];
  const lines: PayoutLine[] = [];
  const seen = new Set<string>();
  for (const t of list) {
    const type = t.transactionType ?? "OTHER";
    // The payout itself shows up as a line; it isn't part of what's inside.
    if (type === "PAYOUT") continue;
    const id = t.transactionId ?? `${type}-${t.transactionDate}-${t.amount?.value}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const sign = t.bookingEntry === "DEBIT" ? -1 : 1;
    lines.push({
      id,
      kind: lineKind(type),
      type,
      date: t.transactionDate ?? null,
      orderId: t.orderId || t.references?.find((r) => r.referenceType === "ORDER_ID")?.referenceId || null,
      net: round(sign * Math.abs(dollars(t.amount))),
      fees: Math.abs(dollars(t.totalFeeAmount)),
      memo: t.transactionMemo?.trim() || null,
    });
  }
  return lines.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

// Where a payout's money came from: sales before fees, minus fees, refunds,
// labels and other eBay charges.
export function breakdown(lines: PayoutLine[]): PayoutBreakdown {
  const b: PayoutBreakdown = { sales: 0, fees: 0, refunds: 0, labels: 0, otherCharges: 0, disputes: 0, other: 0, net: 0 };
  for (const line of lines) {
    b.net += line.net;
    if (line.kind === "sale") {
      b.sales += line.net + line.fees;
      b.fees -= line.fees;
    } else if (line.kind === "refund") b.refunds += line.net;
    else if (line.kind === "label") b.labels += line.net;
    else if (line.kind === "fee") b.otherCharges += line.net;
    else if (line.kind === "dispute") b.disputes += line.net;
    else b.other += line.net;
  }
  for (const key of Object.keys(b) as Array<keyof PayoutBreakdown>) b[key] = round(b[key]);
  return b;
}

export const STATUS_TEXT: Record<string, { label: string; tone: "profit" | "accent" | "warn" | "loss" | "neutral"; help: string }> = {
  SUCCEEDED: { label: "Paid", tone: "profit", help: "eBay sent this money to your bank." },
  INITIATED: { label: "On its way", tone: "accent", help: "eBay has started this payout. Banks usually show it within 1–3 business days." },
  RETRYABLE_FAILED: { label: "Retrying", tone: "warn", help: "Your bank didn't accept it, so eBay will try again. Check your payout account in eBay." },
  TERMINAL_FAILED: { label: "Failed", tone: "loss", help: "This payout couldn't be sent. Update your bank account in eBay Seller Hub → Payments." },
  REVERSED: { label: "Reversed", tone: "loss", help: "The bank sent this payout back to eBay." },
};

export function statusText(status: string) {
  return STATUS_TEXT[status] ?? { label: status.replace(/_/g, " ").toLowerCase(), tone: "neutral" as const, help: "" };
}

export const LINE_TEXT: Record<PayoutLineKind, string> = {
  sale: "Sale",
  refund: "Refund",
  label: "Shipping label",
  fee: "eBay charge",
  dispute: "Dispute",
  other: "Other",
};

// Payout date window: the last N days, ending now.
export function payoutWindow(days: number, now: Date = new Date()) {
  const to = new Date(now);
  const from = new Date(now.getTime() - days * 86_400_000);
  return { from, to };
}

export const PAYOUT_RANGES = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
] as const;

// One line per payout, for bookkeeping. Amounts are numbers so they add up
// in a spreadsheet.
export function payoutsCsv(
  payouts: Payout[],
  { business, from, to, preparedOn = new Date() }: { business: string; from: string; to: string; preparedOn?: Date },
  toCsv: (rows: Array<Array<string | number | null | undefined>>) => string
): string {
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
  const paid = payouts.filter((p) => p.status === "SUCCEEDED").reduce((sum, p) => sum + p.amount, 0);
  return toCsv([
    ["ProfitSync - eBay payouts"],
    ["Business", business],
    ["Period", `${day(from)} to ${day(to)}`],
    ["Prepared", preparedOn.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
    ["Currency", "US dollars (USD)"],
    [],
    ["Date", "Status", "Amount", "Bank account", "Items", "Store", "eBay payout ID"],
    ...payouts.map((p) => [
      day(p.date),
      statusText(p.status).label,
      p.amount,
      [p.bankName, p.bankLast4 ? `ending ${p.bankLast4}` : null].filter(Boolean).join(" ") || "",
      p.transactionCount === null ? "" : String(p.transactionCount),
      p.storeName ?? "",
      p.id,
    ]),
    [],
    ["Total paid to your bank", "", Math.round(paid * 100) / 100],
  ]);
}
