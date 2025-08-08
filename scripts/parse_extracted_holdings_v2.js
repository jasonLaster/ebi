import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseHoldingsFromText(text) {
  console.log("=== Parsing Extracted Holdings (Tabular Format) ===");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  console.log(`Found ${lines.length} lines of text`);

  const holdings = {};
  let currentHolding = null;
  let fieldIndex = 0;
  const fields = [
    "ticker",
    "company",
    "cusip",
    "shares",
    "price",
    "marketValue",
    "weight",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header lines
    if (
      line.toLowerCase().includes("fund holdings") ||
      line.toLowerCase().includes("stock ticker") ||
      line.toLowerCase().includes("security name") ||
      line.toLowerCase().includes("cusip") ||
      line.toLowerCase().includes("shares") ||
      line.toLowerCase().includes("price") ||
      line.toLowerCase().includes("mkt value") ||
      line.toLowerCase().includes("weightings")
    ) {
      continue;
    }

    // Look for ticker symbols (1-5 uppercase letters)
    const tickerPattern = /^([A-Z]{1,5})$/;
    const tickerMatch = line.match(tickerPattern);

    if (tickerMatch) {
      // Start a new holding
      if (currentHolding && currentHolding.ticker) {
        // Save the previous holding if it's complete
        if (currentHolding.weight !== undefined) {
          console.log(
            `Found holding: ${currentHolding.ticker} - ${currentHolding.company} - ${currentHolding.weight}%`
          );
          holdings[currentHolding.ticker] = {
            company: currentHolding.company,
            cusip: currentHolding.cusip,
            shares: currentHolding.shares,
            price: currentHolding.price,
            marketValue: currentHolding.marketValue,
            weight: currentHolding.weight,
            source: "pdf_extraction",
          };
        }
      }

      // Start new holding
      currentHolding = { ticker: tickerMatch[1] };
      fieldIndex = 1; // Next field should be company name
    } else if (currentHolding && fieldIndex < fields.length) {
      // Process the current field
      const fieldName = fields[fieldIndex];

      if (fieldName === "company") {
        currentHolding.company = line;
      } else if (fieldName === "cusip") {
        currentHolding.cusip = line;
      } else if (fieldName === "shares") {
        currentHolding.shares = parseFloat(line.replace(/,/g, ""));
      } else if (fieldName === "price") {
        currentHolding.price = parseFloat(line.replace(/,/g, ""));
      } else if (fieldName === "marketValue") {
        currentHolding.marketValue = parseFloat(line.replace(/,/g, ""));
      } else if (fieldName === "weight") {
        currentHolding.weight = parseFloat(line); // Keep as decimal (0.00 = 0.00%)
      }

      fieldIndex++;
    }
  }

  // Don't forget the last holding
  if (
    currentHolding &&
    currentHolding.ticker &&
    currentHolding.weight !== undefined
  ) {
    console.log(
      `Found holding: ${currentHolding.ticker} - ${currentHolding.company} - ${currentHolding.weight}%`
    );
    holdings[currentHolding.ticker] = {
      company: currentHolding.company,
      cusip: currentHolding.cusip,
      shares: currentHolding.shares,
      price: currentHolding.price,
      marketValue: currentHolding.marketValue,
      weight: currentHolding.weight,
      source: "pdf_extraction",
    };
  }

  console.log(`\nExtracted ${Object.keys(holdings).length} holdings`);
  return holdings;
}

function saveHoldingsAsJSON(holdings, filename) {
  const outputPath = path.join(__dirname, `../data/${filename}`);
  const jsonData = { holdings };
  fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));
  console.log(`Holdings saved to: ${outputPath}`);
  return outputPath;
}

function analyzeHoldings(holdings) {
  console.log("\n=== Holdings Analysis ===");

  const totalWeight = Object.values(holdings).reduce(
    (sum, holding) => sum + holding.weight,
    0
  );
  console.log(`Total weight: ${totalWeight.toFixed(2)}%`);

  // Sort by weight (descending)
  const sortedHoldings = Object.entries(holdings).sort(
    ([, a], [, b]) => b.weight - a.weight
  );

  console.log("\nTop 10 holdings by weight:");
  sortedHoldings.slice(0, 10).forEach(([ticker, data], index) => {
    console.log(
      `${index + 1}. ${ticker}: ${data.company} (${data.weight.toFixed(2)}%)`
    );
  });

  // Count holdings with different weight ranges
  const weightRanges = {
    "0-0.1%": 0,
    "0.1-0.5%": 0,
    "0.5-1%": 0,
    "1-2%": 0,
    "2-5%": 0,
    "5%+": 0,
  };

  Object.values(holdings).forEach((holding) => {
    if (holding.weight < 0.1) weightRanges["0-0.1%"]++;
    else if (holding.weight < 0.5) weightRanges["0.1-0.5%"]++;
    else if (holding.weight < 1) weightRanges["0.5-1%"]++;
    else if (holding.weight < 2) weightRanges["1-2%"]++;
    else if (holding.weight < 5) weightRanges["2-5%"]++;
    else weightRanges["5%+"]++;
  });

  console.log("\nWeight distribution:");
  Object.entries(weightRanges).forEach(([range, count]) => {
    console.log(`  ${range}: ${count} holdings`);
  });
}

async function main() {
  const extractedTextPath = path.join(
    __dirname,
    "../data/extracted_holdings.txt"
  );

  if (!fs.existsSync(extractedTextPath)) {
    console.error(`Extracted text file not found: ${extractedTextPath}`);
    console.log(
      "Please run: pdftotext 'data/Fund Holdings (3).pdf' 'data/extracted_holdings.txt'"
    );
    return;
  }

  console.log("Reading extracted holdings text...");
  const text = fs.readFileSync(extractedTextPath, "utf8");

  // Parse the holdings
  const holdings = parseHoldingsFromText(text);

  if (Object.keys(holdings).length === 0) {
    console.log("No holdings found. Check the text format.");
    return;
  }

  // Save as JSON
  const jsonPath = saveHoldingsAsJSON(holdings, "fund_holdings_extracted.json");

  // Analyze the holdings
  analyzeHoldings(holdings);

  console.log(
    `\n✅ Successfully extracted ${
      Object.keys(holdings).length
    } holdings from PDF`
  );
  console.log(`📁 JSON file saved to: ${jsonPath}`);
}

main().catch(console.error);
