import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

async function analyzeOverlap() {
  console.log("🔍 Analyzing ETF Holdings Overlap...\n");

  // Load all holdings
  const ebiHoldings = await loadHoldings(
    path.join(__dirname, "../data/data-may/ebi_holdings.json")
  );
  const vtiHoldings = await loadHoldings(
    path.join(__dirname, "../data/data-may/vti_holdings.json")
  );
  const vtvHoldings = await loadHoldings(
    path.join(__dirname, "../data/data-may/vtv_holdings.json")
  );
  const iwnHoldings = await loadHoldings(
    path.join(__dirname, "../data/data-may/iwn_holdings.json")
  );

  console.log(`📊 Holdings Count:`);
  console.log(`  EBI: ${ebiHoldings.size} stocks`);
  console.log(`  VTI: ${vtiHoldings.size} stocks`);
  console.log(`  VTV: ${vtvHoldings.size} stocks`);
  console.log(`  IWN: ${iwnHoldings.size} stocks\n`);

  // Find overlap between EBI and each ETF
  const ebiSymbols = new Set(ebiHoldings.keys());

  const vtiOverlap = new Set([...ebiSymbols].filter((x) => vtiHoldings.has(x)));
  const vtvOverlap = new Set([...ebiSymbols].filter((x) => vtvHoldings.has(x)));
  const iwnOverlap = new Set([...ebiSymbols].filter((x) => iwnHoldings.has(x)));

  console.log(`🔄 Overlap Analysis:`);
  console.log(
    `  EBI ↔ VTI: ${vtiOverlap.size} stocks (${(
      (vtiOverlap.size / ebiSymbols.size) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `  EBI ↔ VTV: ${vtvOverlap.size} stocks (${(
      (vtvOverlap.size / ebiSymbols.size) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `  EBI ↔ IWN: ${iwnOverlap.size} stocks (${(
      (iwnOverlap.size / ebiSymbols.size) *
      100
    ).toFixed(1)}%)\n`
  );

  // Show top holdings for each ETF
  console.log(`📈 Top 10 Holdings by Weight:`);

  console.log(`\nEBI Top Holdings:`);
  const ebiTop = Array.from(ebiHoldings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  ebiTop.forEach(([symbol, weight]) => {
    console.log(`  ${symbol}: ${(weight * 100).toFixed(2)}%`);
  });

  console.log(`\nVTI Top Holdings:`);
  const vtiTop = Array.from(vtiHoldings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  vtiTop.forEach(([symbol, weight]) => {
    console.log(`  ${symbol}: ${(weight * 100).toFixed(2)}%`);
  });

  console.log(`\nVTV Top Holdings:`);
  const vtvTop = Array.from(vtvHoldings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  vtvTop.forEach(([symbol, weight]) => {
    console.log(`  ${symbol}: ${(weight * 100).toFixed(2)}%`);
  });

  console.log(`\nIWN Top Holdings:`);
  const iwnTop = Array.from(iwnHoldings.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  iwnTop.forEach(([symbol, weight]) => {
    console.log(`  ${symbol}: ${(weight * 100).toFixed(2)}%`);
  });

  // Calculate correlation-like metric
  console.log(`\n📊 Weight Correlation Analysis:`);
  let totalWeightDiff = 0;
  let count = 0;

  for (const symbol of vtiOverlap) {
    const ebiWeight = ebiHoldings.get(symbol) || 0;
    const vtiWeight = vtiHoldings.get(symbol) || 0;
    const diff = Math.abs(ebiWeight - vtiWeight);
    totalWeightDiff += diff;
    count++;
  }

  const avgWeightDiff = count > 0 ? totalWeightDiff / count : 0;
  console.log(
    `  Average weight difference (EBI vs VTI): ${(avgWeightDiff * 100).toFixed(
      4
    )}%`
  );

  // Test a simple approximation
  console.log(`\n🧮 Simple Approximation Test:`);
  let totalError = 0;
  let errorCount = 0;

  for (const symbol of ebiSymbols) {
    const ebiWeight = ebiHoldings.get(symbol) || 0;
    const vtiWeight = vtiHoldings.get(symbol) || 0;
    const vtvWeight = vtvHoldings.get(symbol) || 0;
    const iwnWeight = iwnHoldings.get(symbol) || 0;

    // Test 100% VTI approximation
    const syntheticWeight = vtiWeight;
    const error = Math.abs(ebiWeight - syntheticWeight);
    totalError += error;
    if (error > 0.001) errorCount++;
  }

  console.log(`  Error with 100% VTI: ${(totalError * 100).toFixed(4)}%`);
  console.log(`  Stocks with error > 0.1%: ${errorCount}/${ebiSymbols.size}`);

  // Test 75% VTI + 10% VTV + 15% IWN
  totalError = 0;
  errorCount = 0;

  for (const symbol of ebiSymbols) {
    const ebiWeight = ebiHoldings.get(symbol) || 0;
    const vtiWeight = vtiHoldings.get(symbol) || 0;
    const vtvWeight = vtvHoldings.get(symbol) || 0;
    const iwnWeight = iwnHoldings.get(symbol) || 0;

    const syntheticWeight =
      0.75 * vtiWeight + 0.1 * vtvWeight + 0.15 * iwnWeight;
    const error = Math.abs(ebiWeight - syntheticWeight);
    totalError += error;
    if (error > 0.001) errorCount++;
  }

  console.log(
    `  Error with 75% VTI + 10% VTV + 15% IWN: ${(totalError * 100).toFixed(
      4
    )}%`
  );
  console.log(`  Stocks with error > 0.1%: ${errorCount}/${ebiSymbols.size}`);
}

analyzeOverlap().catch(console.error);
