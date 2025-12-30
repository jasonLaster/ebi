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
