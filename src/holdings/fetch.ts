import {
  fetchEtfHoldingsFromFmp,
  normalizeFmpHoldingsToMap,
  calculateEtfWeightedPeRatio,
  FetchLike,
} from "@/src/lib/fmp-api";
import { HoldingsData } from "@/src/lib/types";
import {
  openHoldingsDb,
  HoldingsDb,
  updateEtfPeRatio,
  updateHoldingsPeRatios,
} from "@/src/lib/db";
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

export interface PeRatioFetchResult {
  symbol: string;
  weightedPe: number | null;
  holdingsWithPe: number;
  totalHoldings: number;
  weightCoverage: number;
}

/**
 * Fetch and store P/E ratios for a single ETF.
 * Fetches P/E for ALL holdings and stores both individual and weighted P/E.
 */
export async function fetchAndStorePeRatios(
  symbol: string,
  opts: {
    db: HoldingsDb;
    apiKey?: string;
    fetchImpl?: FetchLike;
  }
): Promise<PeRatioFetchResult> {
  const upper = symbol.toUpperCase();
  console.log(`[P/E Sync] Fetching P/E ratios for ${upper}...`);

  const result = await calculateEtfWeightedPeRatio(upper, {
    apiKey: opts.apiKey,
    fetchImpl: opts.fetchImpl,
    // No topN = fetch ALL holdings
  });

  // Store weighted P/E ratio for the ETF
  await updateEtfPeRatio(opts.db, upper, result.weightedPe);

  // Store individual holding P/E ratios
  if (Object.keys(result.holdingPeRatios).length > 0) {
    await updateHoldingsPeRatios(opts.db, upper, result.holdingPeRatios);
  }

  const totalHoldings = Object.keys(result.holdingPeRatios).length;
  console.log(
    `[P/E Sync] ${upper}: weighted P/E = ${result.weightedPe?.toFixed(2) ?? "N/A"}, ` +
      `${result.validCount}/${totalHoldings} holdings with P/E, ` +
      `${result.totalWeightCoverage.toFixed(1)}% weight coverage`
  );

  return {
    symbol: upper,
    weightedPe: result.weightedPe,
    holdingsWithPe: result.validCount,
    totalHoldings,
    weightCoverage: result.totalWeightCoverage,
  };
}

/**
 * Fetch and store P/E ratios for multiple ETFs.
 * Processes sequentially to avoid rate limiting.
 */
export async function fetchAndStoreManyPeRatios(
  symbols: string[],
  opts: {
    db?: HoldingsDb;
    apiKey?: string;
    fetchImpl?: FetchLike;
  }
): Promise<{
  results: PeRatioFetchResult[];
  totalTime: number;
}> {
  const db = opts.db ?? (await openHoldingsDb());
  const startTime = Date.now();

  try {
    console.log(`[P/E Sync] Starting P/E ratio sync for ${symbols.length} ETFs...`);
    const results: PeRatioFetchResult[] = [];

    for (const symbol of symbols) {
      try {
        const result = await fetchAndStorePeRatios(symbol, {
          db,
          apiKey: opts.apiKey,
          fetchImpl: opts.fetchImpl,
        });
        results.push(result);
      } catch (error) {
        console.error(`[P/E Sync] Error fetching P/E for ${symbol}:`, error);
        results.push({
          symbol: symbol.toUpperCase(),
          weightedPe: null,
          holdingsWithPe: 0,
          totalHoldings: 0,
          weightCoverage: 0,
        });
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`[P/E Sync] Completed in ${totalTime.toFixed(1)}s`);

    return { results, totalTime };
  } finally {
    if (!opts.db) {
      db.close();
    }
  }
}
