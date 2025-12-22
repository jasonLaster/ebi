import * as fs from "fs";
import { PDFParse as PdfParse } from "pdf-parse";
import { Holding, HoldingsData } from "../lib/types";
import { HoldingsDb, openHoldingsDb } from "../lib/db";
import { writeHoldingsOutputs, resolvePath } from "./storage";

export type Logger = Pick<typeof console, "log" | "warn" | "error">;

function noop(): void {}

export function getLogger(opts?: {
  silent?: boolean;
  logger?: Logger;
}): Logger {
  if (opts?.logger) return opts.logger;
  if (opts?.silent) return { log: noop, warn: noop, error: noop };
  return console;
}

export async function extractTextFromPdf(
  inputPdfPath: string,
  opts?: { silent?: boolean; logger?: Logger }
): Promise<string> {
  const logger = getLogger(opts);
  const resolved = resolvePath(inputPdfPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`PDF file not found: ${resolved}`);
  }

  logger.log(`Reading PDF from: ${resolved}`);
  const dataBuffer = fs.readFileSync(resolved);
  const uint8Array = new Uint8Array(dataBuffer);

  logger.log("Parsing PDF content...");
  const parser = new PdfParse(uint8Array);
  // `load()` is marked private in types, but is required at runtime.
  await (parser as unknown as { load: () => Promise<void> }).load();
  const textResult = await parser.getText();

  return typeof textResult === "string"
    ? textResult
    : textResult.text || String(textResult);
}

export function parseHoldingsFromText(
  text: string,
  opts?: { silent?: boolean; logger?: Logger }
): Record<string, Holding> {
  const logger = getLogger(opts);
  logger.log("=== Parsing Extracted Holdings (Final Format) ===");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  logger.log(`Found ${lines.length} lines of text`);

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
      line.length < 10
    ) {
      continue;
    }

    // Example: "AAPL Apple Inc 037833100 94,435.00 273.67 25,844,026.45 4.48"
    const tickerMatch = line.match(/^([A-Z]{1,5})\s+(.+)$/);
    if (!tickerMatch) continue;

    const ticker = tickerMatch[1];
    const restOfLine = tickerMatch[2];
    const parts = restOfLine.split(/\s+/);
    if (parts.length < 6) continue;

    // Find CUSIP (9 alphanumeric)
    let cusipIndex = -1;
    for (let j = parts.length - 5; j >= 0; j--) {
      if (/^[A-Z0-9]{9}$/.test(parts[j])) {
        cusipIndex = j;
        break;
      }
    }
    if (cusipIndex === -1) continue;

    const weight = parseFloat(parts[parts.length - 1]) / 100; // pct → decimal
    const marketValue = parseFloat(parts[parts.length - 2].replace(/,/g, ""));
    const price = parseFloat(parts[parts.length - 3].replace(/,/g, ""));
    const shares = parseFloat(parts[parts.length - 4].replace(/,/g, ""));
    const companyName = parts.slice(0, cusipIndex).join(" ");

    if (
      ticker &&
      companyName &&
      !Number.isNaN(weight) &&
      !Number.isNaN(marketValue)
    ) {
      holdings[ticker] = {
        name: companyName,
        weight,
        market_value: marketValue,
        actual_weight: weight,
        price: Number.isNaN(price) ? null : price,
        shares: Number.isNaN(shares) ? 0 : shares,
      };
    }
  }

  logger.log(`\nExtracted ${Object.keys(holdings).length} holdings`);
  return holdings;
}

export function analyzeHoldings(
  holdings: Record<string, Holding>,
  opts?: { silent?: boolean; logger?: Logger }
): void {
  const logger = getLogger(opts);
  logger.log("\n=== Holdings Analysis ===");

  const totalWeight = Object.values(holdings).reduce(
    (sum, h) => sum + h.weight,
    0
  );
  logger.log(`Total weight: ${(totalWeight * 100).toFixed(2)}%`);

  const sorted = Object.entries(holdings).sort(
    ([, a], [, b]) => b.weight - a.weight
  );
  logger.log("\nTop 10 holdings by weight:");
  sorted.slice(0, 10).forEach(([ticker, data], idx) => {
    logger.log(
      `${idx + 1}. ${ticker}: ${data.name} (${(data.weight * 100).toFixed(2)}%)`
    );
  });
}

export async function parsePdfToHoldingsData(
  inputPdfPath: string,
  opts?: { silent?: boolean; logger?: Logger }
): Promise<HoldingsData> {
  const text = await extractTextFromPdf(inputPdfPath, opts);
  const holdings = parseHoldingsFromText(text, opts);
  if (Object.keys(holdings).length === 0) {
    throw new Error("No holdings found. Check the PDF format.");
  }
  return {
    etfSymbol: "EBI",
    lastUpdated: new Date().toISOString(),
    holdings,
  };
}

export async function parsePdfToJson(
  inputPdfPath: string,
  outputJsonPath: string,
  opts?: {
    analyze?: boolean;
    silent?: boolean;
    logger?: Logger;
    db?: HoldingsDb;
  }
): Promise<HoldingsData> {
  const data = await parsePdfToHoldingsData(inputPdfPath, opts);

  const db = opts?.db ?? (await openHoldingsDb());
  try {
    const out = await writeHoldingsOutputs(data, {
      jsonPath: outputJsonPath,
      db,
    });

    if (opts?.analyze !== false) analyzeHoldings(data.holdings, opts);

    const logger = getLogger(opts);
    if (!opts?.silent) {
      logger.log(
        `\n✅ Successfully extracted ${Object.keys(data.holdings).length} holdings from PDF`
      );
      logger.log(`📁 JSON file saved to: ${out.jsonPath}`);
    }
  } finally {
    if (!opts?.db) {
      // Only close if we created the connection
      db.close();
    }
  }

  return data;
}
