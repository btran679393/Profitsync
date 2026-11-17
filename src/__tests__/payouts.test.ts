import { describe, expect, it } from "vitest";
import { addFunds, breakdown, dollars, parseFunds, parsePayoutLines, parsePayouts, statusText } from "@/lib/ebay/payouts";
import { demoPayouts } from "@/lib/demo/payouts";
import { demoOrders } from "@/lib/demo/data";

describe("payouts: reading eBay's records", () => {
  it("reads dollar amounts and ignores other currencies or junk", () => {
    expect(dollars({ value: "12.50", currency: "USD" })).toBe(12.5);
    expect(dollars({ value: "12.50", currency: "GBP" })).toBe(0);
    expect(dollars({ value: "abc", currency: "USD" })).toBe(0);
    expect(dollars(undefined)).toBe(0);
  });

  it("reads the money waiting at eBay and adds stores together", () => {
    const a = parseFunds({
      availableFunds: { value: "100.10", currency: "USD" },
      processingFunds: { value: "20.00", currency: "USD" },
      fundsOnHold: { value: "5.00", currency: "USD" },
      totalFunds: { value: "125.10", currency: "USD" },
    });
    expect(a).toEqual({ available: 100.1, processing: 20, onHold: 5, total: 125.1 });
    expect(addFunds(a, a)).toEqual({ available: 200.2, processing: 40, onHold: 10, total: 250.2 });
    expect(parseFunds(null)).toEqual({ available: 0, processing: 0, onHold: 0, total: 0 });
  });

  it("reads payouts, keeping only a real last-4 for the bank", () => {
    const payouts = parsePayouts(
      {
        payouts: [
          {
            payoutId: "P1",
            payoutStatus: "SUCCEEDED",
            amount: { value: "250.00", currency: "USD" },
            payoutDate: "2026-11-10T09:00:00.000Z",
            transactionCount: 7,
            payoutInstrument: { nickname: "Checking", accountLastFourDigits: "4821" },
          },
          { payoutId: "P2", payoutStatus: "INITIATED", amount: { value: "80.00", currency: "USD" }, payoutInstrument: { accountLastFourDigits: "x" } },
          { payoutStatus: "SUCCEEDED" },
        ],
      },
      "store1",
      "My Store"
    );
    expect(payouts).toHaveLength(2);
    expect(payouts[0]).toMatchObject({ id: "P1", amount: 250, bankName: "Checking", bankLast4: "4821", transactionCount: 7, storeName: "My Store" });
    expect(payouts[1]).toMatchObject({ id: "P2", status: "INITIATED", bankLast4: null, date: null });
  });

  it("splits a payout into sales, fees, refunds, labels and charges", () => {
    const lines = parsePayoutLines({
      transactions: [
        { transactionId: "t1", transactionType: "SALE", bookingEntry: "CREDIT", amount: { value: "86.75", currency: "USD" }, totalFeeAmount: { value: "13.25", currency: "USD" }, orderId: "O1", transactionDate: "2026-11-05T00:00:00Z" },
        { transactionId: "t2", transactionType: "SHIPPING_LABEL", bookingEntry: "DEBIT", amount: { value: "8.10", currency: "USD" }, transactionDate: "2026-11-05T01:00:00Z" },
        { transactionId: "t3", transactionType: "REFUND", bookingEntry: "DEBIT", amount: { value: "20.00", currency: "USD" }, orderId: "O2", transactionDate: "2026-11-06T00:00:00Z" },
        { transactionId: "t4", transactionType: "NON_SALE_CHARGE", bookingEntry: "DEBIT", amount: { value: "4.00", currency: "USD" }, transactionMemo: "Promoted listings fee", transactionDate: "2026-11-07T00:00:00Z" },
        { transactionId: "t5", transactionType: "PAYOUT", bookingEntry: "DEBIT", amount: { value: "54.65", currency: "USD" } },
        { transactionId: "t1", transactionType: "SALE", bookingEntry: "CREDIT", amount: { value: "86.75", currency: "USD" } },
      ],
    });
    // The payout line and the repeated sale are left out; newest first.
    expect(lines.map((l) => l.id)).toEqual(["t4", "t3", "t2", "t1"]);
    expect(lines[0]).toMatchObject({ kind: "fee", net: -4, memo: "Promoted listings fee" });
    const b = breakdown(lines);
    expect(b).toMatchObject({ sales: 100, fees: -13.25, refunds: -20, labels: -8.1, otherCharges: -4, net: 54.65 });
  });

  it("names payout statuses in plain words", () => {
    expect(statusText("SUCCEEDED").label).toBe("Paid");
    expect(statusText("INITIATED").label).toBe("On its way");
    expect(statusText("TERMINAL_FAILED").tone).toBe("loss");
    expect(statusText("SOMETHING_NEW").label).toBe("something new");
  });
});

describe("demo payouts", () => {
  it("adds up to the items inside each payout", () => {
    const { response, details } = demoPayouts(demoOrders(), 90);
    expect(response.payouts.length).toBeGreaterThan(5);
    for (const p of response.payouts) {
      expect(breakdown(details.get(p.id) ?? []).net).toBeCloseTo(p.amount, 2);
    }
    expect(response.funds.total).toBeCloseTo(response.funds.available + response.funds.processing, 2);
  });
});

describe("payouts spreadsheet", () => {
  it("lists each payout with numbers that add up, and blocks formula tricks", async () => {
    const { payoutsCsv } = await import("@/lib/ebay/payouts");
    const { toCsv } = await import("@/lib/taxReport");
    const csv = payoutsCsv(
      [
        { id: "P1", storeId: "s", storeName: "=Store", status: "SUCCEEDED", amount: 250, date: "2026-11-10T09:00:00Z", bankName: "Checking", bankLast4: "4821", transactionCount: 7 },
        { id: "P2", storeId: "s", storeName: null, status: "INITIATED", amount: 80.5, date: "2026-11-16T09:00:00Z", bankName: null, bankLast4: null, transactionCount: null },
      ],
      { business: "Demo", from: "2026-08-19T00:00:00Z", to: "2026-11-17T00:00:00Z", preparedOn: new Date("2026-11-17T12:00:00Z") },
      toCsv
    );
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines).toContain("Period,2026-08-19 to 2026-11-17");
    expect(lines).toContain("Date,Status,Amount,Bank account,Items,Store,eBay payout ID");
    expect(lines).toContain("2026-11-10,Paid,250.00,Checking ending 4821,7,'=Store,P1");
    expect(lines).toContain("2026-11-16,On its way,80.50,,,,P2");
    // Only paid payouts count in the total.
    expect(lines).toContain("Total paid to your bank,,250.00");
  });
});
