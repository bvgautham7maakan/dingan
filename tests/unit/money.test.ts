import { describe, expect, it } from "vitest";
import { formatAed, isMoneyKey, moneyFor, stripMoney } from "@/lib/money";

describe("money stripping", () => {
  const payload = {
    projects: [
      { code: "NBK", bulThresholdFils: 10_000_000, site: { name: "NBK" }, lines: [{ qty: 3, rateFils: 1250, aedTotal: 37.5 }] },
    ],
    totalFils: 99,
    when: new Date("2026-10-21T05:00:00Z"),
  };

  it("detects money keys", () => {
    expect(isMoneyKey("amountFils")).toBe(true);
    expect(isMoneyKey("aedTotal")).toBe(true);
    expect(isMoneyKey("qty")).toBe(false);
    expect(isMoneyKey("aedes")).toBe(false);
  });

  it("removes every money field at any depth and keeps the rest", () => {
    const out = stripMoney(payload);
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/Fils|aedTotal/);
    expect(out.projects[0].lines[0].qty).toBe(3);
    expect(out.when).toBeInstanceOf(Date);
  });

  it.each(["SUP", "HEAD_SUP", "HVAC_SUP", "DRIVER", "DESIGN"])("%s gets no AED fields", (role) => {
    expect(JSON.stringify(moneyFor([role], payload))).not.toMatch(/Fils|aed[A-Z]/);
  });

  it.each(["ADMIN", "PE", "BUL", "OPS", "PM", "SE", "EST", "COORD", "PROC"])("%s keeps AED fields", (role) => {
    expect(moneyFor([role], payload)).toEqual(payload);
  });

  it("formats AED from fils", () => {
    expect(formatAed(10_000_000)).toBe("AED 100,000.00");
    expect(formatAed(null)).toBe("–");
  });
});
