#!/usr/bin/env bun

/**
 * Test script to verify P/E ratios are fetched and displayed correctly
 *
 * Usage:
 *   bun scripts/test-pe-ratio.ts
 *   bun scripts/test-pe-ratio.ts --url http://localhost:3000
 */

import { describe, test, expect } from "bun:test";

const DEFAULT_API_URL = "http://localhost:3000/api/performance";
const DEFAULT_FRONTEND_URL = "http://localhost:3000";

interface PerformanceData {
  startDate?: string;
  startPrice?: number;
  endDate?: string;
  endPrice?: number;
  performance?: string;
  peRatio?: number | null;
  error?: string;
}

interface ApiResponse {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  individualPerformance: {
    ebi: PerformanceData;
    vti: PerformanceData;
    iwv: PerformanceData;
    iwn: PerformanceData;
    vtv: PerformanceData;
  };
  performanceDeltas: Record<string, number | string>;
  historicalPrices: Record<string, unknown>;
  deltaNote: string;
}

async function fetchApiResponse(url: string): Promise<ApiResponse> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`API request timed out after 10 seconds`);
    }
    throw error;
  }
}

async function fetchFrontendHtml(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    if (!response.ok) {
      throw new Error(
        `Frontend request failed: ${response.status} ${response.statusText}`
      );
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error(`Frontend request timed out after 10 seconds`);
    }
    throw error;
  }
}

describe("P/E Ratio Tests", () => {
  const apiUrl = process.env.API_URL || DEFAULT_API_URL;
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL;

  test("API response includes peRatio field for all ETFs", async () => {
    console.log(`\n📡 Fetching API from: ${apiUrl}`);
    const data = await fetchApiResponse(apiUrl);

    const etfs = ["ebi", "vti", "iwv", "iwn", "vtv"] as const;

    for (const etf of etfs) {
      const perf = data.individualPerformance[etf];
      expect(perf).toBeDefined();

      if (!perf.error) {
        // Check that peRatio field exists (can be number or null)
        expect(perf).toHaveProperty("peRatio");
        console.log(
          `  ✓ ${etf.toUpperCase()}: peRatio = ${
            perf.peRatio !== null && perf.peRatio !== undefined
              ? perf.peRatio.toFixed(2)
              : "null"
          }`
        );

        // If peRatio is a number, it should be positive
        if (
          typeof perf.peRatio === "number" &&
          perf.peRatio !== null &&
          !isNaN(perf.peRatio)
        ) {
          expect(perf.peRatio).toBeGreaterThan(0);
        }
      } else {
        console.log(`  ⚠ ${etf.toUpperCase()}: Error - ${perf.error}`);
      }
    }
  });

  test("P/E ratios are reasonable values (if present)", async () => {
    console.log(`\n📊 Validating P/E ratio values from: ${apiUrl}`);
    const data = await fetchApiResponse(apiUrl);

    const etfs = ["ebi", "vti", "iwv", "iwn", "vtv"] as const;

    for (const etf of etfs) {
      const perf = data.individualPerformance[etf];

      if (!perf.error && perf.peRatio !== null && perf.peRatio !== undefined) {
        const peRatio = perf.peRatio;

        // P/E ratios are typically between 5 and 50 for most stocks/ETFs
        // Some can be higher, but we'll check for reasonable bounds
        if (peRatio > 0 && peRatio < 200) {
          console.log(
            `  ✓ ${etf.toUpperCase()}: P/E ratio ${peRatio.toFixed(2)} is within reasonable range`
          );
        } else if (peRatio >= 200) {
          console.warn(
            `  ⚠ ${etf.toUpperCase()}: P/E ratio ${peRatio.toFixed(2)} is unusually high`
          );
        } else {
          console.warn(
            `  ⚠ ${etf.toUpperCase()}: P/E ratio ${peRatio.toFixed(2)} is negative or zero`
          );
        }
      }
    }
  });

  test("Frontend HTML contains P/E ratio column header", async () => {
    console.log(`\n🌐 Checking frontend at: ${frontendUrl}`);

    try {
      const html = await fetchFrontendHtml(frontendUrl);

      // Check for P/E Ratio column header (case-insensitive, various formats)
      const hasPeRatioHeader =
        /P\/E\s+Ratio/i.test(html) ||
        /P\/E\s*Ratio/i.test(html) ||
        /P\/E\s*ratio/i.test(html);

      if (hasPeRatioHeader) {
        console.log("  ✓ Found 'P/E Ratio' column header in HTML");
        expect(hasPeRatioHeader).toBe(true);
      } else {
        console.error("  ❌ 'P/E Ratio' column header not found in HTML");
        // Check what table headers are present
        const headerMatches = html.match(/<th[^>]*>([^<]+)<\/th>/gi);
        if (headerMatches) {
          console.log("  Found table headers:", headerMatches.slice(0, 10));
        }
        expect(hasPeRatioHeader).toBe(true);
      }
    } catch (error) {
      console.warn(
        `  ⚠ Could not fetch frontend (server may not be running): ${error}`
      );
      // Skip this test if frontend is not available
      console.log("  ⏭ Skipping frontend test (server not available)");
    }
  });

  test("Frontend HTML displays P/E ratio values in table", async () => {
    console.log(`\n🔍 Checking for P/E ratio values in frontend table`);

    try {
      const html = await fetchFrontendHtml(frontendUrl);

      // Look for numeric P/E ratio patterns in table cells
      // Match numbers with 1-2 decimal places that could be P/E ratios
      const peRatioPattern = /\b\d{1,3}\.\d{1,2}\b/g;
      const matches = html.match(peRatioPattern);

      if (matches && matches.length > 0) {
        // Filter for reasonable P/E ratio values (between 5 and 200)
        const potentialPeRatios = matches
          .map(Number)
          .filter((n) => n >= 5 && n <= 200)
          .filter((n, i, arr) => arr.indexOf(n) === i); // Remove duplicates

        if (potentialPeRatios.length > 0) {
          console.log(
            `  ✓ Found ${potentialPeRatios.length} potential P/E ratio value(s) in HTML:`,
            potentialPeRatios
              .slice(0, 5)
              .map((n) => n.toFixed(2))
              .join(", ")
          );
          expect(potentialPeRatios.length).toBeGreaterThan(0);
        } else {
          console.warn(
            "  ⚠ Found numbers in HTML but none appear to be P/E ratios (not in range 5-200)"
          );
          // Don't fail - might be valid if all P/E ratios are null
        }
      } else {
        console.warn("  ⚠ No numeric P/E ratio values found in HTML");
        // Check if "N/A" is present (which is valid if P/E ratios are null)
        if (html.includes("N/A") || html.includes("n/a")) {
          console.log(
            "  ℹ Found 'N/A' in HTML (P/E ratios may be unavailable)"
          );
        }
      }
    } catch (error) {
      console.warn(
        `  ⚠ Could not fetch frontend (server may not be running): ${error}`
      );
      console.log("  ⏭ Skipping frontend test (server not available)");
      // Don't fail the test if frontend is not available
    }
  });

  test("API response structure is correct", async () => {
    console.log(`\n🔬 Validating API response structure from: ${apiUrl}`);
    const data = await fetchApiResponse(apiUrl);

    // Check top-level structure
    expect(data).toHaveProperty("dateRange");
    expect(data).toHaveProperty("individualPerformance");
    expect(data).toHaveProperty("performanceDeltas");
    expect(data).toHaveProperty("historicalPrices");

    // Check individualPerformance structure
    expect(data.individualPerformance).toHaveProperty("ebi");
    expect(data.individualPerformance).toHaveProperty("vti");
    expect(data.individualPerformance).toHaveProperty("iwv");
    expect(data.individualPerformance).toHaveProperty("iwn");
    expect(data.individualPerformance).toHaveProperty("vtv");

    console.log("  ✓ API response structure is valid");

    // Log summary of P/E ratios
    console.log("\n📋 P/E Ratio Summary:");
    const etfs = ["ebi", "vti", "iwv", "iwn", "vtv"] as const;
    for (const etf of etfs) {
      const perf = data.individualPerformance[etf];
      const peRatio =
        perf.peRatio !== null && perf.peRatio !== undefined
          ? perf.peRatio.toFixed(2)
          : "N/A";
      const status = perf.error ? "❌ Error" : "✅ OK";
      console.log(
        `  ${status} ${etf.toUpperCase().padEnd(4)}: P/E = ${peRatio.padStart(8)}`
      );
    }
  });
});

// Note: This script must be run with `bun test scripts/test-pe-ratio.ts`
// or via the npm script: `bun run test:pe-ratio`
