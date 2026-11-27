import { describe, expect, test } from "bun:test";
import {
  computeStats,
  cumulativeReturns,
  periodReturns,
  rangeStart,
  spreadRows,
  type PricePoint,
  type Sym,
} from "./performance";

const prices: Partial<Record<Sym, PricePoint[]>> = {
  ebi: [
    { date: "2025-12-31", close: 100 },
    { date: "2026-01-02", close: 110 },
    { date: "2026-01-05", close: 99 },
    { date: "2026-01-06", close: 121 },
  ],
  iwv: [
    { date: "2025-12-31", close: 50 },
    { date: "2026-01-02", close: 51 },
    { date: "2026-01-05", close: 52 },
    { date: "2026-01-06", close: 55 },
  ],
};

describe("performance helpers", () => {
  test("rangeStart", () => {
    expect(rangeStart("ALL", "2026-11-27")).toBeNull();
    expect(rangeStart("YTD", "2026-11-27")).toBe("2026-01-01");
    expect(rangeStart("3M", "2026-11-27")).toBe("2026-08-27");
  });

  test("cumulativeReturns rebases to the range start", () => {
    const all = cumulativeReturns(prices);
    expect(all[0]).toEqual({ date: "2025-12-31", ebi: 0, iwv: 0 });
    expect(all[3].ebi).toBeCloseTo(21);
    expect(all[3].iwv).toBeCloseTo(10);

    const ytd = cumulativeReturns(prices, "YTD");
    expect(ytd[0].date).toBe("2026-01-02");
    expect(ytd[ytd.length - 1].ebi).toBeCloseTo(10);
  });

  test("computeStats: spread, drawdown, P/E", () => {
    const stats = computeStats(cumulativeReturns(prices), { ebi: { peRatio: 14.5, date: "x" }, iwv: null });
    const ebi = stats.find((s) => s.symbol === "ebi")!;
    const iwv = stats.find((s) => s.symbol === "iwv")!;
    expect(ebi.ebiSpread).toBe(0);
    expect(iwv.ebiSpread).toBeCloseTo(11);
    expect(ebi.maxDrawdown).toBeCloseTo(-10);
    expect(iwv.maxDrawdown).toBe(0);
    expect(ebi.pe).toBe(14.5);
    expect(iwv.pe).toBeNull();
    expect(ebi.volatility).toBeGreaterThan(iwv.volatility);
  });

  test("spreadRows and periodReturns", () => {
    const spreads = spreadRows(cumulativeReturns(prices));
    expect(spreads[3].iwv).toBeCloseTo(11);
    const periods = periodReturns(prices);
    expect(periods.ALL.ebi).toBeCloseTo(21);
    expect(periods.YTD.iwv).toBeCloseTo((55 / 51 - 1) * 100);
  });
});
