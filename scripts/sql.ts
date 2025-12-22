#!/usr/bin/env bun
import "dotenv/config";
import { createClient } from "@libsql/client";
import { Command } from "commander";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("sql")
    .description("Run arbitrary SQL queries against the Turso SQLite database")
    .option("--json", "Output as JSON", false)
    .argument("[query]", "SQL query to execute (or pipe via stdin)")
    .parse(process.argv);

  const opts = program.opts<{ json: boolean }>();
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

  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.error("Error: TURSO_DATABASE_URL environment variable is not set");
    process.exit(1);
  }
  if (!authToken) {
    console.error("Error: TURSO_AUTH_TOKEN environment variable is not set");
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  try {
    // Check if it's a SELECT/read query
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN|WITH)\b/i.test(query);

    if (isSelect) {
      const result = await client.execute({ sql: query });
      const rows = result.rows;

      if (opts.json) {
        // Convert rows to plain objects
        const plainRows = rows.map((row) => {
          const obj: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(row)) {
            obj[key] = value;
          }
          return obj;
        });
        console.log(JSON.stringify(plainRows, null, 2));
        return;
      }

      if (rows.length === 0) {
        console.log("(no rows)");
        return;
      }

      // Pretty print as table
      const firstRow = rows[0];
      const columns = Object.keys(firstRow);
      const widths = columns.map((col) => {
        const values = rows.map((r) => String(r[col] ?? ""));
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
          .map((c, i) => String(row[c] ?? "").padEnd(widths[i]))
          .join("  ");
        console.log(line);
      }

      console.log(`\n(${rows.length} row${rows.length === 1 ? "" : "s"})`);
    } else {
      const result = await client.execute({ sql: query });
      console.log(`Changes: ${result.rowsAffected ?? 0}`);
    }
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
