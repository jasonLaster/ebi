#!/usr/bin/env bun
/**
 * QA Diagnostic script to check weight sum issues
 */

import "dotenv/config";
import { openHoldingsDb } from "@/src/lib/db";
import { getHoldingsWeightMap } from "@/src/lib/db";

async function main() {
  const db = await openHoldingsDb();
  try {
    const etfs = ["EBI", "VTI", "VTV", "IWN"];

    console.log("=== Weight Sum Analysis ===\n");

    for (const etf of etfs) {
      const weightMap = await getHoldingsWeightMap(db, etf, {
        weightField: "actual_weight",
      });
      
      const weights = Array.from(weightMap.values());
      const sum = weights.reduce((a, b) => a + b, 0);
      const maxWeight = Math.max(...weights);
      const minWeight = Math.min(...weights.filter(w => w > 0));
      const nonZeroCount = weights.filter(w => w > 0).length;
      const negativeCount = weights.filter(w => w < 0).length;
      
      console.log(`${etf}:`);
      console.log(`  Total weight sum: ${(sum * 100).toFixed(2)}%`);
      console.log(`  Holdings count: ${weightMap.size}`);
      console.log(`  Non-zero weights: ${nonZeroCount}`);
      console.log(`  Negative weights: ${negativeCount}`);
      console.log(`  Max weight: ${(maxWeight * 100).toFixed(4)}%`);
      console.log(`  Min (non-zero) weight: ${(minWeight * 100).toFixed(6)}%`);
      
      // Check for duplicates
      const sortedWeights = weights.sort((a, b) => b - a);
      const top10 = sortedWeights.slice(0, 10);
      console.log(`  Top 10 weights: ${top10.map(w => (w * 100).toFixed(2) + '%').join(', ')}`);
      
      // Get some sample symbols with their weights
      const sampleEntries = Array.from(weightMap.entries())
        .filter(([_, w]) => w > 0)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 5);
      console.log(`  Top 5 holdings: ${sampleEntries.map(([sym, w]) => `${sym}: ${(w * 100).toFixed(2)}%`).join(', ')}`);
      
      console.log();
    }

    // Check if we're using the wrong field
    console.log("=== Comparing weight vs actual_weight ===");
    for (const etf of ["EBI", "VTV"]) {
      const weightField = await getHoldingsWeightMap(db, etf, {
        weightField: "weight",
      });
      const actualWeightField = await getHoldingsWeightMap(db, etf, {
        weightField: "actual_weight",
      });
      
      const weightSum = Array.from(weightField.values()).reduce((a, b) => a + b, 0);
      const actualWeightSum = Array.from(actualWeightField.values()).reduce((a, b) => a + b, 0);
      
      console.log(`${etf}:`);
      console.log(`  'weight' field sum: ${(weightSum * 100).toFixed(2)}%`);
      console.log(`  'actual_weight' field sum: ${(actualWeightSum * 100).toFixed(2)}%`);
      console.log();
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
