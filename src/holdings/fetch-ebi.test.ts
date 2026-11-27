import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  fetchEbiHoldings,
  fetchEbiHoldingsFromFmp,
  fetchEbiHoldingsWithFallback,
  parseEbiHoldingsHtml,
  MIN_EXPECTED_HOLDINGS,
  type FetchLike,
} from "./fetch-ebi";

const fixture = fs.readFileSync(
  path.join(import.meta.dir, "__fixtures__", "ebi-fund-data.html"),
  "utf8"
);

describe("parseEbiHoldingsHtml", () => {
  test("parses the fund-data holdings table", () => {
    const { asOfDate, holdings } = parseEbiHoldingsHtml(fixture);

    expect(asOfDate).toBe("2026-11-27");
    expect(Object.keys(holdings).sort()).toEqual(
      ["2612618D", "A", "AAPL", "AMZN", "MSFT", "NVDA", "T"].sort()
    );

    expect(holdings.AAPL).toMatchObject({
      name: "Apple Inc",
      market_value: 33259530.88,
      weight: 0.0509,
    });
    expect(holdings.AAPL.price).toBeGreaterThan(0);
    expect(holdings.AAPL.shares).toBeGreaterThan(0);
    // HTML entities are decoded.
    expect(holdings.T.name).toBe("AT&T Inc");
  });

  test("actual_weight is market-value based and sums to 1 (duplicates not double counted)", () => {
    const { holdings } = parseEbiHoldingsHtml(fixture);
    const sum = Object.values(holdings).reduce((s, h) => s + h.actual_weight, 0);
    expect(sum).toBeCloseTo(1, 10);
    // Rounded 0.00% positions still get a non-zero actual weight.
    expect(holdings.A.actual_weight).toBeGreaterThan(0);
  });
});

describe("fetchEbiHoldings", () => {
  test("rejects a page with too few holdings (layout change guard)", async () => {
    const fetchImpl: FetchLike = async () => new Response(fixture);
    await expect(fetchEbiHoldings({ fetchImpl })).rejects.toThrow(
      /Got only 7 EBI holdings/
    );
  });

  test("rejects non-2xx responses", async () => {
    const fetchImpl: FetchLike = async () =>
      new Response("nope", { status: 503 });
    await expect(fetchEbiHoldings({ fetchImpl })).rejects.toThrow(/HTTP 503/);
  });

  // Hits the real site. Run with RUN_LIVE_TESTS=1 bun test.
  test.skipIf(!process.env.RUN_LIVE_TESTS)(
    "live: fetches the current EBI holdings",
    async () => {
      const data = await fetchEbiHoldings();
      const count = Object.keys(data.holdings).length;
      expect(count).toBeGreaterThanOrEqual(MIN_EXPECTED_HOLDINGS);
      expect(data.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const weightSum = Object.values(data.holdings).reduce(
        (s, h) => s + h.weight,
        0
      );
      expect(weightSum).toBeGreaterThan(0.95);
      expect(weightSum).toBeLessThan(1.05);
    },
    30_000
  );
});

/** FMP etf-holder payload shaped like the real response. */
function fmpRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    asset: `T${i}`,
    name: `Company ${i}`,
    cusip: "000000000",
    sharesNumber: 10,
    weightPercentage: 100 / n,
    marketValue: 1000,
    updated: i === 0 ? "2026-11-25 20:00:00" : "2026-11-26 20:24:10",
  }));
}

const fmpOk = (n: number) => async () =>
  new Response(JSON.stringify(fmpRows(n)), {
    headers: { "content-type": "application/json" },
  });

describe("fetchEbiHoldingsFromFmp", () => {
  test("normalizes FMP rows (sharesNumber, derived price, latest as-of date)", async () => {
    const data = await fetchEbiHoldingsFromFmp({
      apiKey: "test",
      fetchImpl: fmpOk(MIN_EXPECTED_HOLDINGS),
    });
    expect(data.source).toBe("fmp");
    expect(data.asOfDate).toBe("2026-11-26");
    expect(Object.keys(data.holdings)).toHaveLength(MIN_EXPECTED_HOLDINGS);
    expect(data.holdings.T1).toMatchObject({ shares: 10, price: 100, market_value: 1000 });
    expect(data.holdings.T1.actual_weight).toBeCloseTo(1 / MIN_EXPECTED_HOLDINGS, 6);
  });

  test("rejects an incomplete response", async () => {
    await expect(
      fetchEbiHoldingsFromFmp({ apiKey: "test", fetchImpl: fmpOk(3) })
    ).rejects.toThrow(/Got only 3 EBI holdings from FMP/);
  });
});

describe("fetchEbiHoldingsWithFallback", () => {
  test("uses FMP when it works", async () => {
    const data = await fetchEbiHoldingsWithFallback({
      fmp: { apiKey: "test", fetchImpl: fmpOk(MIN_EXPECTED_HOLDINGS) },
      longview: {
        fetchImpl: async () => {
          throw new Error("should not be called");
        },
      },
    });
    expect(data.source).toBe("fmp");
    expect(data.primaryError).toBeUndefined();
  });

  test("falls back to the Longview page and reports the FMP error", async () => {
    const bigPage = fixture.replace(
      /(<tbody><tr class="odd"><td class="column-stockticker")/,
      Array.from(
        { length: MIN_EXPECTED_HOLDINGS },
        (_, i) =>
          `<tr><td class="column-stockticker">X${i}</td><td class="column-securityname">X ${i}</td><td class="column-shares">1</td><td class="column-price">1</td><td class="column-marketvalue">1</td><td class="column-weightings">0.01%</td></tr>`
      ).join("") + "$1"
    );
    const data = await fetchEbiHoldingsWithFallback({
      fmp: {
        apiKey: "test",
        fetchImpl: async () => new Response("Restricted Endpoint", { status: 403 }),
      },
      longview: { fetchImpl: async () => new Response(bigPage) },
    });
    expect(data.source).toBe("longview-html");
    expect(data.asOfDate).toBe("2026-11-27");
    expect(String(data.primaryError)).toContain("403");
  });

  // Hits FMP for real. Run with RUN_LIVE_TESTS=1 bun test (needs FMP_API_KEY).
  test.skipIf(!process.env.RUN_LIVE_TESTS || !process.env.FMP_API_KEY)(
    "live: FMP returns the current EBI holdings",
    async () => {
      const data = await fetchEbiHoldingsFromFmp();
      expect(Object.keys(data.holdings).length).toBeGreaterThanOrEqual(MIN_EXPECTED_HOLDINGS);
      expect(data.asOfDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(data.holdings.AAPL?.shares).toBeGreaterThan(0);
    },
    30_000
  );
});
