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
  // Check if we need to migrate from old schema (without date column)
  const tableInfo = await db.execute(
    `PRAGMA table_info(etfs)`
  );
  const hasDateColumn = tableInfo.rows.some(
    (row) => row.name === "date"
  );

  if (!hasDateColumn) {
    // Check if the etfs table exists
    const tableExists = await db.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='etfs'`
    );

    if (tableExists.rows.length > 0) {
      // Migration: Add date column and update existing rows
      // 1. Add date column with a default value
      await db.execute(`
        ALTER TABLE etfs ADD COLUMN date TEXT
      `);

      // 2. Backfill date from last_updated (extract YYYY-MM-DD)
      await db.execute(`
        UPDATE etfs SET date = substr(last_updated, 1, 10) WHERE date IS NULL
      `);

      // 3. Drop old unique constraint and create new one
      // SQLite doesn't support dropping constraints directly, so we need to recreate the table
      // However, since we're adding a new composite unique, we'll create a new unique index instead
      // First, drop the old unique index if it exists (SQLite auto-creates one for UNIQUE constraint)
      try {
        await db.execute(`DROP INDEX IF EXISTS sqlite_autoindex_etfs_1`);
      } catch {
        // Index may not exist or have a different name, ignore
      }

      // Create the new composite unique index
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_etfs_symbol_date ON etfs(symbol, date)
      `);
    } else {
      // Create new table with date column
      await db.execute(`
        CREATE TABLE IF NOT EXISTS etfs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          symbol TEXT NOT NULL,
          date TEXT NOT NULL,
          last_updated TEXT NOT NULL,
          UNIQUE(symbol, date)
        )
      `);
    }
  } else {
    // Schema is up to date, just ensure table exists (no-op if already exists)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS etfs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        date TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        UNIQUE(symbol, date)
      )
    `);
  }

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

  // Ensure the composite unique index exists (for both new and migrated DBs)
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_etfs_symbol_date ON etfs(symbol, date)
  `);
}

export async function upsertEtf(
  db: HoldingsDb,
  symbol: string,
  date: string,
  lastUpdated: string
): Promise<number> {
  const upper = symbol.toUpperCase();
  await db.execute({
    sql: `
      INSERT INTO etfs(symbol, date, last_updated)
      VALUES (?, ?, ?)
      ON CONFLICT(symbol, date) DO UPDATE SET last_updated = excluded.last_updated
    `,
    args: [upper, date, lastUpdated],
  });

  const result = await db.execute({
    sql: `SELECT id FROM etfs WHERE symbol = ? AND date = ?`,
    args: [upper, date],
  });

  if (result.rows.length === 0) {
    throw new Error(`Failed to upsert ETF row for ${upper} on ${date}`);
  }
  const id = result.rows[0].id;
  if (typeof id !== "number") {
    throw new Error(`Failed to upsert ETF row for ${upper} on ${date}: invalid id`);
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
  const etfId = await upsertEtf(db, data.etfSymbol, data.date, data.lastUpdated);
  await upsertHoldingsForEtf(db, etfId, data.holdings);
}

/**
 * Check if holdings exist for a specific ETF and date
 */
export async function hasHoldingsForDate(
  db: HoldingsDb,
  symbol: string,
  date: string
): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT 1 FROM etfs WHERE symbol = ? AND date = ?`,
    args: [symbol.toUpperCase(), date],
  });
  return result.rows.length > 0;
}

/**
 * Get the most recent holdings date for an ETF
 */
export async function getLatestHoldingsDate(
  db: HoldingsDb,
  symbol: string
): Promise<string | null> {
  const result = await db.execute({
    sql: `SELECT date FROM etfs WHERE symbol = ? ORDER BY date DESC LIMIT 1`,
    args: [symbol.toUpperCase()],
  });
  if (result.rows.length === 0) {
    return null;
  }
  const date = result.rows[0].date;
  return typeof date === "string" ? date : null;
}

export async function getHoldingsWeightMap(
  db: HoldingsDb,
  etfSymbol: string,
  opts?: { weightField?: "weight" | "actual_weight"; date?: string }
): Promise<Map<string, number>> {
  const symbol = etfSymbol.toUpperCase();
  const weightField = opts?.weightField ?? "actual_weight";
  if (weightField !== "weight" && weightField !== "actual_weight") {
    throw new Error(`Unsupported weightField: ${String(weightField)}`);
  }

  // If no date specified, use the latest available date
  let dateFilter = opts?.date;
  if (!dateFilter) {
    dateFilter = await getLatestHoldingsDate(db, symbol) ?? undefined;
  }

  let result;
  if (dateFilter) {
    result = await db.execute({
      sql: `
        SELECT h.ticker as ticker, h.${weightField} as weight
        FROM holdings h
        JOIN etfs e ON e.id = h.etf_id
        WHERE e.symbol = ? AND e.date = ?
      `,
      args: [symbol, dateFilter],
    });
  } else {
    // Fallback: no date in DB yet, get any holdings for this symbol
    result = await db.execute({
      sql: `
        SELECT h.ticker as ticker, h.${weightField} as weight
        FROM holdings h
        JOIN etfs e ON e.id = h.etf_id
        WHERE e.symbol = ?
      `,
      args: [symbol],
    });
  }

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

/**
 * Get cached performance data if it's less than 24 hours old
 * @returns The cached payload if valid, null otherwise
 */
export async function getPerformanceCache(
  db: HoldingsDb,
  cacheKey: string
): Promise<string | null> {
  const result = await db.execute({
    sql: `
      SELECT created_at, payload_json, asof_date
      FROM performance_cache
      WHERE cache_key = ?
    `,
    args: [cacheKey],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const createdAt = new Date(row.created_at as string);
  const now = new Date();
  const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  // Cache is valid for 24 hours
  if (hoursSinceCreation < 24) {
    return row.payload_json as string;
  }

  // Cache expired, delete it
  await db.execute({
    sql: `DELETE FROM performance_cache WHERE cache_key = ?`,
    args: [cacheKey],
  });

  return null;
}

/**
 * Store performance data in cache
 */
export async function setPerformanceCache(
  db: HoldingsDb,
  cacheKey: string,
  asofDate: string,
  payloadJson: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute({
    sql: `
      INSERT INTO performance_cache (cache_key, asof_date, created_at, payload_json)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        asof_date = excluded.asof_date,
        created_at = excluded.created_at,
        payload_json = excluded.payload_json
    `,
    args: [cacheKey, asofDate, now, payloadJson],
  });
}
