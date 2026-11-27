import { NextResponse } from "next/server";
import { metric } from "@vercel/functions";
import * as path from "path";

import {
  fetchEbiHoldingsWithFallback,
  EBI_FUND_DATA_URL,
} from "@/src/holdings/fetch-ebi";
import { fetchAndStoreManyEtfHoldings } from "@/src/holdings/fetch";
import { openHoldingsDb, storeHoldingsData } from "@/src/lib/db";
import { runApproximation } from "@/src/approximation/optimize";
import { notifyIssue } from "@/src/lib/notify";
import { measure } from "@/src/lib/trace";

export const maxDuration = 300; // seconds

/** Alert (without failing) if the published holdings are older than this. */
const STALE_AFTER_DAYS = 5;

/**
 * Serverless (Vercel) can only write to /tmp; locally keep using data/.
 */
function getBaseDir(): string {
  const isServerless = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
  return isServerless ? "/tmp" : path.resolve(process.cwd(), "data");
}

/**
 * Full syncs write to the shared database, so when CRON_SECRET is configured
 * they require Vercel Cron's `Authorization: Bearer <CRON_SECRET>` header.
 * Test mode is read-only and stays public for post-deploy smoke tests.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function daysSince(isoDate: string): number {
  return (Date.now() - new Date(`${isoDate}T00:00:00Z`).getTime()) / 86_400_000;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const testMode =
    url.searchParams.get("test") === "true" ||
    url.searchParams.get("mode") === "test";

  if (!testMode && !isAuthorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const target = "EBI";
  const baselines = ["VTI", "VTV", "IWN"];
  let step = "init";
  const startedAt = Date.now();
  const mode = testMode ? "test" : "full";

  try {
    console.log(
      `🔄 Starting sync (${testMode ? "TEST: approximation only" : "FULL"}) target=${target} baselines=${baselines.join(",")}`
    );

    step = "open-db";
    const db = await openHoldingsDb();
    try {
      let ebiAsOfDate: string | null = null;
      let ebiHoldingsCount: number | undefined;
      let ebiSource: string | undefined;

      if (!testMode) {
        step = "fetch-ebi-holdings";
        const ebi = await measure("sync.fetch-ebi-holdings", {}, () =>
          fetchEbiHoldingsWithFallback()
        );
        ebiAsOfDate = ebi.asOfDate;
        ebiHoldingsCount = Object.keys(ebi.holdings).length;
        ebiSource = ebi.source;
        console.log(
          `✅ Fetched ${ebiHoldingsCount} EBI holdings from ${ebi.source} (as of ${ebiAsOfDate ?? "unknown"})`
        );
        if (ebi.primaryError) {
          await notifyIssue({
            subject: "EBI holdings: FMP failed, used Longview page fallback",
            error: ebi.primaryError,
            context: { fallback: EBI_FUND_DATA_URL },
          });
        }

        step = "store-ebi-holdings";
        await measure(
          "sync.store-holdings",
          { "etf.symbol": "EBI", "holdings.count": ebiHoldingsCount },
          () => storeHoldingsData(db, ebi)
        );

        step = "fetch-baseline-holdings";
        const { outputs } = await measure(
          "sync.fetch-baseline-holdings",
          { "etf.symbols": baselines.join(",") },
          () =>
            fetchAndStoreManyEtfHoldings(baselines, {
              outDir: getBaseDir(),
              db,
            })
        );
        for (const o of outputs) console.log(`✅ ${o.symbol} → ${o.jsonPath}`);

        if (!ebiAsOfDate || daysSince(ebiAsOfDate) > STALE_AFTER_DAYS) {
          await notifyIssue({
            subject: "EBI holdings look stale",
            context: {
              asOfDate: ebiAsOfDate ?? "unknown",
              source: ebiSource,
              staleAfterDays: STALE_AFTER_DAYS,
            },
          });
        }
      }

      step = "approximation";
      const results = await measure(
        "sync.approximation",
        { "etf.target": target, "etf.baselines": baselines.join(",") },
        () =>
          runApproximation(db, target, baselines, {
            weightField: "actual_weight",
          })
      );

      metric("sync.run", 1, { mode, outcome: "success" });
      metric("sync.duration_ms", Date.now() - startedAt, { mode });
      if (ebiHoldingsCount !== undefined) {
        metric("sync.ebi_holdings", ebiHoldingsCount, {
          source: ebiSource ?? "unknown",
        });
      }

      console.log(`✅ ${testMode ? "Test" : "Sync"} complete`, {
        improvementPercent:
          results.optimizationMetrics.improvementPercent.toFixed(2) + "%",
        averageError: results.optimizationMetrics.averageError.toFixed(6),
        maxError: results.optimizationMetrics.maxError.toFixed(6),
      });

      return NextResponse.json({
        success: true,
        message: testMode
          ? "Test mode: Approximation completed successfully (skipped download/fetch)"
          : "Sync completed successfully",
        testMode,
        ebiAsOfDate,
        ebiHoldingsCount,
        ebiSource,
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
    console.error(`❌ Sync failed at step "${step}":`, error);
    metric("sync.run", 1, { mode, outcome: "failure", step });
    await notifyIssue({
      subject: `Sync failed at step "${step}"`,
      error,
      context: { mode, step },
    });
    return NextResponse.json(
      {
        success: false,
        step,
        error: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
