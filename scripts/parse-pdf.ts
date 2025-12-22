import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { PDFParse as pdfParse } from "pdf-parse";
import { Command } from "commander";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Holding {
  name: string;
  weight: number;
  market_value: number;
  actual_weight: number;
  price: number;
  shares: number;
}

export interface HoldingsData {
  etfSymbol: string;
  lastUpdated: string;
  holdings: Record<string, Holding>;
}

export async function extractTextFromPDF(pdfPath: string): Promise<string> {
  console.log(`Reading PDF from: ${pdfPath}`);
  const dataBuffer = fs.readFileSync(pdfPath);
  const uint8Array = new Uint8Array(dataBuffer);

  console.log("Parsing PDF content...");
  const parser = new pdfParse(uint8Array);
  await parser.load();
  const textResult = await parser.getText();

  // Extract text from TextResult object
  const extractedText =
    typeof textResult === "string"
      ? textResult
      : textResult.text || String(textResult);

  return extractedText;
}

export function parseHoldingsFromText(text: string): Record<string, Holding> {
  console.log("=== Parsing Extracted Holdings (Final Format) ===");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  console.log(`Found ${lines.length} lines of text`);

  const holdings: Record<string, Holding> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header lines and page breaks
    if (
      line.toLowerCase().includes("fund holdings") ||
      line.toLowerCase().includes("stock ticker") ||
      line.toLowerCase().includes("security name") ||
      line.toLowerCase().includes("cusip") ||
      line.toLowerCase().includes("shares") ||
      line.toLowerCase().includes("price") ||
      line.toLowerCase().includes("mkt value") ||
      line.toLowerCase().includes("weightings") ||
      line.match(/^-- \d+ of \d+ --$/) ||
      line.length < 10 // Skip very short lines that are likely not holdings
    ) {
      continue;
    }

    // Parse line format: TICKER Company Name CUSIP Shares Price MktValue Weight
    // Example: "AAPL Apple Inc 037833100 94,435.00 273.67 25,844,026.45 4.48"
    // The ticker is 1-5 uppercase letters at the start
    const tickerMatch = line.match(/^([A-Z]{1,5})\s+(.+)$/);
    if (!tickerMatch) continue;

    const ticker = tickerMatch[1];
    const restOfLine = tickerMatch[2];

    // Split by whitespace - format is: Company Name (variable words) CUSIP Shares Price MktValue Weight
    const parts = restOfLine.split(/\s+/);

    if (parts.length < 6) continue; // Need at least: Company, CUSIP, Shares, Price, MktValue, Weight

    // The last 4 parts should be: Shares, Price, MktValue, Weight
    // The second-to-last part before Shares should be CUSIP (9 alphanumeric chars)
    // Everything before CUSIP is the company name

    // Find CUSIP (9 alphanumeric characters, typically near the end before the numbers)
    let cusipIndex = -1;
    for (let i = parts.length - 5; i >= 0; i--) {
      if (/^[A-Z0-9]{9}$/.test(parts[i])) {
        cusipIndex = i;
        break;
      }
    }

    if (cusipIndex === -1) continue; // Couldn't find CUSIP

    // Extract fields from the end
    const weight = parseFloat(parts[parts.length - 1]) / 100; // Convert percentage to decimal
    const marketValue = parseFloat(parts[parts.length - 2].replace(/,/g, ""));
    const price = parseFloat(parts[parts.length - 3].replace(/,/g, ""));
    const shares = parseFloat(parts[parts.length - 4].replace(/,/g, ""));
    const cusip = parts[cusipIndex];
    const companyName = parts.slice(0, cusipIndex).join(" ");

    if (ticker && companyName && !isNaN(weight) && !isNaN(marketValue)) {
      holdings[ticker] = {
        name: companyName,
        weight: weight,
        market_value: marketValue,
        actual_weight: weight,
        price: price,
        shares: shares,
      };
    }
  }

  console.log(`\nExtracted ${Object.keys(holdings).length} holdings`);
  return holdings;
}

export function saveHoldingsAsJSON(
  holdings: Record<string, Holding>,
  outputPath: string
): string {
  // Create the final format matching the existing structure
  const outputData: HoldingsData = {
    etfSymbol: "EBI",
    lastUpdated: new Date().toISOString(),
    holdings: holdings,
  };

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
  console.log(`Holdings saved to: ${outputPath}`);
  return outputPath;
}

export function analyzeHoldings(holdings: Record<string, Holding>): void {
  console.log("\n=== Holdings Analysis ===");

  const totalWeight = Object.values(holdings).reduce(
    (sum, holding) => sum + holding.weight,
    0
  );
  console.log(`Total weight: ${(totalWeight * 100).toFixed(2)}%`);

  // Sort by weight (descending)
  const sortedHoldings = Object.entries(holdings).sort(
    ([, a], [, b]) => b.weight - a.weight
  );

  console.log("\nTop 10 holdings by weight:");
  sortedHoldings.slice(0, 10).forEach(([ticker, data], index) => {
    console.log(
      `${index + 1}. ${ticker}: ${data.name} (${(data.weight * 100).toFixed(
        2
      )}%)`
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
    const weightPercent = holding.weight * 100;
    if (weightPercent < 0.1) weightRanges["0-0.1%"]++;
    else if (weightPercent < 0.5) weightRanges["0.1-0.5%"]++;
    else if (weightPercent < 1) weightRanges["0.5-1%"]++;
    else if (weightPercent < 2) weightRanges["1-2%"]++;
    else if (weightPercent < 5) weightRanges["2-5%"]++;
    else weightRanges["5%+"]++;
  });

  console.log("\nWeight distribution:");
  Object.entries(weightRanges).forEach(([range, count]) => {
    console.log(`  ${range}: ${count} holdings`);
  });
}

export async function parsePdfToJson(
  inputPdfPath: string,
  outputJsonPath: string,
  options?: { analyze?: boolean; silent?: boolean }
): Promise<HoldingsData> {
  const { analyze: shouldAnalyze = true, silent = false } = options || {};

  // Resolve paths relative to current working directory or as absolute paths
  const resolvedInputPath = path.isAbsolute(inputPdfPath)
    ? inputPdfPath
    : path.resolve(process.cwd(), inputPdfPath);

  const resolvedOutputPath = path.isAbsolute(outputJsonPath)
    ? outputJsonPath
    : path.resolve(process.cwd(), outputJsonPath);

  if (!fs.existsSync(resolvedInputPath)) {
    throw new Error(`PDF file not found: ${resolvedInputPath}`);
  }

  // Extract text from PDF
  const extractedText = await extractTextFromPDF(resolvedInputPath);

  // Parse the holdings
  const holdings = parseHoldingsFromText(extractedText);

  if (Object.keys(holdings).length === 0) {
    throw new Error("No holdings found. Check the PDF format.");
  }

  // Save as JSON in the correct format
  const jsonPath = saveHoldingsAsJSON(holdings, resolvedOutputPath);

  // Analyze the holdings if requested
  if (shouldAnalyze) {
    analyzeHoldings(holdings);
  }

  if (!silent) {
    console.log(
      `\n✅ Successfully extracted ${
        Object.keys(holdings).length
      } holdings from PDF`
    );
    console.log(`📁 JSON file saved to: ${jsonPath}`);
    console.log(`📋 Format matches the existing ebi_holdings.json structure`);
  }

  // Return the parsed data
  return {
    etfSymbol: "EBI",
    lastUpdated: new Date().toISOString(),
    holdings: holdings,
  };
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("parse-pdf")
    .description("Parse PDF holdings files into JSON format")
    .version("1.0.0")
    .argument("<input-pdf>", "Path to input PDF file")
    .argument("<output-json>", "Path to output JSON file")
    .option("-a, --no-analyze", "Skip holdings analysis")
    .option("-s, --silent", "Suppress output messages")
    .action(async (inputPdf: string, outputJson: string, options) => {
      try {
        await parsePdfToJson(inputPdf, outputJson, {
          analyze: options.analyze !== false,
          silent: options.silent === true,
        });
      } catch (error) {
        console.error("Error processing PDF:", error);
        process.exit(1);
      }
    });

  program.parse();
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
