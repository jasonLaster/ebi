#!/usr/bin/env bun
import { Database } from "bun:sqlite";
import { Command } from "commander";
import * as path from "path";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("sql")
    .description("Run arbitrary SQL queries against the SQLite database")
    .option("--db <path>", "Path to SQLite db", "data/holdings.db")
    .option("--json", "Output as JSON", false)
    .option("--readonly", "Open database in readonly mode", true)
    .argument("[query]", "SQL query to execute (or pipe via stdin)")
    .parse(process.argv);

  const opts = program.opts<{ db: string; json: boolean; readonly: boolean }>();
  const [argQuery] = program.args;

  // Get query from argument or stdin
  let query = argQuery;
  if (!query) {
    const stdin = await Bun.stdin.text();
    query = stdin.trim();
  }

  if (!query) {
    console.error("Error: No SQL query provided. Pass as argument or pipe via stdin.");
    process.exit(1);
  }

  const dbPath = path.isAbsolute(opts.db)
    ? opts.db
    : path.resolve(process.cwd(), opts.db);

  const db = new Database(dbPath, { readonly: opts.readonly });

  try {
    // Check if it's a SELECT/read query
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(query);

    if (isSelect) {
      const rows = db.query(query).all();

      if (opts.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }

      if (rows.length === 0) {
        console.log("(no rows)");
        return;
      }

      // Pretty print as table
      const columns = Object.keys(rows[0] as Record<string, unknown>);
      const widths = columns.map((col) => {
        const values = rows.map((r) => String((r as Record<string, unknown>)[col] ?? ""));
        return Math.max(col.length, ...values.map((v) => v.length));
      });

      // Header
      const header = columns.map((c, i) => c.padEnd(widths[i])).join("  ");
      const separator = widths.map((w) => "-".repeat(w)).join("  ");
      console.log(header);
      console.log(separator);

      // Rows
      for (const row of rows) {
        const line = columns
          .map((c, i) => String((row as Record<string, unknown>)[c] ?? "").padEnd(widths[i]))
          .join("  ");
        console.log(line);
      }

      console.log(`\n(${rows.length} row${rows.length === 1 ? "" : "s"})`);
    } else {
      // For write operations, need to open without readonly
      if (opts.readonly) {
        console.error("Error: Write operations require --no-readonly flag");
        process.exit(1);
      }
      const result = db.run(query);
      console.log(`Changes: ${result.changes}`);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
