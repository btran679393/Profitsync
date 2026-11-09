import { describe, expect, it } from "vitest";
import { cleanCategory, MAX_CATEGORY_LENGTH, repeatDates } from "@/lib/expenses";

describe("repeatDates", () => {
  it("repeats monthly up to today", () => {
    expect(repeatDates("2026-08-15", null, "2026-11-09")).toEqual(["2026-08-15", "2026-09-15", "2026-10-15"]);
  });
  it("includes today when it's the repeat day", () => {
    expect(repeatDates("2026-10-09", null, "2026-11-09")).toEqual(["2026-10-09", "2026-11-09"]);
  });
  it("stops on the day it was ended", () => {
    expect(repeatDates("2026-01-10", "2026-03-10", "2026-11-09")).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"]);
  });
  it("the 31st lands on the last day of short months", () => {
    expect(repeatDates("2026-01-31", null, "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("crosses into the next year", () => {
    expect(repeatDates("2025-11-01", null, "2026-02-01")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  });
  it("a start date in the future gives nothing yet", () => {
    expect(repeatDates("2026-12-01", null, "2026-11-09")).toEqual([]);
  });
});

describe("cleanCategory", () => {
  it("tidies spaces and control characters", () => {
    expect(cleanCategory("  Mileage \n  costs ")).toBe("Mileage costs");
    expect(cleanCategory("Tape\u0007")).toBe("Tape");
  });
  it("rejects blanks, non-text and very long names", () => {
    expect(cleanCategory("   ")).toBeNull();
    expect(cleanCategory(42)).toBeNull();
    expect(cleanCategory("x".repeat(MAX_CATEGORY_LENGTH + 1))).toBeNull();
    expect(cleanCategory("x".repeat(MAX_CATEGORY_LENGTH))).toHaveLength(MAX_CATEGORY_LENGTH);
  });
});
