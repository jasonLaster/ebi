import { Database } from "bun:sqlite";
import { Command } from "commander";
import * as path from "path";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("db-holdings-count")
    .description("Print number of holdings per ETF in SQLite db")
    .option("--db <path>", "Path to SQLite db", "data/holdings.db")
    .option("--json", "Output JSON instead of table", false)
    .parse(process.argv);

  const opts = program.opts<{ db: string; json: boolean }>();
  const dbPath = path.isAbsolute(opts.db)
    ? opts.db
    : path.resolve(process.cwd(), opts.db);

  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .query(
        `
        SELECT
          e.symbol as etf,
          COUNT(*) as holdings_count
        FROM holdings h
        JOIN etfs e ON e.id = h.etf_id
        GROUP BY e.symbol
        ORDER BY e.symbol
      `
      )
      .all() as { etf: string; holdings_count: number }[];

    if (opts.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    // simple aligned output
    const maxSym = Math.max(...rows.map((r) => r.etf.length), "ETF".length);
    const header = `${"ETF".padEnd(maxSym)}  holdings`;
    console.log(header);
    console.log(`${"-".repeat(maxSym)}  --------`);
    for (const r of rows) {
      console.log(`${r.etf.padEnd(maxSym)}  ${String(r.holdings_count)}`);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

