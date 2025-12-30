import { Holding } from "./types";

// Bun's `typeof fetch` includes extra properties (e.g. `preconnect`) which makes
// it awkward to mock in tests. Use a minimal callable type instead.
export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const BASE_URL = "https://financialmodelingprep.com/api/v3";

export type FmpEtfHolding = {
  asset?: string; // ticker
  name?: string;
  shares?: string | number;
  weightPercentage?: string | number;
  marketValue?: string | number;
  price?: string | number | null;
};

export function getFmpApiKey(): string {
  const key = process.env.FMP_API_KEY;
  if (!key) {
    throw new Error(
      "FMP_API_KEY environment variable is not set. Add it to your environment (or a .env file) before fetching holdings."
    );
  }
  return key;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function fetchEtfHoldingsFromFmp(
  symbol: string,
  opts?: { apiKey?: string; fetchImpl?: FetchLike }
): Promise<FmpEtfHolding[]> {
  const apiKey = opts?.apiKey ?? getFmpApiKey();
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const upperSymbol = symbol.toUpperCase();

  const url = `${BASE_URL}/etf-holder/${upperSymbol}?apikey=${apiKey}`;
  const res = await fetchImpl(url);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch holdings for ${upperSymbol}: ${res.status} ${res.statusText}`
    );
  }

  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return json as FmpEtfHolding[];
}

export function normalizeFmpHoldingsToMap(
  symbol: string,
  raw: FmpEtfHolding[]
): Record<string, Holding> {
  // Map API data to our normalized shape.
  const rows = raw
    .map((h) => {
      const ticker = (h.asset ?? "").toString().trim();
      if (!ticker) return null;

      const weightPct = toNumber(h.weightPercentage);
      const weight = Number.isFinite(weightPct) ? weightPct / 100 : 0;
      const market_value = toNumber(h.marketValue);
      const shares = toNumber(h.shares);
      const priceRaw = h.price ?? null;
      const priceNum =
        priceRaw === null || typeof priceRaw === "undefined"
          ? null
          : toNumber(priceRaw);

      return {
        ticker,
        holding: {
          name: (h.name ?? "").toString().trim() || ticker,
          shares,
          weight: Number(weight.toFixed(6)),
          market_value: Number(market_value.toFixed(2)),
          actual_weight: 0, // computed below
          price: priceNum === null ? null : Number(priceNum.toFixed(4)),
        } satisfies Holding,
      };
    })
    .filter(Boolean) as { ticker: string; holding: Holding }[];

  const totalMarketValue = rows.reduce(
    (sum, r) => sum + (r.holding.market_value || 0),
    0
  );
  const useMarketValue = totalMarketValue > 0;

  const holdings: Record<string, Holding> = {};
  for (const r of rows) {
    holdings[r.ticker] = {
      ...r.holding,
      actual_weight: useMarketValue
        ? Number((r.holding.market_value / totalMarketValue).toFixed(6))
        : r.holding.weight,
    };
  }

  return holdings;
}

export interface FmpKeyMetrics {
  symbol?: string;
  peRatio?: number | null;
  priceEarningsRatio?: number | null;
}

/**
 * Fetch key metrics (including P/E ratio) for a symbol from FMP API
 */
export async function fetchKeyMetricsFromFmp(
  symbol: string,
  opts?: { apiKey?: string; fetchImpl?: FetchLike }
): Promise<FmpKeyMetrics | null> {
  const apiKey = opts?.apiKey ?? getFmpApiKey();
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const upperSymbol = symbol.toUpperCase();

  const url = `${BASE_URL}/key-metrics/${upperSymbol}?apikey=${apiKey}&limit=1`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) {
      console.warn(
        `Failed to fetch key metrics for ${upperSymbol}: ${res.status} ${res.statusText}`
      );
      return null;
    }

    const json = await res.json();
    if (!Array.isArray(json) || json.length === 0) {
      return null;
    }

    const metrics = json[0] as FmpKeyMetrics;
    return metrics;
  } catch (error) {
    console.warn(
      `Exception fetching key metrics for ${upperSymbol}:`,
      error
    );
    return null;
  }
}

export interface WeightedPeResult {
  weightedPe: number | null;
  holdingPeRatios: Record<string, number | null>;
  validCount: number;
  totalWeightCoverage: number;
}

/**
 * Calculate weighted average P/E ratio for an ETF based on its holdings.
 * Since FMP doesn't provide P/E directly for ETFs, we compute it from holdings.
 * 
 * @param symbol - ETF symbol
 * @param topN - Number of holdings to use. Use 0 or undefined for ALL holdings.
 * @returns Object with weighted P/E and individual holding P/E ratios
 */
export async function calculateEtfWeightedPeRatio(
  symbol: string,
  opts?: { apiKey?: string; fetchImpl?: FetchLike; topN?: number }
): Promise<WeightedPeResult> {
  const apiKey = opts?.apiKey ?? getFmpApiKey();
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const topN = opts?.topN; // undefined means all holdings
  const upperSymbol = symbol.toUpperCase();

  console.log(`[FMP] Calculating weighted P/E for ${upperSymbol} using ${topN ? `top ${topN}` : 'ALL'} holdings...`);

  const emptyResult: WeightedPeResult = {
    weightedPe: null,
    holdingPeRatios: {},
    validCount: 0,
    totalWeightCoverage: 0,
  };

  try {
    // Step 1: Fetch ETF holdings
    const holdings = await fetchEtfHoldingsFromFmp(upperSymbol, { apiKey, fetchImpl });
    if (!holdings || holdings.length === 0) {
      console.warn(`[FMP] No holdings found for ${upperSymbol}`);
      return emptyResult;
    }

    // Take top N holdings by weight, or all if topN is not specified
    const topHoldings = topN && topN > 0 ? holdings.slice(0, topN) : holdings;
    console.log(`[FMP] Fetching P/E for ${topHoldings.length} holdings of ${upperSymbol}...`);
    
    // Step 2: Fetch P/E ratios for each holding in batches to avoid rate limits
    const BATCH_SIZE = 50; // Process 50 holdings at a time
    const BATCH_DELAY_MS = 100; // Small delay between batches
    
    const peResults: Array<{ ticker: string; weight: number; pe: number | null } | null> = [];
    
    for (let i = 0; i < topHoldings.length; i += BATCH_SIZE) {
      const batch = topHoldings.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(topHoldings.length / BATCH_SIZE);
      
      if (topHoldings.length > BATCH_SIZE) {
        console.log(`[FMP] Processing batch ${batchNum}/${totalBatches} for ${upperSymbol}...`);
      }
      
      const batchPromises = batch.map(async (holding) => {
        const ticker = holding.asset?.toString().trim();
        if (!ticker) return null;

        const weight = typeof holding.weightPercentage === 'number' 
          ? holding.weightPercentage 
          : parseFloat(String(holding.weightPercentage || '0'));

        const metrics = await fetchKeyMetricsFromFmp(ticker, { apiKey, fetchImpl });
        const pe = metrics?.peRatio ?? metrics?.priceEarningsRatio ?? null;

        return { ticker, weight, pe };
      });

      const batchResults = await Promise.all(batchPromises);
      peResults.push(...batchResults);
      
      // Add delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < topHoldings.length && BATCH_DELAY_MS > 0) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }

    // Step 3: Calculate weighted average P/E and collect individual P/E ratios
    let totalWeight = 0;
    let weightedPeSum = 0;
    let validCount = 0;
    const holdingPeRatios: Record<string, number | null> = {};

    for (const result of peResults) {
      if (!result) continue;
      
      // Store individual P/E ratio
      holdingPeRatios[result.ticker] = result.pe;
      
      if (result.pe !== null && typeof result.pe === 'number' && result.pe > 0 && result.weight > 0) {
        weightedPeSum += result.pe * result.weight;
        totalWeight += result.weight;
        validCount++;
      }
    }

    if (totalWeight === 0 || validCount === 0) {
      console.warn(`[FMP] No valid P/E data for ${upperSymbol} holdings`);
      return {
        weightedPe: null,
        holdingPeRatios,
        validCount: 0,
        totalWeightCoverage: 0,
      };
    }

    const weightedPe = weightedPeSum / totalWeight;
    console.log(`[FMP] ${upperSymbol} weighted P/E: ${weightedPe.toFixed(2)} (from ${validCount} holdings, ${totalWeight.toFixed(1)}% weight coverage)`);
    
    return {
      weightedPe,
      holdingPeRatios,
      validCount,
      totalWeightCoverage: totalWeight,
    };
  } catch (error) {
    console.error(`[FMP] Error calculating weighted P/E for ${upperSymbol}:`, error);
    return emptyResult;
  }
}
