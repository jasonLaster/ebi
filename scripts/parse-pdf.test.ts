/// <reference types="bun-types" />
/// <reference types="node" />

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { parsePdfToJson, type HoldingsData } from "./parse-pdf";
import { Database } from "bun:sqlite";
import * as os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("EBI Holdings Validation", () => {
  let holdingsData: HoldingsData;

  test("Load holdings JSON file", () => {
    const filePath = path.join(__dirname, "../data/ebi_holdings.json");
    expect(fs.existsSync(filePath)).toBe(true);

    const fileContent = fs.readFileSync(filePath, "utf-8");
    holdingsData = JSON.parse(fileContent);

    expect(holdingsData).toBeDefined();
    expect(holdingsData.etfSymbol).toBe("EBI");
    expect(holdingsData.holdings).toBeDefined();
  });

  test("Validate AA (Alcoa Corp) holdings", () => {
    const aa = holdingsData.holdings["AA"];

    expect(aa).toBeDefined();
    expect(aa.name).toBe("Alcoa Corp");
    expect(aa.weight).toBeCloseTo(0.0027, 4); // 0.27% as decimal
    expect(aa.market_value).toBeCloseTo(1579268.75, 2);
    expect(aa.price).toBeCloseTo(51.25, 2);
    expect(aa.shares).toBeCloseTo(30815.0, 2);
    expect(aa.actual_weight).toBeCloseTo(0.0027, 4);
  });

  test("Validate AAMI (Acadian Asset Management Inc) holdings", () => {
    const aami = holdingsData.holdings["AAMI"];

    expect(aami).toBeDefined();
    expect(aami.name).toBe("Acadian Asset Management Inc");
    expect(aami.weight).toBe(0); // 0.00% as decimal
    expect(aami.market_value).toBeCloseTo(950.8, 2);
    expect(aami.price).toBeCloseTo(47.54, 2);
    expect(aami.shares).toBeCloseTo(20.0, 2);
    expect(aami.actual_weight).toBe(0);
  });

  test("Validate holdings structure", () => {
    const holdings = holdingsData.holdings;

    // Check that we have holdings
    expect(Object.keys(holdings).length).toBeGreaterThan(0);

    // Validate structure of all holdings
    for (const [ticker, holding] of Object.entries(holdings)) {
      expect(ticker).toMatch(/^[A-Z]{1,5}$/); // Valid ticker format
      expect(holding.name).toBeDefined();
      expect(typeof holding.name).toBe("string");
      expect(holding.name.length).toBeGreaterThan(0);

      expect(typeof holding.weight).toBe("number");
      expect(holding.weight).toBeGreaterThanOrEqual(0);
      expect(holding.weight).toBeLessThanOrEqual(1); // Should be between 0 and 1 (0% to 100%)

      expect(typeof holding.market_value).toBe("number");
      expect(holding.market_value).toBeGreaterThanOrEqual(0);

      expect(typeof holding.shares).toBe("number");
      expect(holding.shares).toBeGreaterThanOrEqual(0);

      expect(typeof holding.actual_weight).toBe("number");
      expect(holding.actual_weight).toBeGreaterThanOrEqual(0);
      expect(holding.actual_weight).toBeLessThanOrEqual(1);

      expect(holding.price).toBeDefined();
      if (holding.price !== null) {
        expect(typeof holding.price).toBe("number");
        expect(holding.price).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("Validate specific values match expected format", () => {
    // Test AA values match exactly
    const aa = holdingsData.holdings["AA"];
    expect(aa.name).toBe("Alcoa Corp");
    expect(aa.weight * 100).toBeCloseTo(0.27, 2); // Convert to percentage
    expect(aa.market_value).toBe(1579268.75);
    expect(aa.price).toBe(51.25);
    expect(aa.shares).toBe(30815.0);

    // Test AAMI values match exactly
    const aami = holdingsData.holdings["AAMI"];
    expect(aami.name).toBe("Acadian Asset Management Inc");
    expect(aami.weight * 100).toBe(0.0); // Convert to percentage
    expect(aami.market_value).toBeCloseTo(950.8, 2);
    expect(aami.price).toBe(47.54);
    expect(aami.shares).toBe(20.0);
  });
});

describe("parsePdfToJson function", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ebi-parse-pdf-"));
  const testOutputPath = path.join(tmpDir, "test_output.json");
  const testDbPath = path.join(tmpDir, "holdings.db");
  const inputPdfPath = path.join(__dirname, "../in/holdings.pdf");

  afterAll(() => {
    // Clean up test output file
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test("should parse PDF and generate JSON file", async () => {
    // Skip if input PDF doesn't exist
    if (!fs.existsSync(inputPdfPath)) {
      console.warn(`Skipping test: Input PDF not found at ${inputPdfPath}`);
      expect(false).toBe(true);
      return;
    }

    const result = await parsePdfToJson(inputPdfPath, testOutputPath, {
      analyze: false,
      silent: true,
      sqlitePath: testDbPath,
    });

    // Verify output file was created
    expect(fs.existsSync(testOutputPath)).toBe(true);

    // Verify result structure
    expect(result).toBeDefined();
    expect(result.etfSymbol).toBe("EBI");
    expect(result.holdings).toBeDefined();
    expect(Object.keys(result.holdings).length).toBeGreaterThan(0);

    // Verify output file content matches result
    const fileContent = fs.readFileSync(testOutputPath, "utf-8");
    const fileData: HoldingsData = JSON.parse(fileContent);
    expect(fileData.etfSymbol).toBe(result.etfSymbol);
    expect(fileData.holdings).toEqual(result.holdings);

    // Verify specific holdings are present
    expect(result.holdings["AA"]).toBeDefined();
    expect(result.holdings["AA"].name).toBe("Alcoa Corp");
    expect(result.holdings["AAMI"]).toBeDefined();
    expect(result.holdings["AAMI"].name).toBe("Acadian Asset Management Inc");

    // Verify DB was created and has rows for EBI
    expect(fs.existsSync(testDbPath)).toBe(true);
    const db = new Database(testDbPath, { readonly: true });
    try {
      const row = db
        .query(
          `
          SELECT e.symbol as symbol, COUNT(*) as n
          FROM holdings h
          JOIN etfs e ON e.id = h.etf_id
          WHERE e.symbol = 'EBI'
          GROUP BY e.symbol
        `
        )
        .get() as { symbol: string; n: number } | null;
      expect(row).not.toBeNull();
      expect(row!.n).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  test("should throw error for non-existent PDF file", async () => {
    const nonExistentPath = path.join(__dirname, "../in/non-existent.pdf");

    await expect(
      parsePdfToJson(nonExistentPath, testOutputPath, {
        silent: true,
        sqlitePath: testDbPath,
      })
    ).rejects.toThrow("PDF file not found");
  });

  test("should handle analyze option", async () => {
    if (!fs.existsSync(inputPdfPath)) {
      console.warn(`Skipping test: Input PDF not found at ${inputPdfPath}`);
      return;
    }

    // Test with analyze enabled (should output analysis)
    const outputPath1 = path.join(tmpDir, "test_output_analyze.json");
    const result1 = await parsePdfToJson(inputPdfPath, outputPath1, {
      analyze: true,
      silent: false,
      sqlitePath: testDbPath,
    });

    expect(result1).toBeDefined();
    expect(Object.keys(result1.holdings).length).toBeGreaterThan(0);

    // Clean up
    if (fs.existsSync(outputPath1)) {
      fs.unlinkSync(outputPath1);
    }
  });
});
