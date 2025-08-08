import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function parseHoldingsFromText(text) {
  console.log("=== Parsing Extracted Holdings ===");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  console.log(`Found ${lines.length} lines of text`);

  const holdings = {};
  let lineCount = 0;
  let inHoldingsSection = false;

  for (const line of lines) {
    lineCount++;

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
      console.log(`Skipping header line ${lineCount}: ${line}`);
      continue;
    }

    // Look for lines that start with a ticker symbol (1-5 uppercase letters)
    const tickerPattern =
      /^([A-Z]{1,5})\s+(.+?)\s+([A-Z0-9]{9})\s+([0-9,]+\.?[0-9]*)\s+([0-9,]+\.?[0-9]*)\s+([0-9,]+\.?[0-9]*)\s+([0-9.]+)$/;
    const match = line.match(tickerPattern);

    if (match) {
      const [, ticker, company, cusip, shares, price, marketValue, weight] =
        match;

      console.log(`Found holding: ${ticker} - ${company} - ${weight}%`);

      holdings[ticker] = {
        company: company.trim(),
        cusip: cusip.trim(),
        shares: parseFloat(shares.replace(/,/g, "")),
        price: parseFloat(price.replace(/,/g, "")),
        marketValue: parseFloat(marketValue.replace(/,/g, "")),
        weight: parseFloat(weight) * 100, // Convert to percentage
        source: "pdf_extraction",
      };
    } else {
      // Try alternative pattern for lines that might be split differently
      const simplePattern = /^([A-Z]{1,5})\s+(.+?)\s+([0-9.]+)$/;
      const simpleMatch = line.match(simplePattern);

      if (simpleMatch) {
        const [, ticker, company, weight] = simpleMatch;

        // Only add if it looks like a valid holding
        if (parseFloat(weight) > 0 && parseFloat(weight) < 100) {
          console.log(
            `Found simple holding: ${ticker} - ${company} - ${weight}%`
          );

          holdings[ticker] = {
            company: company.trim(),
            weight: parseFloat(weight),
            source: "pdf_extraction_simple",
          };
        }
      }
    }
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
