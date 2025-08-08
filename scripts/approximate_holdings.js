import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Make __dirname globally available for the Alglib module
global.__dirname = __dirname;
global.__filename = __filename;

import { Alglib } from "./vendor/Alglib-v1.1.0.js";

// Helper function to load and process holdings JSON
async function loadHoldings(filePath) {
  const absolutePath = path.resolve(filePath);
  const fileContent = await fs.promises.readFile(absolutePath, "utf8");
  const data = JSON.parse(fileContent);
  const holdingsMap = new Map();
  if (data && data.holdings) {
    for (const symbol in data.holdings) {
      // For EBI, use actual_weight instead of weight
      const weightField = data.etfSymbol === "EBI" ? "actual_weight" : "weight";
      const weight = parseFloat(data.holdings[symbol][weightField]);
      // For EBI, weights are in percentage form (e.g., 5.8613 = 5.86%)
      // For others, weights are in decimal form (e.g., 0.0621 = 6.21%)
      const finalWeight = data.etfSymbol === "EBI" ? weight / 100 : weight;
      holdingsMap.set(symbol, isNaN(finalWeight) ? 0 : finalWeight);
    }
  }
  return holdingsMap;
}

async function main() {
  const alglib = new Alglib(); // Instance of the Alglib wrapper class

  alglib.promise
    .then(async () => {
      console.log("Alglib WASM is ready. Starting portfolio approximation...");
      try {
        // 1. Load Holdings Data
        const ebiHoldingsMap = await loadHoldings(
          path.join(__dirname, "../data/data-may/ebi_holdings.json")
        );
        const vtiHoldingsMap = await loadHoldings(
          path.join(__dirname, "../data/data-may/vti_holdings.json")
        );
        const vtvHoldingsMap = await loadHoldings(
          path.join(__dirname, "../data/data-may/vtv_holdings.json")
        );
        const iwnHoldingsMap = await loadHoldings(
          path.join(__dirname, "../data/data-may/iwn_holdings.json")
        );

        // 2. Consolidate Stock Symbols
        const allSymbols = new Set([
          ...ebiHoldingsMap.keys(),
          ...vtiHoldingsMap.keys(),
          ...vtvHoldingsMap.keys(),
          ...iwnHoldingsMap.keys(),
        ]);
        const sortedSymbols = Array.from(allSymbols).sort();
        const nStocks = sortedSymbols.length;

        if (nStocks === 0) {
          console.error("No stock symbols found in holdings data. Exiting.");
          return;
        }
        console.log(`Found ${nStocks} unique stock symbols.`);

        // 3. Prepare Holdings Data
        const H_A = sortedSymbols.map(
          (symbol) => ebiHoldingsMap.get(symbol) || 0
        );

        const H_ETFs_columns = [
          sortedSymbols.map((symbol) => vtiHoldingsMap.get(symbol) || 0),
          sortedSymbols.map((symbol) => vtvHoldingsMap.get(symbol) || 0),
          sortedSymbols.map((symbol) => iwnHoldingsMap.get(symbol) || 0),
        ];
        const H_stack = []; // nStocks x 3 ETFs
        for (let i = 0; i < nStocks; i++) {
          H_stack.push([
            H_ETFs_columns[0][i],
            H_ETFs_columns[1][i],
            H_ETFs_columns[2][i],
          ]);
        }
        const nVars = 3; // VTI, VTV, IWN

        // 4. Define Objective Function for alglib.add_function()
        const objectiveFunction = (weights_arr) => {
          let sumSquaredDiff = 0;
          for (let i = 0; i < nStocks; i++) {
            const syntheticHolding =
              H_stack[i][0] * weights_arr[0] +
              H_stack[i][1] * weights_arr[1] +
              H_stack[i][2] * weights_arr[2];
            const diff = syntheticHolding - H_A[i];
            sumSquaredDiff += diff * diff;
          }
          return sumSquaredDiff;
        };
        alglib.add_function(objectiveFunction);

        // Calculate objective for initial guess
        const initialGuess = [0.75, 0.1, 0.15]; // VTI 75%, VTV 10%, IWN 15%
        const initialObjectiveValue = objectiveFunction(initialGuess);
        console.log(
          "Initial guess (75% VTI, 10% VTV, 15% IWN) objective value:",
          initialObjectiveValue.toFixed(6)
        );

        // 5. Define Constraints
        // All weights must sum to 100%
        alglib.add_equality_constraint((weights_arr) => {
          return weights_arr.reduce((sum, w) => sum + w, 0) - 1.0;
        });

        // Each weight must be between 0% and 100%
        for (let j = 0; j < nVars; j++) {
          alglib.add_less_than_or_equal_to_constraint(
            (weights_arr) => -weights_arr[j]
          );
          alglib.add_less_than_or_equal_to_constraint(
            (weights_arr) => weights_arr[j] - 1.0
          );
        }

        // 6. Run Optimization
        console.log("Starting optimization...");
        const solveStatus = alglib.solve(
          "min",
          initialGuess,
          [],
          5000,
          100.0,
          0.01,
          1e-7,
          1e-7
        );

        if (solveStatus) {
          const optimalWeights = alglib.get_results();
          const finalObjectiveValue = objectiveFunction(optimalWeights);

          console.log("\n=== PORTFOLIO APPROXIMATION RESULTS ===");
          console.log("Optimal weights:");
          console.log(`  VTI: ${(optimalWeights[0] * 100).toFixed(2)}%`);
          console.log(`  VTV: ${(optimalWeights[1] * 100).toFixed(2)}%`);
          console.log(`  IWN: ${(optimalWeights[2] * 100).toFixed(2)}%`);
          console.log(
            `Total: ${(
              optimalWeights.reduce((sum, w) => sum + w, 0) * 100
            ).toFixed(2)}%`
          );
          console.log(
            `\nOptimization error (sum of squared differences): ${finalObjectiveValue.toFixed(
              6
            )}`
          );
          console.log(
            `Improvement from initial guess: ${(
              ((initialObjectiveValue - finalObjectiveValue) /
                initialObjectiveValue) *
              100
            ).toFixed(2)}%`
          );

          // Calculate some statistics
          let totalError = 0;
          let maxError = 0;
          let errorCount = 0;

          for (let i = 0; i < nStocks; i++) {
            const syntheticHolding =
              H_stack[i][0] * optimalWeights[0] +
              H_stack[i][1] * optimalWeights[1] +
              H_stack[i][2] * optimalWeights[2];
            const diff = Math.abs(syntheticHolding - H_A[i]);
            totalError += diff;
            maxError = Math.max(maxError, diff);
            if (diff > 0.001) errorCount++;
          }

          console.log(`\nError Statistics:`);
          console.log(
            `  Average absolute error: ${(totalError / nStocks).toFixed(6)}`
          );
          console.log(`  Maximum absolute error: ${maxError.toFixed(6)}`);
          console.log(`  Stocks with error > 0.1%: ${errorCount}/${nStocks}`);

          // Save results to JSON file
          const results = {
            timestamp: new Date().toISOString(),
            optimalWeights: {
              vti: optimalWeights[0],
              vtv: optimalWeights[1],
              iwn: optimalWeights[2],
            },
            weightsPercentages: {
              vti: optimalWeights[0] * 100,
              vtv: optimalWeights[1] * 100,
              iwn: optimalWeights[2] * 100,
            },
            optimizationMetrics: {
              finalObjectiveValue,
              initialObjectiveValue,
              improvementPercent:
                ((initialObjectiveValue - finalObjectiveValue) /
                  initialObjectiveValue) *
                100,
              averageError: totalError / nStocks,
              maxError,
              errorCount,
              totalStocks: nStocks,
            },
            constraints: {
              weightsSum: optimalWeights.reduce((sum, w) => sum + w, 0),
              allWeightsNonNegative: optimalWeights.every((w) => w >= 0),
              allWeightsLessThanOne: optimalWeights.every((w) => w <= 1),
            },
          };

          const outputPath = path.join(
            __dirname,
            "../data/portfolio_approximation_results.json"
          );
          await fs.promises.writeFile(
            outputPath,
            JSON.stringify(results, null, 2)
          );
          console.log(`\nResults saved to: ${outputPath}`);
        } else {
          console.error("Optimization failed.");
          console.log("Alglib status:", alglib.get_status());
        }
      } catch (error) {
        console.error("An error occurred during optimization:", error);
      } finally {
        alglib.remove();
        console.log("Optimization complete.");
      }
    })
    .catch((error) => {
      console.error("Alglib WASM failed to load:", error);
    });
}

main().catch(console.error);
