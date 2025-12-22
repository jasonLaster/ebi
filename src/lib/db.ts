import { createClient, Client } from "@libsql/client";
import { HoldingsData, Holding } from "./types";

export type HoldingsDb = Client;

export async function openHoldingsDb(): Promise<HoldingsDb> {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    throw new Error("TURSO_DATABASE_URL environment variable is not set");
  }
  if (!authToken) {
    throw new Error("TURSO_AUTH_TOKEN environment variable is not set");
  }

  const client = createClient({ url, authToken });
  await ensureSchema(client);
  return client;
}

export async function ensureSchema(db: HoldingsDb): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS etfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      last_updated TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etf_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      name TEXT NOT NULL,
      weight REAL NOT NULL,
      market_value REAL NOT NULL,
      actual_weight REAL NOT NULL,
      price REAL,
      shares REAL NOT NULL,
      UNIQUE(etf_id, ticker),
      FOREIGN KEY(etf_id) REFERENCES etfs(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS performance_cache (
      cache_key TEXT PRIMARY KEY,
      asof_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_performance_cache_asof_date
      ON performance_cache(asof_date)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_holdings_etf_id ON holdings(etf_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker)
  `);
}

export async function upsertEtf(
  db: HoldingsDb,
  symbol: string,
  lastUpdated: string
): Promise<number> {
  const upper = symbol.toUpperCase();
  await db.execute({
    sql: `
      INSERT INTO etfs(symbol, last_updated)
      VALUES (?, ?)
      ON CONFLICT(symbol) DO UPDATE SET last_updated = excluded.last_updated
    `,
    args: [upper, lastUpdated],
  });

  const result = await db.execute({
    sql: `SELECT id FROM etfs WHERE symbol = ?`,
    args: [upper],
  });

  if (result.rows.length === 0) {
    throw new Error(`Failed to upsert ETF row for ${upper}`);
  }
  const id = result.rows[0].id;
  if (typeof id !== "number") {
    throw new Error(`Failed to upsert ETF row for ${upper}: invalid id`);
  }
  return id;
}

export async function upsertHoldingsForEtf(
  db: HoldingsDb,
  etfId: number,
  holdings: Record<string, Holding>
): Promise<void> {
  const statements = Object.entries(holdings).map(([ticker, h]) => ({
    sql: `
      INSERT INTO holdings(
        etf_id, ticker, name, weight, market_value, actual_weight, price, shares
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(etf_id, ticker) DO UPDATE SET
        name = excluded.name,
        weight = excluded.weight,
        market_value = excluded.market_value,
        actual_weight = excluded.actual_weight,
        price = excluded.price,
        shares = excluded.shares
    `,
    args: [
      etfId,
      ticker,
      h.name,
      h.weight,
      h.market_value,
      h.actual_weight,
      h.price ?? null,
      h.shares,
    ],
  }));

  await db.batch(statements, "write");
}

export async function storeHoldingsData(
  db: HoldingsDb,
  data: HoldingsData
): Promise<void> {
  const etfId = await upsertEtf(db, data.etfSymbol, data.lastUpdated);
  await upsertHoldingsForEtf(db, etfId, data.holdings);
}

export async function getHoldingsWeightMap(
  db: HoldingsDb,
  etfSymbol: string,
  opts?: { weightField?: "weight" | "actual_weight" }
): Promise<Map<string, number>> {
  const symbol = etfSymbol.toUpperCase();
  const weightField = opts?.weightField ?? "actual_weight";
  if (weightField !== "weight" && weightField !== "actual_weight") {
    throw new Error(`Unsupported weightField: ${String(weightField)}`);
  }

  const result = await db.execute({
    sql: `
      SELECT h.ticker as ticker, h.${weightField} as weight
      FROM holdings h
      JOIN etfs e ON e.id = h.etf_id
      WHERE e.symbol = ?
    `,
    args: [symbol],
  });

  const map = new Map<string, number>();
  for (const row of result.rows) {
    const ticker = (row.ticker ?? "").toString().trim();
    if (!ticker) continue;
    const weight =
      typeof row.weight === "number" ? row.weight : Number(row.weight);
    map.set(ticker, Number.isFinite(weight) ? weight : 0);
  }
  return map;
}

export async function getAllUniqueSymbols(db: HoldingsDb): Promise<Set<string>> {
  const result = await db.execute({
    sql: `
      SELECT DISTINCT ticker
      FROM holdings
      WHERE ticker IS NOT NULL AND ticker != ''
      ORDER BY ticker
    `,
  });

  const s = new Set<string>();
  for (const row of result.rows) {
    const ticker = (row.ticker ?? "").toString().trim();
    if (ticker) s.add(ticker);
  }
  return s;
}
