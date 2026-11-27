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
  // Holdings are stored as dated snapshots: one `etfs` row per (symbol, date)
  // and that day's holdings under it. This matches the production schema.
  // The P/E columns are populated by the (unmerged) `pe` branch; kept here so a
  // fresh database has the same shape as production.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS etfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      date TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      weighted_pe_ratio REAL,
      pe_ratio_updated_at TEXT
    )
  `);
  await db.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_etfs_symbol_date ON etfs(symbol, date)
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      etf_id INTEGER NOT NULL,
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      weight REAL NOT NULL,
      market_value REAL NOT NULL,
      actual_weight REAL NOT NULL,
      price REAL,
      shares REAL NOT NULL,
      pe_ratio REAL,
      UNIQUE(etf_id, ticker, date),
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

/** Snapshot date (YYYY-MM-DD) for a holdings payload. */
export function snapshotDate(data: HoldingsData): string {
  return data.date ?? data.lastUpdated.slice(0, 10);
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
  date: string,
  holdings: Record<string, Holding>
): Promise<void> {
  const statements = Object.entries(holdings).map(([ticker, h]) => ({
    sql: `
      INSERT INTO holdings(
        etf_id, ticker, date, name, weight, market_value, actual_weight, price, shares
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(etf_id, ticker, date) DO UPDATE SET
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
      date,
      h.name,
      h.weight,
      h.market_value,
      h.actual_weight,
      h.price ?? null,
      h.shares,
    ],
  }));

  // Replace this snapshot's holdings in one transaction so positions the fund
  // has exited don't linger when a day is re-synced.
  await db.batch(
    [{ sql: `DELETE FROM holdings WHERE etf_id = ?`, args: [etfId] }, ...statements],
    "write"
  );
}

export async function storeHoldingsData(
  db: HoldingsDb,
  data: HoldingsData
): Promise<void> {
  const date = snapshotDate(data);
  const etfId = await upsertEtf(db, data.etfSymbol, date, data.lastUpdated);
  await upsertHoldingsForEtf(db, etfId, date, data.holdings);
}

/**
 * id of an ETF's latest snapshot that actually has holdings (empty rows, such
 * as old test pollution, are skipped). Takes the symbol as its one parameter.
 */
const LATEST_SNAPSHOT_ID_SQL = `
  SELECT e.id FROM etfs e
  WHERE e.symbol = ?
    AND EXISTS (SELECT 1 FROM holdings x WHERE x.etf_id = e.id)
  ORDER BY e.date DESC, e.id DESC
  LIMIT 1
`;

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
      WHERE h.etf_id = (${LATEST_SNAPSHOT_ID_SQL})
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

/** The latest non-empty snapshot for an ETF. */
export async function getLatestSnapshot(
  db: HoldingsDb,
  etfSymbol: string
): Promise<{
  etfId: number;
  date: string;
  holdings: Array<{ ticker: string; actual_weight: number }>;
} | null> {
  const etf = await db.execute({
    sql: `SELECT id, date FROM etfs WHERE id = (${LATEST_SNAPSHOT_ID_SQL})`,
    args: [etfSymbol.toUpperCase()],
  });
  if (etf.rows.length === 0) return null;
  const etfId = Number(etf.rows[0].id);
  const rows = await db.execute({
    sql: `SELECT ticker, actual_weight FROM holdings WHERE etf_id = ?`,
    args: [etfId],
  });
  return {
    etfId,
    date: String(etf.rows[0].date),
    holdings: rows.rows.map((r) => ({
      ticker: String(r.ticker),
      actual_weight: Number(r.actual_weight),
    })),
  };
}

/** Saves per-holding P/E and the fund's weighted P/E on a snapshot. */
export async function storePeRatios(
  db: HoldingsDb,
  etfId: number,
  peByTicker: Map<string, number | null>,
  weightedPe: number | null
): Promise<void> {
  const statements = Array.from(peByTicker, ([ticker, pe]) => ({
    sql: `UPDATE holdings SET pe_ratio = ? WHERE etf_id = ? AND ticker = ?`,
    args: [pe, etfId, ticker],
  }));
  statements.push({
    sql: `UPDATE etfs SET weighted_pe_ratio = ?, pe_ratio_updated_at = ? WHERE id = ?`,
    args: [weightedPe, new Date().toISOString(), etfId],
  });
  await db.batch(statements, "write");
}

/** Weighted P/E (and as-of date) from each ETF's latest snapshot. */
export async function getLatestPeRatios(
  db: HoldingsDb,
  symbols: string[]
): Promise<Record<string, { peRatio: number | null; date: string } | null>> {
  const out: Record<string, { peRatio: number | null; date: string } | null> = {};
  for (const symbol of symbols) {
    const r = await db.execute({
      sql: `SELECT weighted_pe_ratio AS pe, date FROM etfs WHERE id = (${LATEST_SNAPSHOT_ID_SQL})`,
      args: [symbol.toUpperCase()],
    });
    const row = r.rows[0];
    out[symbol.toLowerCase()] = row
      ? { peRatio: row.pe === null ? null : Number(row.pe), date: String(row.date) }
      : null;
  }
  return out;
}

/** Full latest snapshot for an ETF (for download), including P/E. */
export async function getLatestHoldingsData(
  db: HoldingsDb,
  etfSymbol: string
): Promise<
  | (HoldingsData & {
      date: string;
      weightedPeRatio: number | null;
      holdings: Record<string, Holding & { pe_ratio: number | null }>;
    })
  | null
> {
  const symbol = etfSymbol.toUpperCase();
  const etf = await db.execute({
    sql: `SELECT id, date, last_updated, weighted_pe_ratio FROM etfs WHERE id = (${LATEST_SNAPSHOT_ID_SQL})`,
    args: [symbol],
  });
  const e = etf.rows[0];
  if (!e) return null;
  const rows = await db.execute({
    sql: `
      SELECT ticker, name, weight, market_value, actual_weight, price, shares, pe_ratio
      FROM holdings WHERE etf_id = ? ORDER BY actual_weight DESC
    `,
    args: [Number(e.id)],
  });
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const holdings: Record<string, Holding & { pe_ratio: number | null }> = {};
  for (const r of rows.rows) {
    holdings[String(r.ticker)] = {
      name: String(r.name),
      weight: Number(r.weight),
      market_value: Number(r.market_value),
      actual_weight: Number(r.actual_weight),
      price: num(r.price),
      shares: Number(r.shares),
      pe_ratio: num(r.pe_ratio),
    };
  }
  return {
    etfSymbol: symbol,
    date: String(e.date),
    lastUpdated: String(e.last_updated),
    weightedPeRatio: num(e.weighted_pe_ratio),
    holdings,
  };
}
