import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES, cleanMiles, cleanRate, mileageAmount, mileageNote, parseMileageNote, rateText } from "@/lib/expenses";
import { readPreferences } from "@/lib/preferences";

describe("mileage expenses", () => {
  it("is one of the suggested categories", () => {
    expect(EXPENSE_CATEGORIES).toContain("Mileage");
  });

  it("accepts sensible miles and rates only", () => {
    expect(cleanMiles("42")).toBe(42);
    expect(cleanMiles("12.5")).toBe(12.5);
    expect(cleanMiles("0")).toBeNull();
    expect(cleanMiles("1.25")).toBeNull();
    expect(cleanMiles("abc")).toBeNull();
    expect(cleanRate("0.70")).toBe(0.7);
    expect(cleanRate("$0.725")).toBe(0.725);
    expect(cleanRate(".67")).toBe(0.67);
    expect(cleanRate("0")).toBeNull();
    expect(cleanRate("5")).toBeNull();
  });

  it("works out the amount to the cent", () => {
    expect(mileageAmount(42, 0.7)).toBe("29.40");
    expect(mileageAmount(13.3, 0.725)).toBe("9.64");
  });

  it("writes the trip into the note and reads it back", () => {
    const note = mileageNote(42, 0.7, "Goodwill run");
    expect(note).toBe("42 mi × $0.70 · Goodwill run");
    expect(parseMileageNote(note)).toEqual({ miles: 42, rate: 0.7, note: "Goodwill run" });
    expect(parseMileageNote(mileageNote(12.5, 0.725, ""))).toEqual({ miles: 12.5, rate: 0.725, note: "" });
    expect(parseMileageNote("100 poly mailers")).toBeNull();
    expect(rateText(0.725)).toBe("0.725");
    expect(rateText(0.7)).toBe("0.70");
  });

  it("remembers the seller's rate, within limits", () => {
    expect(readPreferences({}).mileageRate).toBe(0.7);
    expect(readPreferences({ preferences: { mileageRate: 0.725 } }).mileageRate).toBe(0.725);
    expect(readPreferences({ preferences: { mileageRate: 9 } }).mileageRate).toBe(0.7);
  });
});
