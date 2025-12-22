import * as fs from "fs";
import * as path from "path";
import { Database } from "bun:sqlite";
import { HoldingsData, Holding } from "./types";

export type HoldingsDb = Database;

export function openHoldingsDb(dbPath: string): HoldingsDb {
  const resolved = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);

  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(resolved);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  ensureSchema(db);
  return db;
}

export function ensureSchema(db: HoldingsDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS etfs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      last_updated TEXT NOT NULL
    );

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
    );

    CREATE INDEX IF NOT EXISTS idx_holdings_etf_id ON holdings(etf_id);
    CREATE INDEX IF NOT EXISTS idx_holdings_ticker ON holdings(ticker);
  `);
}

export function upsertEtf(
  db: HoldingsDb,
  symbol: string,
  lastUpdated: string
): number {
  const upper = symbol.toUpperCase();
  db.prepare(
    `
      INSERT INTO etfs(symbol, last_updated)
      VALUES ($symbol, $last_updated)
      ON CONFLICT(symbol) DO UPDATE SET last_updated = excluded.last_updated
    `
  ).run({ $symbol: upper, $last_updated: lastUpdated });

  const row = db
    .prepare(`SELECT id FROM etfs WHERE symbol = $symbol`)
    .get({ $symbol: upper }) as { id: number } | undefined;
  if (!row?.id) throw new Error(`Failed to upsert ETF row for ${upper}`);
  return row.id;
}

export function upsertHoldingsForEtf(
  db: HoldingsDb,
  etfId: number,
  holdings: Record<string, Holding>
): void {
  const stmt = db.prepare(
    `
      INSERT INTO holdings(
        etf_id, ticker, name, weight, market_value, actual_weight, price, shares
      )
      VALUES (
        $etf_id, $ticker, $name, $weight, $market_value, $actual_weight, $price, $shares
      )
      ON CONFLICT(etf_id, ticker) DO UPDATE SET
        name = excluded.name,
        weight = excluded.weight,
        market_value = excluded.market_value,
        actual_weight = excluded.actual_weight,
        price = excluded.price,
        shares = excluded.shares
    `
  );

  const tx = db.transaction(() => {
    for (const [ticker, h] of Object.entries(holdings)) {
      stmt.run({
        $etf_id: etfId,
        $ticker: ticker,
        $name: h.name,
        $weight: h.weight,
        $market_value: h.market_value,
        $actual_weight: h.actual_weight,
        $price: h.price,
        $shares: h.shares,
      });
    }
  });

  tx();
}

export function storeHoldingsData(db: HoldingsDb, data: HoldingsData): void {
  const etfId = upsertEtf(db, data.etfSymbol, data.lastUpdated);
  upsertHoldingsForEtf(db, etfId, data.holdings);
}

