import { Alglib } from "./vendor/Alglib-v1.1.0.js";
import * as fs from "fs";
import * as path from "path";
// ml-matrix is not strictly needed if all math is done with plain arrays for Alglib
// but initial data processing might still use it or be adapted.
// For now, let's assume we pass plain arrays to Alglib.

// Helper function to load and process holdings JSON
async function loadHoldings(filePath) {
  const absolutePath = path.resolve(filePath);
  const fileContent = await fs.promises.readFile(absolutePath, "utf8");
  const data = JSON.parse(fileContent);
  const holdingsMap = new Map();
  if (data && data.holdings) {
    for (const symbol in data.holdings) {
      const weight = parseFloat(data.holdings[symbol].weight);
      holdingsMap.set(symbol, (isNaN(weight) ? 0 : weight) / 100); // Convert percentage to decimal
    }
  }
  return holdingsMap;
}

async function main() {
  const alglib = new Alglib(); // Instance of the Alglib wrapper class

  alglib.promise
    .then(async () => {
      console.log("Alglib WASM is ready (using Pterodactylus wrapper).");
      try {
        // 1. Load Holdings Data
        const ebiHoldingsMap = await loadHoldings("data/ebi_holdings.json");
        const vtiHoldingsMap = await loadHoldings("data/vti_holdings.json");
        const vtvHoldingsMap = await loadHoldings("data/vtv_holdings.json");
        const iwnHoldingsMap = await loadHoldings("data/iwn_holdings.json");

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
          "Objective Value for Initial Guess (75% VTI, 10% VTV, 15% IWN):",
          initialObjectiveValue
        );

        // 5. Define Constraints for alglib.add_..._constraint()
        // This section defines constraints for the optimization problem:

        // First constraint: All weights must sum to 100%
        // Example: w1 + w2 + w3 = 1.0 (or 100%)
        alglib.add_equality_constraint((weights_arr) => {
          return weights_arr.reduce((sum, w) => sum + w, 0) - 1.0;
        });

        // Second set of constraints: Each weight must be between 0% and 100%
        // We need two inequalities per weight:

        // Lower bound: Each weight must be >= 0
        // Rewritten as: -w_i <= 0
        for (let j = 0; j < nVars; j++) {
          alglib.add_less_than_or_equal_to_constraint(
            (weights_arr) => -weights_arr[j]
          );
        }

        // Upper bound: Each weight must be <= 1 (100%)
        // Rewritten as: w_i - 1 <= 0
        for (let j = 0; j < nVars; j++) {
          alglib.add_less_than_or_equal_to_constraint(
            (weights_arr) => weights_arr[j] - 1.0
          );
        }

        // 6. Initial Guess
        // const initialGuess = [0.75, 0.10, 0.15]; // VTI 75%, VTV 10%, IWN 15% - Moved up for initial calculation

        // 7. Run Optimization using alglib.solve()
        // solve(mode, xi, xs=[], max_iterations=50000, penalty=50.0, radius=0.1, diffstep=0.000001, stop_threshold=0.00001)
        console.log(
          "Starting optimization with Alglib.js wrapper (alglib.solve)..."
        );
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
          const finalObjectiveValue = objectiveFunction(optimalWeights); // Recalculate objective value
          const report = alglib.get_report();

          console.log("Alglib.solve() finished.");
          console.log(
            "Optimal weights (VTI, VTV, IWN):",
            optimalWeights.map((w) => (w * 100).toFixed(2) + "%")
          );
          console.log(
            "Final Objective Value (Sum of Squared Error):",
            finalObjectiveValue
          );
          console.log("--- Alglib Report ---");
          console.log(report);
          console.log("--- End Alglib Report ---");
        } else {
          console.error(
            "Alglib.solve() reported an issue or did not complete successfully."
          );
          console.log("Alglib status text:", alglib.get_status());
          const report = alglib.get_report(); // Get report even on failure
          if (report) {
            console.log("--- Alglib Report (on failure) ---");
            console.log(report);
            console.log("--- End Alglib Report (on failure) ---");
          }
        }
      } catch (error) {
        console.error(
          "An error occurred during Alglib optimization (Pterodactylus wrapper approach):",
          error
        );
      } finally {
        // The Pterodactylus wrapper's remove() method should clean up its internal instance and WASM stuff.
        alglib.remove();
        console.log("Alglib instance (Pterodactylus wrapper) removed.");
      }
    })
    .catch((error) => {
      console.error(
        "Alglib WASM failed to load or an error occurred in promise.then chain:",
        error
      );
    });
}

main().catch(console.error);
