import { describe, expect, it } from "vitest";
import { calculateRenewalDate, computeExtendedRenewalDate, parseDurationMonths, parsePrice } from "./renewal";

describe("parsePrice / parseDurationMonths", () => {
  it("extracts the numeric PEN amount", () => {
    expect(parsePrice("S/. 15.00")).toBe(15);
    expect(parsePrice(null)).toBe(0);
  });

  it("extracts months from duration labels", () => {
    expect(parseDurationMonths("12 Meses")).toBe(12);
    expect(parseDurationMonths("1 Mes")).toBe(1);
    expect(parseDurationMonths("")).toBe(1);
  });
});

describe("calculateRenewalDate", () => {
  it("adds months to a mid-month purchase", () => {
    const result = calculateRenewalDate(new Date("2026-03-10T12:00:00Z"), 2);
    expect(result.getMonth()).toBe(4);
  });
});

describe("computeExtendedRenewalDate", () => {
  it("extends from a future renewal date instead of today", () => {
    const now = new Date(2026, 8, 6, 12);
    const extended = computeExtendedRenewalDate("2026-12-15", 1, now);
    expect(extended >= "2027-01-14").toBe(true);
  });

  it("extends from today when the subscription already expired", () => {
    const now = new Date(2026, 8, 6, 12);
    const extended = computeExtendedRenewalDate("2026-01-01", 1, now);
    expect(extended.startsWith("2026-10")).toBe(true);
  });
});
