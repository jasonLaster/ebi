import { Holding, HoldingsData } from "@/src/lib/types";

/**
 * Longview Research Partners publishes EBI's full daily holdings as an HTML
 * table on the fund page (the old /charts/ "Download PDF" flow now redirects
 * here). Fetching and parsing it directly replaces the Hyperbrowser agent,
 * which regularly hung past the 300s function limit.
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

/** Fetches and validates the current EBI holdings. Throws on anything suspicious. */
export async function fetchEbiHoldings(opts?: {
  url?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): Promise<HoldingsData & { asOfDate: string | null }> {
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
  const count = Object.keys(holdings).length;
  if (count < MIN_EXPECTED_HOLDINGS) {
    throw new Error(
      `Parsed only ${count} EBI holdings from ${url} (expected ≥ ${MIN_EXPECTED_HOLDINGS}); the page layout may have changed`
    );
  }

  return {
    etfSymbol: "EBI",
    lastUpdated: asOfDate
      ? new Date(`${asOfDate}T00:00:00Z`).toISOString()
      : new Date().toISOString(),
    asOfDate,
    holdings,
  };
}
