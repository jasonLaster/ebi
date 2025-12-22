import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

export async function GET() {
  try {
    const resultsPath = path.join(
      process.cwd(),
      "data/portfolio_approximation_results.json"
    );

    if (!fs.existsSync(resultsPath)) {
      return NextResponse.json(
        {
          error:
            "Portfolio approximation results not found. Run the approximation script first.",
        },
        { status: 404 }
      );
    }

    const fileContent = await fs.promises.readFile(resultsPath, "utf8");
    const results = JSON.parse(fileContent);

    // Add additional analysis
    const enhancedResults = {
      ...results,
      analysis: {
        ...results.optimizationMetrics,
        // Calculate tracking error
        trackingError: Math.sqrt(
          results.optimizationMetrics.finalObjectiveValue
        ),
        // Calculate information ratio (if we had benchmark returns)
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

    return NextResponse.json(enhancedResults);
  } catch (error) {
    console.error("Error reading portfolio approximation results:", error);
    return NextResponse.json(
      { error: "Failed to load portfolio approximation results" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Trigger a new optimization run
    const execFileAsync = promisify(execFile);

    console.log("Running portfolio approximation optimization...");
    const { stdout, stderr } = await execFileAsync("bun", [
      path.join(process.cwd(), "scripts/approximate-holdings.ts"),
    ]);

    if (stderr) {
      console.error("Optimization stderr:", stderr);
    }

    console.log("Optimization stdout:", stdout);

    // Return the updated results
    return await GET();
  } catch (error) {
    console.error("Error running portfolio approximation:", error);
    return NextResponse.json(
      { error: "Failed to run portfolio approximation" },
      { status: 500 }
    );
  }
}
