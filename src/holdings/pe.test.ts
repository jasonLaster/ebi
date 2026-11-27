import { describe, expect, test } from "bun:test";
import { weightedHarmonicPe } from "./pe";
import { updatePeRatios } from "./update-pe";
import { fetchPeRatiosFromFmp, QUOTE_BATCH_SIZE } from "@/src/lib/fmp-api";
import {
  getLatestHoldingsData,
  getLatestPeRatios,
  storeHoldingsData,
} from "@/src/lib/db";
import { openTestDb } from "@/src/lib/test-db";
import type { Holding } from "@/src/lib/types";

describe("weightedHarmonicPe", () => {
  test("is portfolio price / portfolio earnings", () => {
    // Equal weights at P/E 10 and 100: earnings yield (0.1 + 0.01) / 2.
    const r = weightedHarmonicPe([
      { weight: 0.5, pe: 10 },
      { weight: 0.5, pe: 100 },
    ]);
    expect(r.weightedPe).toBeCloseTo(1 / 0.055, 6);
    expect(r.coverage).toBe(1);
  });

  test("ignores missing / non-positive P/E and reports coverage", () => {
    const r = weightedHarmonicPe([
      { weight: 0.6, pe: 20 },
      { weight: 0.3, pe: null },
      { weight: 0.1, pe: -5 },
    ]);
    expect(r.weightedPe).toBeCloseTo(20, 6);
    expect(r.coverage).toBeCloseTo(0.6, 6);
  });

  test("returns null when nothing has earnings", () => {
    expect(weightedHarmonicPe([{ weight: 1, pe: null }])).toEqual({
      weightedPe: null,
      coverage: 0,
    });
  });
});

/** Fake FMP batch-quote endpoint: P/E = 10 × (index of ticker digit + 1). */
function fakeQuotes(calls: string[]) {
  return async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const symbols = decodeURIComponent(url.split("/quote/")[1].split("?")[0]).split(",");
    const body = symbols
      .filter((s) => s !== "MISSING")
      .map((symbol) => ({
        symbol,
        pe: symbol === "LOSS" ? null : 10 * (Number(symbol.replace(/\D/g, "") || 0) + 1),
      }));
    return new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
    });
  };
}

describe("fetchPeRatiosFromFmp", () => {
  test("batches tickers, dedupes, and maps missing quotes to null", async () => {
    const calls: string[] = [];
    const tickers = Array.from({ length: QUOTE_BATCH_SIZE + 10 }, (_, i) => `T${i}`);
    const pe = await fetchPeRatiosFromFmp([...tickers, "t0", "MISSING"], {
      apiKey: "test",
      fetchImpl: fakeQuotes(calls),
    });
    expect(calls).toHaveLength(2);
    expect(pe.size).toBe(tickers.length + 1);
    expect(pe.get("T0")).toBe(10);
    expect(pe.get("MISSING")).toBeNull();
  });
});

describe("updatePeRatios", () => {
  const h = (actual_weight: number): Holding => ({
    name: "x",
    weight: actual_weight,
    actual_weight,
    market_value: actual_weight,
    price: 1,
    shares: 1,
  });

  test("stores per-holding and weighted P/E on each ETF's latest snapshot", async () => {
    const db = await openTestDb();
    try {
      await storeHoldingsData(db, {
        etfSymbol: "EBI",
        date: "2026-11-26",
        lastUpdated: "2026-11-26T00:00:00Z",
        holdings: { T0: h(0.5), T9: h(0.4), LOSS: h(0.1) }, // P/E 10, 100, none
      });
      await storeHoldingsData(db, {
        etfSymbol: "VTI",
        date: "2026-11-26",
        lastUpdated: "2026-11-26T00:00:00Z",
        holdings: { T0: h(1) },
      });

      const calls: string[] = [];
      const results = await updatePeRatios(db, ["EBI", "VTI", "IWV"], {
        apiKey: "test",
        fetchImpl: fakeQuotes(calls),
      });

      expect(calls).toHaveLength(1); // union of tickers, one batch
      const ebi = results.find((r) => r.symbol === "EBI")!;
      expect(ebi.weightedPe).toBeCloseTo(0.9 / (0.5 / 10 + 0.4 / 100), 6);
      expect(ebi.coverage).toBeCloseTo(0.9, 6);
      expect(results.map((r) => r.symbol)).toEqual(["EBI", "VTI"]); // IWV not synced

      const stored = await getLatestPeRatios(db, ["EBI", "IWV"]);
      expect(stored.ebi?.peRatio).toBeCloseTo(ebi.weightedPe!, 6);
      expect(stored.ebi?.date).toBe("2026-11-26");
      expect(stored.iwv).toBeNull();

      const download = await getLatestHoldingsData(db, "ebi");
      expect(download?.weightedPeRatio).toBeCloseTo(ebi.weightedPe!, 6);
      expect(download?.holdings.T9.pe_ratio).toBe(100);
      expect(download?.holdings.LOSS.pe_ratio).toBeNull();
      // Sorted by weight, largest first.
      expect(Object.keys(download!.holdings)[0]).toBe("T0");
    } finally {
      db.close();
    }
  });
});
