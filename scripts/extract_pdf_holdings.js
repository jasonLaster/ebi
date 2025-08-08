import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// We'll need to install pdf-parse first
// npm install pdf-parse

async function extractHoldingsFromPDF(pdfPath) {
  try {
    // Import pdf-parse dynamically (you'll need to install it first)
    const pdfParse = await import("pdf-parse");

    console.log(`Reading PDF from: ${pdfPath}`);
    const dataBuffer = fs.readFileSync(pdfPath);

    console.log("Parsing PDF content...");
    const data = await pdfParse.default(dataBuffer);

    console.log(`PDF Text Length: ${data.text.length} characters`);
    console.log(`Number of Pages: ${data.numpages}`);

    // Extract the text content
    const text = data.text;

    // Save raw text for inspection
    const outputPath = path.join(__dirname, "../data/extracted_pdf_text.txt");
    fs.writeFileSync(outputPath, text);
    console.log(`Raw text saved to: ${outputPath}`);

    // Try to parse holdings from the text
    const holdings = parseHoldingsFromText(text);

    // Save parsed holdings as JSON
    const jsonOutputPath = path.join(
      __dirname,
      "../data/extracted_holdings.json"
    );
    fs.writeFileSync(jsonOutputPath, JSON.stringify(holdings, null, 2));
    console.log(`Parsed holdings saved to: ${jsonOutputPath}`);

    return holdings;
  } catch (error) {
    console.error("Error extracting holdings from PDF:", error);
    throw error;
  }
}

function parseHoldingsFromText(text) {
  console.log("Parsing holdings from text...");

  // Split text into lines
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  console.log(`Found ${lines.length} lines of text`);

  // Look for patterns that might indicate holdings data
  const holdings = {};
  let inHoldingsSection = false;
  let lineCount = 0;

  for (const line of lines) {
    lineCount++;

    // Look for headers that might indicate holdings section
    if (
      line.toLowerCase().includes("holdings") ||
      line.toLowerCase().includes("portfolio") ||
      line.toLowerCase().includes("securities")
    ) {
      console.log(
        `Found potential holdings header at line ${lineCount}: ${line}`
      );
      inHoldingsSection = true;
      continue;
    }

    // Look for patterns that might be stock holdings
    // Common patterns: Ticker Symbol, Company Name, Weight/Percentage
    const stockPattern = /^([A-Z]{1,5})\s+(.+?)\s+([0-9.]+%?)$/;
    const match = line.match(stockPattern);

    if (match) {
      const [, ticker, company, weight] = match;
      console.log(
        `Found potential holding: ${ticker} - ${company} - ${weight}`
      );
      holdings[ticker] = {
        company: company.trim(),
        weight: weight.replace("%", ""),
        source: "pdf_extraction",
      };
    }

    // Alternative pattern: just ticker and weight
    const simplePattern = /^([A-Z]{1,5})\s+([0-9.]+%?)$/;
    const simpleMatch = line.match(simplePattern);

    if (simpleMatch && !holdings[simpleMatch[1]]) {
      const [, ticker, weight] = simpleMatch;
      console.log(`Found simple holding: ${ticker} - ${weight}`);
      holdings[ticker] = {
        company: "Unknown",
        weight: weight.replace("%", ""),
        source: "pdf_extraction",
      };
    }
  }

  console.log(`Extracted ${Object.keys(holdings).length} potential holdings`);
  return holdings;
}

async function main() {
  const pdfPath = path.join(__dirname, "../data/Fund Holdings (3).pdf");

  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF file not found: ${pdfPath}`);
    return;
  }

  try {
    const holdings = await extractHoldingsFromPDF(pdfPath);
    console.log("\nExtraction Summary:");
    console.log(`Total holdings found: ${Object.keys(holdings).length}`);

    // Show first few holdings as example
    const sampleHoldings = Object.entries(holdings).slice(0, 5);
    console.log("\nSample holdings:");
    sampleHoldings.forEach(([ticker, data]) => {
      console.log(`  ${ticker}: ${data.company} (${data.weight}%)`);
    });
  } catch (error) {
    console.error("Failed to extract holdings:", error);
  }
}

main().catch(console.error);
