import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function parseEBIPDF(pdfPath) {
  console.log("📄 Parsing EBI PDF holdings...");

  try {
    // Read the PDF content (assuming it's already extracted as text)
    const pdfContent = await fs.promises.readFile(pdfPath, "utf8");

    // Parse holdings from the PDF content
    const holdings = parseHoldingsFromText(pdfContent);

    // Create the output structure
    const output = {
      etfSymbol: "EBI",
      lastUpdated: new Date().toISOString(),
      holdings: holdings,
    };

    // Save to data/ebi_holdings.json
    const outputPath = path.join(__dirname, "../data/ebi_holdings.json");
    await fs.promises.writeFile(outputPath, JSON.stringify(output, null, 2));

    console.log(`✅ Parsed ${Object.keys(holdings).length} holdings`);
    console.log(`📁 Saved to: ${outputPath}`);

    return output;
  } catch (error) {
    console.error("❌ Error parsing PDF:", error);
    throw error;
  }
}

function parseHoldingsFromText(content) {
  const holdings = {};
  const lines = content.split("\n");

  let currentSection = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) continue;

    // Look for section headers
    if (trimmedLine.includes("HOLDINGS") || trimmedLine.includes("Holdings")) {
      currentSection = "holdings";
      continue;
    }

    // Parse holdings data
    if (currentSection === "holdings") {
      const holding = parseHoldingLine(trimmedLine);
      if (holding) {
        holdings[holding.symbol] = {
          name: holding.name,
          weight: holding.weight, // Store as decimal (e.g., 0.0621 for 6.21%)
          market_value: holding.marketValue || 0,
          actual_weight: holding.weight, // Same as weight for consistency
          price: holding.price || null,
        };
      }
    }
  }

  return holdings;
}

function parseHoldingLine(line) {
  // Common patterns for holdings data
  const patterns = [
    // Pattern: SYMBOL NAME WEIGHT% MARKET_VALUE PRICE
    /^([A-Z]{1,5})\s+(.+?)\s+(\d+\.?\d*)\s*%\s*(\d+,?\d*\.?\d*)\s*(\d+\.?\d*)?$/,
    // Pattern: SYMBOL NAME WEIGHT% MARKET_VALUE
    /^([A-Z]{1,5})\s+(.+?)\s+(\d+\.?\d*)\s*%\s*(\d+,?\d*\.?\d*)$/,
    // Pattern: SYMBOL NAME WEIGHT%
    /^([A-Z]{1,5})\s+(.+?)\s+(\d+\.?\d*)\s*%$/,
    // Pattern with commas: SYMBOL, NAME, WEIGHT%, MARKET_VALUE, PRICE
    /^([A-Z]{1,5}),\s*(.+?),\s*(\d+\.?\d*)%,\s*(\d+,?\d*\.?\d*),\s*(\d+\.?\d*)?$/,
    // Pattern with tabs: SYMBOL\tNAME\tWEIGHT%\tMARKET_VALUE\tPRICE
    /^([A-Z]{1,5})\t(.+?)\t(\d+\.?\d*)%\t(\d+,?\d*\.?\d*)\t(\d+\.?\d*)?$/,
  ];

  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (match) {
      const symbol = match[1];
      const name = match[2].trim();
      const weightPercent = parseFloat(match[3]);
      const marketValue = match[4] ? parseFloat(match[4].replace(/,/g, "")) : 0;
      const price = match[5] ? parseFloat(match[5]) : null;

      // Convert percentage to decimal
      const weightDecimal = weightPercent / 100;

      return {
        symbol,
        name,
        weight: weightDecimal,
        marketValue,
        price,
      };
    }
  }

  // If no pattern matches, try to extract basic info
  const basicMatch = line.match(/^([A-Z]{1,5})\s+(.+?)\s+(\d+\.?\d*)\s*%?/);
  if (basicMatch) {
    const symbol = basicMatch[1];
    const name = basicMatch[2].trim();
    const weightPercent = parseFloat(basicMatch[3]);
    const weightDecimal = weightPercent / 100;

    return {
      symbol,
      name,
      weight: weightDecimal,
      marketValue: 0,
      price: null,
    };
  }

  return null;
}

// Main function
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node parse_ebi_pdf.js <pdf-file-path>");
    console.log("Example: node parse_ebi_pdf.js data/Fund Holdings (3).pdf");
    process.exit(1);
  }

  const pdfPath = args[0];

  if (!fs.existsSync(pdfPath)) {
    console.error(`❌ File not found: ${pdfPath}`);
    process.exit(1);
  }

  try {
    await parseEBIPDF(pdfPath);
    console.log("🎉 EBI holdings parsing complete!");
  } catch (error) {
    console.error("❌ Failed to parse EBI holdings:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { parseEBIPDF, parseHoldingsFromText };
