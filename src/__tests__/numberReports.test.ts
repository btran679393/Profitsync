import { describe, expect, it } from "vitest";
import { cleanReportMessage, isReportField } from "@/lib/numberReports";

describe("number reports", () => {
  it("only accepts known fields", () => {
    expect(isReportField("ebay_fees")).toBe(true);
    expect(isReportField("DROP TABLE")).toBe(false);
    expect(isReportField(undefined)).toBe(false);
  });
  it("cleans the note", () => {
    expect(cleanReportMessage(undefined)).toBe("");
    expect(cleanReportMessage("  eBay shows $6.12\u0000 ")).toBe("eBay shows $6.12");
    expect(cleanReportMessage("line one\nline two")).toBe("line one\nline two");
    expect(cleanReportMessage(42)).toBeNull();
    expect(cleanReportMessage("x".repeat(1001))).toBeNull();
  });
});
