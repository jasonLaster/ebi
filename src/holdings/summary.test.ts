import { describe, expect, test } from "bun:test";
import { summarizeHoldings } from "./summary";

describe("summarizeHoldings", () => {
  test("returns count and the largest positions by weight", () => {
    const s = summarizeHoldings(
      {
        etfSymbol: "VTI",
        date: "2026-11-26",
        weightedPeRatio: 20.9,
        holdings: {
          MSFT: { name: "Microsoft", actual_weight: 0.05 },
          AAPL: { name: "Apple", actual_weight: 0.07 },
          XYZ: { name: "Tiny", actual_weight: 0.001 },
        },
      },
      2
    );
    expect(s.count).toBe(3);
    expect(s.top.map((h) => h.ticker)).toEqual(["AAPL", "MSFT"]);
    expect(s.topWeight).toBeCloseTo(0.12);
    expect(s.weightedPeRatio).toBe(20.9);
  });
});
