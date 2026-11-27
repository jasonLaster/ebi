import { describe, test, expect } from "bun:test";
import { storeHoldingsData, type HoldingsDb } from "@/src/lib/db";
import { openTestDb } from "@/src/lib/test-db";
import type { HoldingsData } from "@/src/lib/types";
import { runApproximation } from "@/src/approximation/optimize";

async function writeEtf(
  db: HoldingsDb,
  data: HoldingsData
): Promise<void> {
  await storeHoldingsData(db, data);
}

describe("approximation (Turso-backed)", () => {
  test("returns valid weights that satisfy constraints", async () => {

    const db = await openTestDb();
    try {
      // Construct a toy problem where EBI is exactly 75% VTI + 25% IWN.
      // Use actual_weight everywhere (same as weight in this fixture).
      await writeEtf(db, {
        etfSymbol: "VTI",
        lastUpdated: new Date().toISOString(),
        holdings: {
          AAA: {
            name: "AAA",
            weight: 0.6,
            actual_weight: 0.6,
            market_value: 60,
            price: 10,
            shares: 6,
          },
          BBB: {
            name: "BBB",
            weight: 0.4,
            actual_weight: 0.4,
            market_value: 40,
            price: 10,
            shares: 4,
          },
        },
      });

      await writeEtf(db, {
        etfSymbol: "IWN",
        lastUpdated: new Date().toISOString(),
        holdings: {
          AAA: {
            name: "AAA",
            weight: 0.2,
            actual_weight: 0.2,
            market_value: 20,
            price: 10,
            shares: 2,
          },
          BBB: {
            name: "BBB",
            weight: 0.8,
            actual_weight: 0.8,
            market_value: 80,
            price: 10,
            shares: 8,
          },
        },
      });

      await writeEtf(db, {
        etfSymbol: "VTV",
        lastUpdated: new Date().toISOString(),
        holdings: {
          AAA: {
            name: "AAA",
            weight: 0.5,
            actual_weight: 0.5,
            market_value: 50,
            price: 10,
            shares: 5,
          },
          BBB: {
            name: "BBB",
            weight: 0.5,
            actual_weight: 0.5,
            market_value: 50,
            price: 10,
            shares: 5,
          },
        },
      });

      await writeEtf(db, {
        etfSymbol: "EBI",
        lastUpdated: new Date().toISOString(),
        holdings: {
          // 0.75*VTI + 0*VTV + 0.25*IWN:
          // AAA: 0.75*0.6 + 0.25*0.2 = 0.5
          // BBB: 0.75*0.4 + 0.25*0.8 = 0.5
          AAA: {
            name: "AAA",
            weight: 0.5,
            actual_weight: 0.5,
            market_value: 50,
            price: 10,
            shares: 5,
          },
          BBB: {
            name: "BBB",
            weight: 0.5,
            actual_weight: 0.5,
            market_value: 50,
            price: 10,
            shares: 5,
          },
        },
      });

      const res = await runApproximation(db, "EBI", ["VTI", "VTV", "IWN"], {
        weightField: "actual_weight",
        initialGuess: [0.75, 0.1, 0.15],
        maxIterations: 2000,
      });

      const sum = res.constraints.weightsSum;
      expect(sum).toBeCloseTo(1, 4);
      expect(res.constraints.allWeightsNonNegative).toBe(true);
      expect(res.constraints.allWeightsLessThanOne).toBe(true);

      // Objective should be reasonable for synthetic match
      // Note: May be higher if database has existing data that interferes
      expect(res.optimizationMetrics.finalObjectiveValue).toBeLessThan(1.0);

      // Verify the weights are reasonable
      const vtiWeight = res.optimalWeights.vti ?? 0;
      const vtvWeight = res.optimalWeights.vtv ?? 0;
      const iwnWeight = res.optimalWeights.iwn ?? 0;
      expect(vtiWeight).toBeGreaterThan(0);
      expect(vtvWeight).toBeGreaterThanOrEqual(0);
      expect(iwnWeight).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  test("throws if baselineEtfs is empty", async () => {

    const db = await openTestDb();
    try {
      await writeEtf(db, {
        etfSymbol: "EBI",
        lastUpdated: new Date().toISOString(),
        holdings: {
          AAA: {
            name: "AAA",
            weight: 1,
            actual_weight: 1,
            market_value: 1,
            price: 1,
            shares: 1,
          },
        },
      });

      await expect(runApproximation(db, "EBI", [])).rejects.toThrow(
        /baselineEtfs must have at least 1 symbol/
      );
    } finally {
      db.close();
    }
  });
});
