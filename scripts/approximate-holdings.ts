import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { openHoldingsDb } from "@/src/lib/db";
import { runApproximation } from "@/src/approximation/optimize";

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("approximate-holdings")
    .description(
      "Approximate an ETF's holdings using baseline ETFs, using weights from Turso SQLite holdings DB"
    )
    .option("--target <symbol>", "Target ETF to approximate", "EBI")
    .option(
      "--baseline <symbols>",
      "Comma-separated baseline ETF symbols",
      "VTI,VTV,IWN"
    )
    .option(
      "--weight-field <field>",
      "Which DB weight field to use: weight or actual_weight",
      "actual_weight"
    )
    .option(
      "--out <path>",
      "Output JSON path",
      "data/portfolio_approximation_results.json"
    )
    .option("--max-iterations <n>", "Max optimization iterations", "5000")
    .parse(process.argv);

  const opts = program.opts<{
    target: string;
    baseline: string;
    weightField: string;
    out: string;
    maxIterations: string;
  }>();

  const outPath = resolvePath(opts.out);
  const target = opts.target.toUpperCase();
  const baselineEtfs = opts.baseline
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase());

  const weightField =
    opts.weightField === "weight" ? "weight" : ("actual_weight" as const);
  const maxIterations = Number(opts.maxIterations);

  const db = await openHoldingsDb();
  try {
    const results = await runApproximation(db, target, baselineEtfs, {
      weightField,
      maxIterations: Number.isFinite(maxIterations) ? maxIterations : 5000,
    });

    ensureParentDir(outPath);
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));

    console.log("\n=== PORTFOLIO APPROXIMATION RESULTS ===");
    console.log(`Target: ${results.targetEtf}`);
    console.log(`Baselines: ${results.baselineEtfs.join(", ")}`);
    console.log("Optimal weights:");
    for (const sym of results.baselineEtfs) {
      const key = sym.toLowerCase();
      console.log(
        `  ${sym}: ${(results.optimalWeights[key] * 100).toFixed(2)}%`
      );
    }
    console.log(`Total: ${(results.constraints.weightsSum * 100).toFixed(2)}%`);
    console.log(
      `\nOptimization error (sum of squared differences): ${results.optimizationMetrics.finalObjectiveValue.toFixed(
        6
      )}`
    );
    console.log(
      `Improvement from initial guess: ${results.optimizationMetrics.improvementPercent.toFixed(
        2
      )}%`
    );
    console.log(`\nResults saved to: ${outPath}`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
