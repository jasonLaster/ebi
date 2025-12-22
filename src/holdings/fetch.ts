import { fetchEtfHoldingsFromFmp, normalizeFmpHoldingsToMap, FetchLike } from "../lib/fmp-api";
import { HoldingsData } from "../lib/types";
import { openHoldingsDb, HoldingsDb } from "../lib/db";
import { writeHoldingsOutputs } from "./storage";
import * as path from "path";

export const BASELINE_ETFS = ["VTI", "VTV", "IWN"] as const;
export type BaselineEtfSymbol = (typeof BASELINE_ETFS)[number];

export async function fetchEtfHoldings(
  symbol: string,
  opts?: { apiKey?: string; fetchImpl?: FetchLike }
): Promise<HoldingsData> {
  const upper = symbol.toUpperCase();
  const raw = await fetchEtfHoldingsFromFmp(upper, opts);
  const holdings = normalizeFmpHoldingsToMap(upper, raw);
  return {
    etfSymbol: upper,
    lastUpdated: new Date().toISOString(),
    holdings,
  };
}

export async function fetchAndStoreEtfHoldings(
  symbol: string,
  opts: {
    outDir: string;
    sqlitePath?: string;
    db?: HoldingsDb;
    apiKey?: string;
    fetchImpl?: FetchLike;
  }
): Promise<{ symbol: string; jsonPath: string }> {
  const data = await fetchEtfHoldings(symbol, {
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
  });

  const jsonPath = path.join(opts.outDir, `${symbol.toLowerCase()}_holdings.json`);
  const res = writeHoldingsOutputs(data, {
    jsonPath,
    sqlitePath: opts.sqlitePath,
    db: opts.db,
  });
  return { symbol: data.etfSymbol, jsonPath: res.jsonPath };
}

export async function fetchAndStoreManyEtfHoldings(
  symbols: string[],
  opts: { outDir: string; sqlitePath?: string; apiKey?: string; fetchImpl?: FetchLike }
): Promise<{ dbPath?: string; outputs: { symbol: string; jsonPath: string }[] }> {
  const db =
    opts.sqlitePath && opts.sqlitePath.length > 0
      ? openHoldingsDb(opts.sqlitePath)
      : undefined;

  try {
    const outputs: { symbol: string; jsonPath: string }[] = [];
    for (const s of symbols) {
      outputs.push(
        await fetchAndStoreEtfHoldings(s, {
          outDir: opts.outDir,
          sqlitePath: opts.sqlitePath,
          db,
          apiKey: opts.apiKey,
          fetchImpl: opts.fetchImpl,
        })
      );
    }
    return { dbPath: opts.sqlitePath, outputs };
  } finally {
    db?.close();
  }
}

