import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Since we can't easily install pdf-parse, let's create a manual extraction approach
// This will help us understand the PDF structure and create a template for extraction

async function analyzePDFStructure() {
  const pdfPath = path.join(__dirname, "../data/Fund Holdings (3).pdf");

  if (!fs.existsSync(pdfPath)) {
    console.error(`PDF file not found: ${pdfPath}`);
    return;
  }

  console.log(`Analyzing PDF: ${pdfPath}`);
  const stats = fs.statSync(pdfPath);
  console.log(`File size: ${stats.size} bytes`);

  // Read the first few bytes to understand the PDF structure
  const buffer = fs.readFileSync(pdfPath);
  const header = buffer.slice(0, 100).toString("utf8");
  console.log(`PDF Header: ${header}`);

  // Look for text patterns in the binary data
  const textContent = buffer.toString(
    "utf8",
    0,
    Math.min(10000, buffer.length)
  );

  // Extract potential text content
  const lines = textContent
    .split("\n")
    .filter((line) => line.trim().length > 0);
  console.log(`\nFirst 20 lines of potential text content:`);
  lines.slice(0, 20).forEach((line, index) => {
    console.log(`${index + 1}: ${line}`);
  });

  // Save the raw content for manual inspection
  const outputPath = path.join(__dirname, "../data/pdf_raw_content.txt");
  fs.writeFileSync(outputPath, textContent);
  console.log(`\nRaw content saved to: ${outputPath}`);

  return textContent;
}

function createManualExtractionTemplate() {
  console.log("\n=== Manual PDF Extraction Template ===");
  console.log("Since automatic PDF parsing requires additional libraries,");
  console.log("here are several approaches you can use:");

  console.log("\n1. **Online PDF to Text Converters:**");
  console.log("   - Upload the PDF to https://www.pdftotext.com/");
  console.log("   - Or use https://smallpdf.com/pdf-to-text");
  console.log("   - Save the extracted text as a .txt file");

  console.log("\n2. **Command Line Tools (if available):**");
  console.log(
    "   - pdftotext (poppler-utils): pdftotext 'Fund Holdings (3).pdf' output.txt"
  );
  console.log("   - pdf2txt: pdf2txt.py 'Fund Holdings (3).pdf' > output.txt");

  console.log("\n3. **Manual Copy-Paste:**");
  console.log("   - Open the PDF in a PDF reader");
  console.log("   - Select all text (Cmd+A) and copy (Cmd+C)");
  console.log("   - Paste into a text editor and save");

  console.log("\n4. **Python Alternative:**");
  console.log("   - Install: pip install PyPDF2");
  console.log("   - Use PyPDF2 to extract text");

  console.log(
    "\nOnce you have the text content, you can use the parsing function below:"
  );
}

function parseHoldingsFromText(text) {
  console.log("\n=== Holdings Parser ===");
  console.log("This function will parse holdings from extracted text");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  console.log(`Found ${lines.length} lines of text`);

  const holdings = {};
  let lineCount = 0;

  // Common patterns for fund holdings
  const patterns = [
    // Pattern 1: Ticker - Company Name - Weight
    /^([A-Z]{1,5})\s+(.+?)\s+([0-9.]+%?)$/,
    // Pattern 2: Ticker - Weight
    /^([A-Z]{1,5})\s+([0-9.]+%?)$/,
    // Pattern 3: Company Name - Ticker - Weight
    /^(.+?)\s+([A-Z]{1,5})\s+([0-9.]+%?)$/,
    // Pattern 4: Weight - Ticker - Company
    /^([0-9.]+%?)\s+([A-Z]{1,5})\s+(.+?)$/,
  ];

  for (const line of lines) {
    lineCount++;

    // Skip headers and non-holding lines
    if (
      line.toLowerCase().includes("holdings") ||
      line.toLowerCase().includes("portfolio") ||
      line.toLowerCase().includes("securities") ||
      line.toLowerCase().includes("total") ||
      line.toLowerCase().includes("fund")
    ) {
      console.log(`Skipping header line ${lineCount}: ${line}`);
      continue;
    }

    // Try each pattern
    for (let i = 0; i < patterns.length; i++) {
      const match = line.match(patterns[i]);
      if (match) {
        let ticker, company, weight;

        switch (i) {
          case 0: // Ticker - Company - Weight
            [, ticker, company, weight] = match;
            break;
          case 1: // Ticker - Weight
            [, ticker, weight] = match;
            company = "Unknown";
            break;
          case 2: // Company - Ticker - Weight
            [, company, ticker, weight] = match;
            break;
          case 3: // Weight - Ticker - Company
            [, weight, ticker, company] = match;
            break;
        }

        // Clean up the data
        ticker = ticker.trim();
        company = company.trim();
        weight = weight.replace("%", "").trim();

        // Validate ticker (should be 1-5 uppercase letters)
        if (/^[A-Z]{1,5}$/.test(ticker) && !isNaN(parseFloat(weight))) {
          console.log(`Found holding: ${ticker} - ${company} - ${weight}%`);
          holdings[ticker] = {
            company: company,
            weight: parseFloat(weight),
            source: "pdf_extraction",
          };
          break; // Found a match, move to next line
        }
      }
    }
  }

  console.log(`\nExtracted ${Object.keys(holdings).length} holdings`);
  return holdings;
}

function createSampleData() {
  console.log("\n=== Sample Data Structure ===");
  console.log("Based on the existing JSON files, here's the expected format:");

  const sampleStructure = {
    holdings: {
      AAPL: {
        company: "Apple Inc.",
        weight: 2.5,
      },
      MSFT: {
        company: "Microsoft Corporation",
        weight: 2.1,
      },
    },
  };

  console.log(JSON.stringify(sampleStructure, null, 2));

  const outputPath = path.join(
    __dirname,
    "../data/sample_holdings_structure.json"
  );
  fs.writeFileSync(outputPath, JSON.stringify(sampleStructure, null, 2));
  console.log(`\nSample structure saved to: ${outputPath}`);
}

async function main() {
  console.log("=== PDF Holdings Extraction Tool ===");

  // Analyze the PDF structure
  const textContent = await analyzePDFStructure();

  // Create manual extraction template
  createManualExtractionTemplate();

  // Create sample data structure
  createSampleData();

  // If we have some text content, try to parse it
  if (textContent && textContent.length > 100) {
    console.log("\n=== Attempting to Parse Available Content ===");
    const holdings = parseHoldingsFromText(textContent);

    if (Object.keys(holdings).length > 0) {
      const outputPath = path.join(
        __dirname,
        "../data/extracted_holdings.json"
      );
      fs.writeFileSync(outputPath, JSON.stringify({ holdings }, null, 2));
      console.log(`\nParsed holdings saved to: ${outputPath}`);

      console.log("\nSample holdings found:");
      Object.entries(holdings)
        .slice(0, 5)
        .forEach(([ticker, data]) => {
          console.log(`  ${ticker}: ${data.company} (${data.weight}%)`);
        });
    } else {
      console.log("\nNo holdings found in the raw content.");
      console.log(
        "You'll need to use one of the manual extraction methods above."
      );
    }
  }
}

main().catch(console.error);
