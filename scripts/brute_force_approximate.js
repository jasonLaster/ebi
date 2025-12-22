import * as fs from "fs";
import * as path from "path";

// Helper function to load and process holdings JSON
async function loadHoldings(filePath) {
  const absolutePath = path.resolve(filePath);
  const fileContent = await fs.promises.readFile(absolutePath, "utf8");
  const data = JSON.parse(fileContent);
  const holdingsMap = new Map();
  if (data && data.holdings) {
    for (const symbol in data.holdings) {
      // JSON exports in this repo already store weights as decimals (e.g. 0.0621 = 6.21%).
      const weight = parseFloat(data.holdings[symbol].actual_weight ?? data.holdings[symbol].weight);
      holdingsMap.set(symbol, isNaN(weight) ? 0 : weight);
    }
  }
  return holdingsMap;
}

// Objective function: Calculates sum of squared differences
function calculateObjective(weights_arr, H_A, H_stack, nStocks) {
  let sumSquaredDiff = 0;
  for (let i = 0; i < nStocks; i++) {
    const syntheticHolding =
      H_stack[i][0] * weights_arr[0] + // VTI
      H_stack[i][1] * weights_arr[1] + // VTV
      H_stack[i][2] * weights_arr[2]; // IWN
    const diff = syntheticHolding - H_A[i];
    sumSquaredDiff += diff * diff;
  }
  return sumSquaredDiff;
}

async function main() {
  console.log("Starting brute-force portfolio approximation...");
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

    // 3. Prepare Holdings Data for calculation
    const H_A = sortedSymbols.map((symbol) => ebiHoldingsMap.get(symbol) || 0);
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

    let minError = Infinity;
    let bestWeights = [0, 0, 0];
    let combinationsChecked = 0;
    const step = 0.01;
    const tolerance = 1e-9; // Tolerance for floating point comparisons

    console.log("Iterating through weight combinations...");

    // Specific check for Alglib-like result
    const alglibLikeWeights = [0.88, 0.0, 0.12];
    const errorForAlglibLike = calculateObjective(
      alglibLikeWeights,
      H_A,
      H_stack,
      nStocks
    );
    console.log(
      `Sanity Check: Error for VTI 88%, VTV 0%, IWN 12% = ${errorForAlglibLike.toExponential(
        5
      )} (using brute-force data)`
    );

    for (let i = 0; i <= 100; i++) {
      // VTI weight: w1
      const w1 = i * step;
      for (let j = 0; j <= 100 - i; j++) {
        // VTV weight: w2
        const w2 = j * step;
        const w3 = 1.0 - w1 - w2; // IWN weight: w3

        // Ensure w3 is effectively non-negative and sum is 1
        if (w3 >= -tolerance && Math.abs(w1 + w2 + w3 - 1.0) < tolerance) {
          combinationsChecked++;
          const currentWeights = [w1, w2, w3];
          const currentError = calculateObjective(
            currentWeights,
            H_A,
            H_stack,
            nStocks
          );

          if (currentError < minError) {
            minError = currentError;
            bestWeights = currentWeights;
          }
        }
      }
      if (i % 10 === 0 && i > 0) {
        console.log(
          `Progress: Checked VTI up to ${(w1 * 100).toFixed(
            0
          )}%... (Current min error: ${minError.toExponential(5)})`
        );
      }
    }

    console.log("\nBrute-force search complete.");
    console.log(`Total valid combinations checked: ${combinationsChecked}`);
    console.log(
      "Best weights found (VTI, VTV, IWN):",
      bestWeights.map((w) => (w * 100).toFixed(2) + "%")
    );
    console.log("Minimum Sum of Squared Error found:", minError);
  } catch (error) {
    console.error("An error occurred during brute-force approximation:", error);
  }
}

main().catch(console.error);
