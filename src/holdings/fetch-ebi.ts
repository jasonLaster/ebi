import { Holding, HoldingsData } from "@/src/lib/types";
import {
  fetchEtfHoldingsFromFmp,
  latestFmpDate,
  normalizeFmpHoldingsToMap,
  type FetchLike as FmpFetchLike,
} from "@/src/lib/fmp-api";

/**
 * EBI holdings sources, in order of preference:
 *
 * 1. FMP `etf-holder/EBI` — the same API (and key) used for the baseline ETFs.
 *    Structured JSON with 3-decimal weights; same daily snapshot Longview shows.
 * 2. Longview's fund page, which renders the full holdings table as HTML
 *    (its "Download CSV" button is built client-side from those rows; the
 *    site's REST APIs require a login). Used automatically if FMP fails.
 *
 * Both replace the old Hyperbrowser agent, which clicked a "Download PDF"
 * button that no longer exists and hung past the 300s function limit.
 */
export const EBI_FUND_DATA_URL =
  "https://longviewresearchpartners.com/ebi/fund-data/";

/** Below this the page has almost certainly changed shape. */
export const MIN_EXPECTED_HOLDINGS = 500;

export type FetchLike = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export interface ParsedEbiHoldings {
  /** As-of date printed above the holdings table, ISO yyyy-mm-dd. */
  asOfDate: string | null;
  holdings: Record<string, Holding>;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}

function cellText(row: string, column: string): string | null {
  const m = row.match(
    new RegExp(`<td[^>]*class="[^"]*column-${column}[^"]*"[^>]*>([\\s\\S]*?)</td>`)
  );
  if (!m) return null;
  return decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim();
}

function toNumber(s: string | null): number {
  if (s == null) return NaN;
  return parseFloat(s.replace(/[,%$\s]/g, ""));
}

function parseUsDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Parses the holdings table out of the fund-data page HTML.
 *
 * `weight` is the published (2-decimal, rounded) percentage as a fraction;
 * `actual_weight` is market value / total market value, which keeps precision
 * for the many small positions the page rounds to 0.00%.
 */
export function parseEbiHoldingsHtml(html: string): ParsedEbiHoldings {
  const holdingsStart = html.indexOf("lrp-fund--holdings");
  const asOfRegion =
    holdingsStart >= 0
      ? html.slice(Math.max(0, holdingsStart - 2000), holdingsStart)
      : html;
  const asOfMatch = asOfRegion.match(/As of:\s*([0-9/]+)/g);
  const asOfDate = asOfMatch
    ? parseUsDate(asOfMatch[asOfMatch.length - 1])
    : null;

  const body = holdingsStart >= 0 ? html.slice(holdingsStart) : html;
  const rows = body.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) ?? [];

  // Keyed by ticker so a repeated row can't double-count market value.
  const parsed = new Map<string, Omit<Holding, "actual_weight">>();
  for (const row of rows) {
    if (!row.includes("column-stockticker")) continue;
    const ticker = cellText(row, "stockticker")?.toUpperCase();
    const name = cellText(row, "securityname");
    if (!ticker || !name) continue;

    const shares = toNumber(cellText(row, "shares"));
    const price = toNumber(cellText(row, "price"));
    const marketValue = toNumber(cellText(row, "marketvalue"));
    const weightPct = toNumber(cellText(row, "weightings"));
    if (!Number.isFinite(marketValue)) continue;

    parsed.set(ticker, {
      name,
      weight: Number.isFinite(weightPct) ? weightPct / 100 : 0,
      market_value: marketValue,
      price: Number.isFinite(price) ? price : null,
      shares: Number.isFinite(shares) ? shares : 0,
    });
  }

  let totalMarketValue = 0;
  for (const h of parsed.values()) totalMarketValue += h.market_value;
  const holdings: Record<string, Holding> = {};
  for (const [ticker, h] of parsed) {
    holdings[ticker] = {
      ...h,
      actual_weight: totalMarketValue > 0 ? h.market_value / totalMarketValue : h.weight,
    };
  }

  return { asOfDate, holdings };
}

export type EbiHoldingsSource = "fmp" | "longview-html";

export type EbiHoldings = HoldingsData & {
  asOfDate: string | null;
  source: EbiHoldingsSource;
};

function assertEnoughHoldings(count: number, where: string): void {
  if (count < MIN_EXPECTED_HOLDINGS) {
    throw new Error(
      `Got only ${count} EBI holdings from ${where} (expected ≥ ${MIN_EXPECTED_HOLDINGS})`
    );
  }
}

/** EBI holdings from FMP. Throws if the response looks incomplete. */
export async function fetchEbiHoldingsFromFmp(opts?: {
  apiKey?: string;
  fetchImpl?: FmpFetchLike;
}): Promise<EbiHoldings> {
  const raw = await fetchEtfHoldingsFromFmp("EBI", opts);
  const holdings = normalizeFmpHoldingsToMap("EBI", raw);
  assertEnoughHoldings(Object.keys(holdings).length, "FMP etf-holder/EBI");

  const updated = latestFmpDate(raw);

  return {
    etfSymbol: "EBI",
    date: updated ?? undefined,
    lastUpdated: updated
      ? new Date(`${updated}T00:00:00Z`).toISOString()
      : new Date().toISOString(),
    asOfDate: updated ?? null,
    source: "fmp",
    holdings,
  };
}

/**
 * Tries FMP first, then the Longview page. `primaryError` is set when the
 * fallback was used so callers can alert on the degraded source.
 */
export async function fetchEbiHoldingsWithFallback(opts?: {
  fmp?: Parameters<typeof fetchEbiHoldingsFromFmp>[0];
  longview?: Parameters<typeof fetchEbiHoldings>[0];
}): Promise<EbiHoldings & { primaryError?: unknown }> {
  try {
    return await fetchEbiHoldingsFromFmp(opts?.fmp);
  } catch (primaryError) {
    console.warn("FMP EBI holdings failed; falling back to Longview page:", primaryError);
    const fallback = await fetchEbiHoldings(opts?.longview);
    return { ...fallback, primaryError };
  }
}

/** EBI holdings parsed from Longview's fund page. Throws on anything suspicious. */
export async function fetchEbiHoldings(opts?: {
  url?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<EbiHoldings> {
  const url = opts?.url ?? EBI_FUND_DATA_URL;
  const fetchImpl = opts?.fetchImpl ?? fetch;

  const res = await fetchImpl(url, {
    headers: { "user-agent": "ebi-dashboard/1.0 (+holdings sync)" },
    redirect: "follow",
    signal: AbortSignal.timeout(opts?.timeoutMs ?? 30_000),
  });
  if (!res.ok) {
    throw new Error(`EBI holdings page returned HTTP ${res.status} (${url})`);
  }

  const { asOfDate, holdings } = parseEbiHoldingsHtml(await res.text());
  assertEnoughHoldings(
    Object.keys(holdings).length,
    `${url} (the page layout may have changed)`
  );

  return {
    etfSymbol: "EBI",
    date: asOfDate ?? undefined,
    lastUpdated: asOfDate
      ? new Date(`${asOfDate}T00:00:00Z`).toISOString()
      : new Date().toISOString(),
    asOfDate,
    source: "longview-html",
    holdings,
  };
}
