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
  /** FMP's field name; `shares` is accepted for older payloads/fixtures. */
  sharesNumber?: string | number;
  shares?: string | number;
  weightPercentage?: string | number;
  marketValue?: string | number;
  price?: string | number | null;
  /** e.g. "2026-11-26 20:24:10" */
  updated?: string;
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

/** Latest `updated` date (YYYY-MM-DD) in an FMP etf-holder payload. */
export function latestFmpDate(raw: FmpEtfHolding[]): string | null {
  return (
    raw
      .map((h) => h.updated?.slice(0, 10))
      .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort()
      .at(-1) ?? null
  );
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
      const shares = toNumber(h.sharesNumber ?? h.shares);
      const priceRaw = h.price ?? null;
      // FMP's etf-holder payload has no price; derive it from value / shares.
      const priceNum =
        priceRaw !== null && typeof priceRaw !== "undefined"
          ? toNumber(priceRaw)
          : shares > 0
            ? market_value / shares
            : null;

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

type FmpQuote = { symbol?: string; pe?: number | null };

/** Tickers per batch-quote request (keeps the URL ~2KB). */
export const QUOTE_BATCH_SIZE = 500;

/**
 * Trailing P/E for many tickers via FMP's batch quote endpoint
 * (`/quote/A,B,C`), QUOTE_BATCH_SIZE tickers per request. Tickers FMP
 * doesn't return, or quotes without a P/E (e.g. negative earnings), map to null.
 */
export async function fetchPeRatiosFromFmp(
  tickers: string[],
  opts?: { apiKey?: string; fetchImpl?: FetchLike }
): Promise<Map<string, number | null>> {
  const apiKey = opts?.apiKey ?? getFmpApiKey();
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const unique = Array.from(new Set(tickers.map((t) => t.trim().toUpperCase()))).filter(Boolean);

  const out = new Map<string, number | null>(unique.map((t) => [t, null]));
  for (let i = 0; i < unique.length; i += QUOTE_BATCH_SIZE) {
    const batch = unique.slice(i, i + QUOTE_BATCH_SIZE);
    const url = `${BASE_URL}/quote/${batch.map(encodeURIComponent).join(",")}?apikey=${apiKey}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`FMP batch quote failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) continue;
    for (const q of json as FmpQuote[]) {
      const symbol = q.symbol?.toUpperCase();
      if (symbol && typeof q.pe === "number" && Number.isFinite(q.pe)) {
        out.set(symbol, q.pe);
      }
    }
  }
  return out;
}
