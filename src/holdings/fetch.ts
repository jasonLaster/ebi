import {
  fetchEtfHoldingsFromFmp,
  normalizeFmpHoldingsToMap,
  FetchLike,
} from "../lib/fmp-api";
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
    db?: HoldingsDb;
    apiKey?: string;
    fetchImpl?: FetchLike;
  }
): Promise<{ symbol: string; jsonPath: string }> {
  const data = await fetchEtfHoldings(symbol, {
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
  });

  const jsonPath = path.join(
    opts.outDir,
    `${symbol.toLowerCase()}_holdings.json`
  );
  const res = await writeHoldingsOutputs(data, {
    jsonPath,
    db: opts.db,
  });
  return { symbol: data.etfSymbol, jsonPath: res.jsonPath };
}

export async function fetchAndStoreManyEtfHoldings(
  symbols: string[],
  opts: {
    outDir: string;
    db?: HoldingsDb;
    apiKey?: string;
    fetchImpl?: FetchLike;
  }
): Promise<{
  outputs: { symbol: string; jsonPath: string }[];
}> {
  const db = opts.db ?? (await openHoldingsDb());

  try {
    const outputs: { symbol: string; jsonPath: string }[] = [];
    for (const s of symbols) {
      outputs.push(
        await fetchAndStoreEtfHoldings(s, {
          outDir: opts.outDir,
          db,
          apiKey: opts.apiKey,
          fetchImpl: opts.fetchImpl,
        })
      );
    }
    return { outputs };
  } finally {
    if (!opts.db) {
      // Only close if we created the connection
      db.close();
    }
  }
}
