import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  fetchEbiHoldings,
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
      /Parsed only 7 EBI holdings/
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
