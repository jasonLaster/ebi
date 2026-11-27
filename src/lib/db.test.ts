import { describe, expect, test } from "bun:test";
import { getHoldingsWeightMap, storeHoldingsData, upsertEtf } from "./db";
import { openTestDb } from "./test-db";
import type { Holding } from "./types";

const h = (actual_weight: number): Holding => ({
  name: "x",
  weight: actual_weight,
  actual_weight,
  market_value: actual_weight * 100,
  price: 1,
  shares: 1,
});

describe("dated holdings snapshots", () => {
  test("reads the latest non-empty snapshot; re-syncing a day replaces it", async () => {
    const db = await openTestDb();
    try {
      await storeHoldingsData(db, {
        etfSymbol: "VTI",
        date: "2026-11-25",
        lastUpdated: "2026-11-25T00:00:00Z",
        holdings: { OLD: h(1) },
      });
      await storeHoldingsData(db, {
        etfSymbol: "VTI",
        date: "2026-11-26",
        lastUpdated: "2026-11-26T00:00:00Z",
        holdings: { AAPL: h(0.6), GONE: h(0.4) },
      });
      // Same day again: GONE was sold, MSFT bought.
      await storeHoldingsData(db, {
        etfSymbol: "VTI",
        date: "2026-11-26",
        lastUpdated: "2026-11-26T12:00:00Z",
        holdings: { AAPL: h(0.5), MSFT: h(0.5) },
      });
      // An empty, far-future row (like old test pollution) must not win.
      await upsertEtf(db, "VTI", "2099-12-31", "2099-12-31T00:00:00Z");

      const map = await getHoldingsWeightMap(db, "VTI");
      expect(Object.fromEntries(map)).toEqual({ AAPL: 0.5, MSFT: 0.5 });

      const days = await db.execute(
        "SELECT date, COUNT(*) n FROM holdings GROUP BY date ORDER BY date"
      );
      expect(days.rows.map((r) => [r.date, Number(r.n)])).toEqual([
        ["2026-11-25", 1],
        ["2026-11-26", 2],
      ]);
    } finally {
      db.close();
    }
  });

  test("defaults the snapshot date to lastUpdated's day", async () => {
    const db = await openTestDb();
    try {
      await storeHoldingsData(db, {
        etfSymbol: "EBI",
        lastUpdated: "2026-11-27T05:00:00.000Z",
        holdings: { AAPL: h(1) },
      });
      const r = await db.execute("SELECT date FROM etfs WHERE symbol = 'EBI'");
      expect(r.rows[0].date).toBe("2026-11-27");
    } finally {
      db.close();
    }
  });
});
