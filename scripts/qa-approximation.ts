#!/usr/bin/env bun
/**
 * QA Diagnostic script for approximation logic
 * Checks for potential issues in the approximation algorithm
 */

import "dotenv/config";
import { openHoldingsDb } from "@/src/lib/db";
import { getHoldingsWeightMap, getAllUniqueSymbols } from "@/src/lib/db";

async function main() {
  const db = await openHoldingsDb();
  try {
    const target = "EBI";
    const baselines = ["VTI", "VTV", "IWN"];

    console.log("=== QA: Approximation Symbol Universe ===\n");

    // Get target holdings
    const targetMap = await getHoldingsWeightMap(db, target, {
      weightField: "actual_weight",
    });
    console.log(`Target ETF (${target}) holdings: ${targetMap.size} symbols`);

    // Get baseline holdings
    const baselineMaps = await Promise.all(
      baselines.map((s) =>
        getHoldingsWeightMap(db, s, { weightField: "actual_weight" })
      )
    );
    console.log(
      `Baseline ETFs holdings: ${baselineMaps.map((m, i) => `${baselines[i]}: ${m.size}`).join(", ")}`
    );

    // Get union of relevant symbols (what we SHOULD use)
    const relevantSymbols = new Set<string>();
    for (const sym of targetMap.keys()) relevantSymbols.add(sym);
    for (const map of baselineMaps) {
      for (const sym of map.keys()) relevantSymbols.add(sym);
    }
    console.log(
      `\nUnion of symbols from target + baselines: ${relevantSymbols.size} symbols`
    );

    // Get ALL symbols from DB (what we CURRENTLY use)
    const allSymbols = await getAllUniqueSymbols(db);
    console.log(`ALL symbols in database: ${allSymbols.size} symbols`);

    // Check for symbols in DB that aren't in our ETFs
    const irrelevantSymbols = Array.from(allSymbols).filter(
      (s) => !relevantSymbols.has(s)
    );
    if (irrelevantSymbols.length > 0) {
      console.log(
        `\n⚠️  BUG FOUND: ${irrelevantSymbols.length} symbols in DB are NOT in target or baseline ETFs`
      );
      console.log(
        `   These will have zero weights everywhere, inflating the problem size`
      );
      console.log(
        `   Example symbols: ${irrelevantSymbols.slice(0, 10).join(", ")}`
      );
      console.log(
        `   This means the optimization is solving a ${allSymbols.size}-dimensional problem instead of ${relevantSymbols.size}-dimensional`
      );
    } else {
      console.log("\n✓ Symbol universe is correct (no irrelevant symbols)");
    }

    // Check weight sums
    console.log("\n=== Weight Sums ===");
    const targetSum = Array.from(targetMap.values()).reduce((a, b) => a + b, 0);
    console.log(
      `Target (${target}) total weight: ${(targetSum * 100).toFixed(2)}%`
    );

    for (let i = 0; i < baselines.length; i++) {
      const sum = Array.from(baselineMaps[i].values()).reduce(
        (a, b) => a + b,
        0
      );
      console.log(
        `Baseline ${baselines[i]} total weight: ${(sum * 100).toFixed(2)}%`
      );
    }

    // Check for missing symbols in target that exist in baselines
    console.log("\n=== Coverage Analysis ===");
    const missingInTarget = Array.from(relevantSymbols).filter(
      (s) => !targetMap.has(s) || (targetMap.get(s) ?? 0) === 0
    );
    const inBaselines = missingInTarget.filter((s) =>
      baselineMaps.some((m) => m.has(s) && (m.get(s) ?? 0) > 0)
    );
    console.log(
      `Symbols missing in target but present in baselines: ${inBaselines.length}`
    );
    if (inBaselines.length > 0 && inBaselines.length < 20) {
      console.log(`   Examples: ${inBaselines.slice(0, 10).join(", ")}`);
    }

    // Check data consistency
    console.log("\n=== Data Consistency ===");
    let zeroRows = 0;
    for (const sym of allSymbols) {
      const targetWeight = targetMap.get(sym) ?? 0;
      const baselineWeights = baselineMaps.map((m) => m.get(sym) ?? 0);
      if (targetWeight === 0 && baselineWeights.every((w) => w === 0)) {
        zeroRows++;
      }
    }
    console.log(
      `Rows with all zeros (target and all baselines): ${zeroRows} out of ${allSymbols.size}`
    );
    if (zeroRows > 0) {
      console.log(
        `   These rows don't affect optimization but add unnecessary computation`
      );
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
