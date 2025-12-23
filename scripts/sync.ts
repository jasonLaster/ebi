import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { parsePdfToJson } from "../src/holdings/parse-pdf";
import { fetchAndStoreManyEtfHoldings } from "../src/holdings/fetch";
import { openHoldingsDb } from "../src/lib/db";
import { runApproximation } from "../src/approximation/optimize";
import { downloadHoldingsPdf } from "./download-holdings-pdf";

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
    .name("sync")
    .description(
      "Sync EBI holdings from PDF + fetch baseline holdings + run approximation"
    )
    .argument(
      "[pdf]",
      "Path to EBI holdings PDF (if not provided, downloads latest)"
    )
    .option("-o, --out-dir <dir>", "Output directory", "data")
    .option("--target <symbol>", "Target ETF symbol", "EBI")
    .option(
      "--baseline <symbols>",
      "Comma-separated baseline ETF symbols",
      "VTI,VTV,IWN"
    )
    .option(
      "--results <path>",
      "Approximation results JSON path",
      "data/portfolio_approximation_results.json"
    )
    .option("--api-key <key>", "Override FMP_API_KEY env var")
    .option("--no-analyze", "Skip PDF holdings analysis output")
    .option(
      "--download",
      "Force download latest PDF (ignores provided PDF path)"
    )
    .option(
      "--no-download",
      "Skip download, use existing PDF (requires PDF path)"
    )
    .parse(process.argv);

  const opts = program.opts<{
    outDir: string;
    target: string;
    baseline: string;
    results: string;
    apiKey?: string;
    analyze: boolean;
    download?: boolean;
    noDownload?: boolean;
  }>();

  const [pdfArg] = program.args as [string?];

  // Determine if we should download the PDF
  const shouldDownload = opts.download || (!pdfArg && !opts.noDownload);

  let pdfPath: string;

  if (shouldDownload) {
    // Download the latest PDF
    console.log("📥 Downloading latest PDF from Longview Research Partners...");
    pdfPath = await downloadHoldingsPdf();
    console.log(`✅ Downloaded: ${pdfPath}\n`);
  } else {
    // Use provided PDF or default
    pdfPath = resolvePath(pdfArg ?? "data/holdings.pdf");
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }
  }
  const outDir = resolvePath(opts.outDir);
  const resultsPath = resolvePath(opts.results);
  const target = opts.target.toUpperCase();
  const baselines = opts.baseline
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.toUpperCase());

  if (baselines.length === 0) {
    throw new Error("--baseline must include at least one symbol");
  }

  console.log("🔄 Syncing holdings + approximation");
  console.log("==================================");
  console.log(`PDF:      ${pdfPath}`);
  console.log(`Out dir:  ${outDir}`);
  console.log(`Target:   ${target}`);
  console.log(`Baseline: ${baselines.join(",")}`);
  console.log("");

  // Open database connection once for all operations
  const db = await openHoldingsDb();
  try {
    // Step 1: Parse EBI PDF -> JSON + Turso
    const ebiJsonPath = path.join(outDir, "ebi_holdings.json");
    console.log(`Step 1/3: Parsing PDF → ${ebiJsonPath} (+Turso)`);
    await parsePdfToJson(pdfPath, ebiJsonPath, {
      analyze: opts.analyze !== false,
      db,
    });

    // Step 2: Fetch baseline ETF holdings -> JSON + Turso
    console.log("");
    console.log(
      `Step 2/3: Fetching baseline holdings → ${outDir}/*_holdings.json (+Turso)`
    );
    const { outputs } = await fetchAndStoreManyEtfHoldings(baselines, {
      outDir,
      db,
      apiKey: opts.apiKey,
    });
    for (const o of outputs) console.log(`✅ ${o.symbol} → ${o.jsonPath}`);

    // Step 3: Run approximation from DB -> results JSON
    console.log("");
    console.log(`Step 3/3: Running approximation → ${resultsPath}`);
    ensureParentDir(resultsPath);

    const res = await runApproximation(db, target, baselines, {
      weightField: "actual_weight",
    });
    fs.writeFileSync(resultsPath, JSON.stringify(res, null, 2));
  } finally {
    db.close();
  }

  console.log("");
  console.log("✅ Sync complete!");
  console.log(`📊 Results: ${resultsPath}`);
  console.log("🌐 Dashboard: http://localhost:3000");
  console.log("   Run: bun run dev");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
