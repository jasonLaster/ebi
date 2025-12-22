import "dotenv/config";
import * as path from "path";
import { Command } from "commander";
import { BASELINE_ETFS, fetchAndStoreManyEtfHoldings } from "../src/holdings/fetch";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("fetch-holdings")
    .description("Fetch ETF holdings (VTI/VTV/IWN) from Financial Modeling Prep")
    .argument("[symbols...]", "ETF symbols to fetch (e.g. VTI VTV IWN)")
    .option("--all", "Fetch baseline ETFs (VTI, VTV, IWN)")
    .option("-o, --out-dir <dir>", "Output directory for JSON files", "data")
    .option(
      "--sqlite <path>",
      "SQLite database path (set empty to disable)",
      "data/holdings.db"
    )
    .option("--api-key <key>", "Override FMP_API_KEY env var")
    .action(async (symbols: string[], options) => {
      const picked = new Set<string>();
      if (options.all) BASELINE_ETFS.forEach((s) => picked.add(s));
      (symbols ?? []).forEach((s) => picked.add(s.toUpperCase()));

      if (picked.size === 0) {
        program.help({ error: true });
      }

      const outDir = path.isAbsolute(options.outDir)
        ? options.outDir
        : path.resolve(process.cwd(), options.outDir);

      const sqlitePath =
        typeof options.sqlite === "string" && options.sqlite.length > 0
          ? options.sqlite
          : undefined;

      const { outputs } = await fetchAndStoreManyEtfHoldings([...picked], {
        outDir,
        sqlitePath,
        apiKey: options.apiKey,
      });

      for (const o of outputs) {
        console.log(`✅ ${o.symbol} → ${o.jsonPath}`);
      }
      if (sqlitePath) console.log(`🗄️ SQLite → ${path.resolve(process.cwd(), sqlitePath)}`);
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

