import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

import { downloadHoldingsPdf } from "../../../scripts/download-holdings-pdf";
import { parsePdfToJson } from "../../../src/holdings/parse-pdf";
import { fetchAndStoreManyEtfHoldings } from "../../../src/holdings/fetch";
import { openHoldingsDb } from "../../../src/lib/db";
import { runApproximation } from "../../../src/approximation/optimize";

/**
 * Determines the base directory based on environment.
 * - Serverless (Vercel): Uses /tmp (only writable location)
 * - Local development: Uses data/ directory (existing behavior)
 */
function getBaseDir(): string {
  // Check if running in Vercel serverless environment
  const isServerless = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
  return isServerless
    ? "/tmp"
    : path.resolve(process.cwd(), "data");
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const testMode = url.searchParams.get("test") === "true" || url.searchParams.get("mode") === "test";
    
    const baseDir = getBaseDir();
    const target = "EBI";
    const baselines = ["VTI", "VTV", "IWN"];

    console.log("🔄 Starting sync process");
    console.log(`Mode: ${testMode ? "TEST (approximation only)" : "FULL"}`);
    console.log(`Environment: ${process.env.VERCEL ? "serverless" : "local"}`);
    console.log(`Base directory: ${baseDir}`);
    console.log(`Target: ${target}`);
    console.log(`Baseline: ${baselines.join(",")}`);

    // Open database connection once for all operations
    const db = await openHoldingsDb();
    try {
      if (!testMode) {
        // Step 1: Download PDF
        console.log("Step 1/4: Downloading PDF...");
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, "-")
          .slice(0, -5);
        const pdfFilename = `ebi-holdings-${timestamp}.pdf`;
        const pdfPath = path.join(baseDir, pdfFilename);
        
        const downloadedPdfPath = await downloadHoldingsPdf(pdfPath);
        console.log(`✅ Downloaded: ${downloadedPdfPath}`);

        // Step 2: Parse PDF and store in database
        console.log("");
        console.log("Step 2/4: Parsing PDF and storing in database...");
        const ebiJsonPath = path.join(baseDir, "ebi_holdings.json");
        ensureParentDir(ebiJsonPath);

        await parsePdfToJson(downloadedPdfPath, ebiJsonPath, {
          analyze: false, // Skip analysis in serverless
          db,
        });
        console.log("✅ PDF parsed and stored in database");

        // Step 3: Fetch baseline ETF holdings
        console.log("");
        console.log("Step 3/4: Fetching baseline ETF holdings...");
        const { outputs } = await fetchAndStoreManyEtfHoldings(baselines, {
          outDir: baseDir,
          db,
        });
        for (const o of outputs) {
          console.log(`✅ ${o.symbol} → ${o.jsonPath}`);
        }
      } else {
        console.log("⏭️  TEST MODE: Skipping PDF download and baseline fetch");
        console.log("   Using existing data in database");
      }

      // Step 4: Run approximation
      console.log("");
      console.log(`Step ${testMode ? "1" : "4"}/${testMode ? "1" : "4"}: Running portfolio approximation...`);
      const results = await runApproximation(db, target, baselines, {
        weightField: "actual_weight",
      });

      console.log("");
      console.log(`✅ ${testMode ? "Test" : "Sync"} complete!`);
      console.log(`📊 Optimization metrics:`, {
        improvementPercent: results.optimizationMetrics.improvementPercent.toFixed(2) + "%",
        averageError: results.optimizationMetrics.averageError.toFixed(6),
        maxError: results.optimizationMetrics.maxError.toFixed(6),
      });

      return NextResponse.json({
        success: true,
        message: testMode 
          ? "Test mode: Approximation completed successfully (skipped download/fetch)"
          : "Sync completed successfully",
        testMode,
        timestamp: results.timestamp,
        targetEtf: results.targetEtf,
        baselineEtfs: results.baselineEtfs,
        optimalWeights: results.weightsPercentages,
        optimizationMetrics: {
          improvementPercent: results.optimizationMetrics.improvementPercent,
          averageError: results.optimizationMetrics.averageError,
          maxError: results.optimizationMetrics.maxError,
          errorCount: results.optimizationMetrics.errorCount,
          totalStocks: results.optimizationMetrics.totalStocks,
        },
        constraints: results.constraints,
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error("❌ Sync error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
