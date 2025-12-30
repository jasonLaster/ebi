import { createClient, Client } from "@libsql/client";
import { HoldingsData, Holding, isTestSymbol } from "./types";

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
      last_updated TEXT NOT NULL,
      weighted_pe_ratio REAL,
      pe_ratio_updated_at TEXT
    )
  `);

  // Add new columns to existing etfs table if they don't exist
  await db.execute(`
    ALTER TABLE etfs ADD COLUMN weighted_pe_ratio REAL
  `).catch(() => { /* Column might already exist */ });
  
  await db.execute(`
    ALTER TABLE etfs ADD COLUMN pe_ratio_updated_at TEXT
  `).catch(() => { /* Column might already exist */ });

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
      pe_ratio REAL,
      UNIQUE(etf_id, ticker),
      FOREIGN KEY(etf_id) REFERENCES etfs(id) ON DELETE CASCADE
    )
  `);

  // Add pe_ratio column to existing holdings table if it doesn't exist
  await db.execute(`
    ALTER TABLE holdings ADD COLUMN pe_ratio REAL
  `).catch(() => { /* Column might already exist */ });

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
  lastUpdated: string,
  weightedPeRatio?: number | null
): Promise<number> {
  const upper = symbol.toUpperCase();
  const now = new Date().toISOString();
  
  if (weightedPeRatio !== undefined) {
    await db.execute({
      sql: `
        INSERT INTO etfs(symbol, last_updated, weighted_pe_ratio, pe_ratio_updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET 
          last_updated = excluded.last_updated,
          weighted_pe_ratio = excluded.weighted_pe_ratio,
          pe_ratio_updated_at = excluded.pe_ratio_updated_at
      `,
      args: [upper, lastUpdated, weightedPeRatio, now],
    });
  } else {
    await db.execute({
      sql: `
        INSERT INTO etfs(symbol, last_updated)
        VALUES (?, ?)
        ON CONFLICT(symbol) DO UPDATE SET last_updated = excluded.last_updated
      `,
      args: [upper, lastUpdated],
    });
  }

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

/**
 * Update just the weighted P/E ratio for an ETF
 */
export async function updateEtfPeRatio(
  db: HoldingsDb,
  symbol: string,
  weightedPeRatio: number | null
): Promise<void> {
  const upper = symbol.toUpperCase();
  const now = new Date().toISOString();
  
  await db.execute({
    sql: `
      UPDATE etfs 
      SET weighted_pe_ratio = ?, pe_ratio_updated_at = ?
      WHERE symbol = ?
    `,
    args: [weightedPeRatio, now, upper],
  });
}

/**
 * Get the cached weighted P/E ratio for an ETF if it's recent enough
 */
export async function getEtfPeRatio(
  db: HoldingsDb,
  symbol: string,
  maxAgeHours: number = 24
): Promise<{ peRatio: number | null; updatedAt: string | null } | null> {
  const upper = symbol.toUpperCase();
  
  const result = await db.execute({
    sql: `SELECT weighted_pe_ratio, pe_ratio_updated_at FROM etfs WHERE symbol = ?`,
    args: [upper],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const updatedAt = row.pe_ratio_updated_at as string | null;
  
  if (!updatedAt) {
    return null;
  }

  const updatedDate = new Date(updatedAt);
  const now = new Date();
  const hoursSinceUpdate = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);

  if (hoursSinceUpdate > maxAgeHours) {
    return null; // Cache expired
  }

  return {
    peRatio: row.weighted_pe_ratio as number | null,
    updatedAt,
  };
}

export async function upsertHoldingsForEtf(
  db: HoldingsDb,
  etfId: number,
  holdings: Record<string, Holding>
): Promise<void> {
  const statements = Object.entries(holdings).map(([ticker, h]) => ({
    sql: `
      INSERT INTO holdings(
        etf_id, ticker, name, weight, market_value, actual_weight, price, shares, pe_ratio
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(etf_id, ticker) DO UPDATE SET
        name = excluded.name,
        weight = excluded.weight,
        market_value = excluded.market_value,
        actual_weight = excluded.actual_weight,
        price = excluded.price,
        shares = excluded.shares,
        pe_ratio = excluded.pe_ratio
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
      h.pe_ratio ?? null,
    ],
  }));

  await db.batch(statements, "write");
}

/**
 * Update P/E ratios for holdings in bulk
 */
export async function updateHoldingsPeRatios(
  db: HoldingsDb,
  etfSymbol: string,
  peRatios: Record<string, number | null>
): Promise<void> {
  const upper = etfSymbol.toUpperCase();
  
  // Get ETF ID
  const etfResult = await db.execute({
    sql: `SELECT id FROM etfs WHERE symbol = ?`,
    args: [upper],
  });
  
  if (etfResult.rows.length === 0) {
    throw new Error(`ETF ${upper} not found`);
  }
  
  const etfId = etfResult.rows[0].id as number;
  
  const statements = Object.entries(peRatios).map(([ticker, peRatio]) => ({
    sql: `
      UPDATE holdings 
      SET pe_ratio = ?
      WHERE etf_id = ? AND ticker = ?
    `,
    args: [peRatio, etfId, ticker],
  }));

  if (statements.length > 0) {
    await db.batch(statements, "write");
  }
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
    
    // Skip test symbols (AAA, BBB) - they should not appear in public API responses
    if (isTestSymbol(ticker)) continue;
    
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
    if (!ticker) continue;
    
    // Skip test symbols (AAA, BBB) - they should not appear in public API responses
    if (isTestSymbol(ticker)) continue;
    
    s.add(ticker);
  }
  return s;
}

export async function getHoldingsForEtf(
  db: HoldingsDb,
  etfSymbol: string
): Promise<HoldingsData | null> {
  const symbol = etfSymbol.toUpperCase();
  
  // First get the ETF info
  const etfResult = await db.execute({
    sql: `SELECT id, symbol, last_updated FROM etfs WHERE symbol = ?`,
    args: [symbol],
  });

  if (etfResult.rows.length === 0) {
    return null;
  }

  const etfRow = etfResult.rows[0];
  const etfId = etfRow.id as number;
  const lastUpdated = etfRow.last_updated as string;

  // Get all holdings for this ETF
  const holdingsResult = await db.execute({
    sql: `
      SELECT ticker, name, weight, market_value, actual_weight, price, shares, pe_ratio
      FROM holdings
      WHERE etf_id = ?
      ORDER BY actual_weight DESC, ticker ASC
    `,
    args: [etfId],
  });

  const holdings: Record<string, Holding> = {};
  for (const row of holdingsResult.rows) {
    const ticker = (row.ticker ?? "").toString().trim();
    if (!ticker) continue;
    
    // Skip test symbols (AAA, BBB) - they should not appear in public API responses
    if (isTestSymbol(ticker)) continue;

    holdings[ticker] = {
      name: (row.name ?? "").toString(),
      weight: typeof row.weight === "number" ? row.weight : Number(row.weight) || 0,
      market_value: typeof row.market_value === "number" ? row.market_value : Number(row.market_value) || 0,
      actual_weight: typeof row.actual_weight === "number" ? row.actual_weight : Number(row.actual_weight) || 0,
      price: typeof row.price === "number" ? row.price : row.price ? Number(row.price) : null,
      shares: typeof row.shares === "number" ? row.shares : Number(row.shares) || 0,
      pe_ratio: typeof row.pe_ratio === "number" ? row.pe_ratio : row.pe_ratio ? Number(row.pe_ratio) : null,
    };
  }

  return {
    etfSymbol: symbol,
    lastUpdated,
    holdings,
  };
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
