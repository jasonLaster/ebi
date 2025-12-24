import { NextResponse } from "next/server";
import { openHoldingsDb } from "@/src/lib/db";
import { runApproximation } from "@/src/approximation/optimize";

export const maxDuration = 300; // seconds (Vercel will cap based on your plan)

async function getApproximationResults() {
  const target = "EBI";
  const baselines = ["VTI", "VTV", "IWN"];

  console.log(
    `Running portfolio approximation for ${target} using ${baselines.join(", ")}`
  );

  const db = await openHoldingsDb();
  try {
    const results = await runApproximation(db, target, baselines, {
      weightField: "actual_weight",
    });

    // Add additional analysis
    const enhancedResults = {
      ...results,
      analysis: {
        // Calculate tracking error
        trackingError: Math.sqrt(
          results.optimizationMetrics.finalObjectiveValue
        ),
        // Calculate error rate
        errorRate:
          (results.optimizationMetrics.errorCount /
            results.optimizationMetrics.totalStocks) *
          100,
        // Add confidence metrics
        confidence:
          results.optimizationMetrics.improvementPercent > 5
            ? "High"
            : results.optimizationMetrics.improvementPercent > 2
              ? "Medium"
              : "Low",
      },
    };

    return enhancedResults;
  } finally {
    db.close();
  }
}

export async function GET() {
  try {
    const results = await getApproximationResults();
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error running portfolio approximation:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: "Failed to run portfolio approximation", details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // POST does the same thing as GET - runs approximation and returns results
    const results = await getApproximationResults();
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error running portfolio approximation:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: "Failed to run portfolio approximation", details: errorMessage },
      { status: 500 }
    );
  }
}
