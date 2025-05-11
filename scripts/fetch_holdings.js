import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

// Log the API key to check if it's loaded
console.log("FMP_API_KEY_FROM_ENV:", process.env.FMP_API_KEY);

// Load environment variables
dotenv.config();

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE_URL = "https://financialmodelingprep.com/api/v3";

async function fetchETFHoldings(symbol) {
  const upperSymbol = symbol.toUpperCase();
  const url = `${BASE_URL}/etf-holder/${upperSymbol}?apikey=${FMP_API_KEY}`;
  console.log("Fetching URL:", url);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch holdings for ${upperSymbol}: ${response.statusText}`
    );
  }

  const rawHoldingsFromAPI = await response.json();

  if (!Array.isArray(rawHoldingsFromAPI) || rawHoldingsFromAPI.length === 0) {
    console.warn(
      `No holdings data returned for ${upperSymbol} or data is not an array.`
    );
    return [];
  }

  // First pass: map API data, parse weightPercentage and market_value
  let processedHoldings = rawHoldingsFromAPI.map((apiHolding) => {
    const weightAsDecimal =
      (parseFloat(apiHolding.weightPercentage) || 0) / 100;
    const marketVal = parseFloat(apiHolding.marketValue); // User added this field

    return {
      symbol: apiHolding.asset,
      name: apiHolding.name,
      shares: apiHolding.shares,
      weight: parseFloat(weightAsDecimal.toFixed(4)), // Original weight from weightPercentage
      market_value: isNaN(marketVal) ? 0 : marketVal, // Parsed market_value from user's change
      price: typeof apiHolding.price !== "undefined" ? apiHolding.price : null,
    };
  });

  // Calculate total market value from the processed holdings
  const totalMarketValue = processedHoldings.reduce(
    (sum, h) => sum + h.market_value,
    0
  );

  // Second pass: add actual_weight
  if (totalMarketValue > 0) {
    processedHoldings = processedHoldings.map((h) => ({
      ...h,
      actual_weight: parseFloat(
        parseFloat((h.market_value / totalMarketValue).toFixed(4))
      ), // Ensure it's a number
    }));
  } else {
    // Handle case where totalMarketValue is 0 or invalid
    processedHoldings = processedHoldings.map((h) => ({
      ...h,
      actual_weight: 0,
    }));
  }

  return processedHoldings;
}

async function saveHoldingsToFile(symbol, holdingsArray) {
  const dataDir = path.join(process.cwd(), "data");
  const filePath = path.join(dataDir, `${symbol.toLowerCase()}_holdings.json`);

  await fs.mkdir(dataDir, { recursive: true });

  const holdingsMap = holdingsArray.reduce((acc, holding) => {
    acc[holding.symbol] = {
      name: holding.name,
      shares: holding.shares,
      weight: holding.weight, // Original API weight
      market_value: holding.market_value, // From user's addition
      actual_weight: holding.actual_weight, // Newly calculated actual_weight
      price: holding.price,
    };
    return acc;
  }, {});

  await fs.writeFile(
    filePath,
    JSON.stringify(
      {
        etfSymbol: symbol.toUpperCase(),
        lastUpdated: new Date().toISOString(),
        holdings: holdingsMap,
      },
      null,
      2
    )
  );

  console.log(
    `Holdings for ${symbol.toUpperCase()} have been saved to ${filePath}`
  );
}

async function main() {
  const symbol = process.argv[2];

  if (!symbol) {
    console.error("Please provide an ETF symbol as an argument");
    console.error("Usage: node scripts/fetch_holdings.js <SYMBOL>");
    process.exit(1);
  }

  if (!FMP_API_KEY) {
    console.error("FMP_API_KEY environment variable is not set");
    process.exit(1);
  }

  try {
    console.log(`Fetching holdings for ${symbol.toUpperCase()}...`);
    const holdings = await fetchETFHoldings(symbol);

    if (holdings.length > 0) {
      // Calculate and log total actual_weight
      const totalActualWeight = holdings.reduce(
        (sum, h) => sum + (h.actual_weight || 0),
        0
      );
      console.log(
        `Total calculated actual_weight: ${totalActualWeight.toFixed(4)}`
      );
      if (Math.abs(totalActualWeight - 1) > 0.001) {
        console.warn(
          `Warning: Total actual_weight is ${totalActualWeight.toFixed(
            4
          )}, which is not exactly 1.0000. This might be due to API data or rounding differences.`
        );
      }
    } else {
      console.log("No holdings data to process or save.");
    }

    // Only save if there are holdings
    if (holdings.length > 0) {
      await saveHoldingsToFile(symbol, holdings);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
