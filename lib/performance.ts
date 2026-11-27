/**
 * Pure helpers for turning /api/performance into EBI-vs-peer comparisons.
 * Shared by the dashboard and its design variants; no React here.
 */

export const SYMBOLS = ["ebi", "vti", "voo", "iwv", "iwn", "vtv", "vo"] as const;
export type Sym = (typeof SYMBOLS)[number];

export interface EtfMeta {
  symbol: Sym;
  ticker: string;
  name: string;
  /** Short role label, e.g. "Benchmark". */
  role: string;
  /** Plain-language summary of what the fund holds. */
  description: string;
  color: string;
}

export const ETFS: Record<Sym, EtfMeta> = {
  ebi: {
    symbol: "ebi",
    ticker: "EBI",
    name: "Longview Advantage ETF",
    role: "Focus",
    description: "The fund this dashboard is built around. Holdings come from its latest published portfolio.",
    color: "#4f46e5",
  },
  vti: {
    symbol: "vti",
    ticker: "VTI",
    name: "Vanguard Total Stock Market ETF",
    role: "Total market",
    description:
      "Tracks the CRSP US Total Market Index: nearly every US-listed stock, from mega caps to micro caps, weighted by market value.",
    color: "#db2777",
  },
  voo: {
    symbol: "voo",
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    role: "S&P 500",
    description: "Tracks the S&P 500: about 500 of the largest US companies, weighted by market value.",
    color: "#0284c7",
  },
  iwv: {
    symbol: "iwv",
    ticker: "IWV",
    name: "iShares Russell 3000 ETF",
    role: "Benchmark",
    description:
      "Tracks the Russell 3000: the 3,000 largest US stocks, covering almost the entire US market. The approximation's benchmark.",
    color: "#64748b",
  },
  iwn: {
    symbol: "iwn",
    ticker: "IWN",
    name: "iShares Russell 2000 Value ETF",
    role: "Small value",
    description:
      "Tracks the Russell 2000 Value index: small US companies that look cheap on measures like price-to-book.",
    color: "#0d9488",
  },
  vtv: {
    symbol: "vtv",
    ticker: "VTV",
    name: "Vanguard Value ETF",
    role: "Large value",
    description:
      "Tracks the CRSP US Large Cap Value index: large US companies that look cheap on measures like price-to-earnings and price-to-book.",
    color: "#d97706",
  },
  vo: {
    symbol: "vo",
    ticker: "VO",
    name: "Vanguard Mid-Cap ETF",
    role: "Mid cap",
    description: "Tracks the CRSP US Mid Cap index: mid-sized US companies, weighted by market value.",
    color: "#9333ea",
  },
};

/** Every comparison ETF, primary ones first. */
export const PEERS: Sym[] = ["vti", "voo", "iwv", "iwn", "vtv", "vo"];
/** Shown by default; the rest sit behind "Show more". */
export const PRIMARY_PEERS: Sym[] = ["vti", "voo"];
export const isPrimary = (s: Sym) => s === "ebi" || PRIMARY_PEERS.includes(s);

export interface PricePoint {
  date: string;
  close: number;
}

export interface PerformanceApiResponse {
  dateRange: { startDate: string; endDate: string };
  historicalPrices: Record<string, PricePoint[] | { error: string }>;
  peRatios?: Record<string, { peRatio: number | null; date: string } | null>;
}

export type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";
export const RANGES: RangeKey[] = ["1M", "3M", "6M", "YTD", "1Y", "ALL"];

/** One row per trading day; each symbol is cumulative % return since the row set's first day. */
export type ReturnRow = { date: string } & Partial<Record<Sym, number>>;

export function priceSeries(api: PerformanceApiResponse): Partial<Record<Sym, PricePoint[]>> {
  const out: Partial<Record<Sym, PricePoint[]>> = {};
  for (const s of SYMBOLS) {
    const v = api.historicalPrices[s];
    if (Array.isArray(v) && v.length > 0) {
      out[s] = [...v].sort((a, b) => a.date.localeCompare(b.date));
    }
  }
  return out;
}

/** First date included by a range, given the last available date. */
export function rangeStart(range: RangeKey, lastDate: string): string | null {
  if (range === "ALL") return null;
  const d = new Date(`${lastDate}T00:00:00Z`);
  if (range === "YTD") return `${d.getUTCFullYear()}-01-01`;
  const months = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12 }[range];
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Cumulative % return rows, rebased to the first common trading day on or
 * after the range start. Dates missing for a symbol are simply omitted.
 */
export function cumulativeReturns(
  prices: Partial<Record<Sym, PricePoint[]>>,
  range: RangeKey = "ALL",
): ReturnRow[] {
  const syms = SYMBOLS.filter((s) => prices[s]);
  if (syms.length === 0) return [];
  const byDate = new Map<string, Partial<Record<Sym, number>>>();
  for (const s of syms) {
    for (const p of prices[s]!) {
      const row = byDate.get(p.date) ?? {};
      row[s] = p.close;
      byDate.set(p.date, row);
    }
  }
  const dates = [...byDate.keys()].sort();
  const start = rangeStart(range, dates[dates.length - 1]);
  const inRange = start ? dates.filter((d) => d >= start) : dates;
  const base: Partial<Record<Sym, number>> = {};
  for (const d of inRange) {
    const row = byDate.get(d)!;
    for (const s of syms) if (base[s] === undefined && row[s]) base[s] = row[s];
  }
  return inRange.map((date) => {
    const row = byDate.get(date)!;
    const out: ReturnRow = { date };
    for (const s of syms) {
      const close = row[s];
      const b = base[s];
      if (close !== undefined && b) out[s] = (close / b - 1) * 100;
    }
    return out;
  });
}

export interface SymbolStats {
  symbol: Sym;
  totalReturn: number;
  /** Annualized volatility of daily returns, in %. */
  volatility: number;
  /** Worst peak-to-trough decline, in % (negative). */
  maxDrawdown: number;
  /** EBI total return minus this symbol's total return, in percentage points. */
  ebiSpread: number;
  pe: number | null;
}

export function computeStats(
  rows: ReturnRow[],
  peRatios: PerformanceApiResponse["peRatios"] = {},
): SymbolStats[] {
  if (rows.length === 0) return [];
  const last = rows[rows.length - 1];
  const ebiTotal = last.ebi ?? NaN;
  return SYMBOLS.filter((s) => last[s] !== undefined).map((s) => {
    const levels = rows.map((r) => r[s]).filter((v): v is number => v !== undefined).map((v) => 1 + v / 100);
    const daily: number[] = [];
    let peak = levels[0];
    let maxDrawdown = 0;
    for (let i = 0; i < levels.length; i++) {
      if (i > 0) daily.push(levels[i] / levels[i - 1] - 1);
      peak = Math.max(peak, levels[i]);
      maxDrawdown = Math.min(maxDrawdown, (levels[i] / peak - 1) * 100);
    }
    const mean = daily.reduce((a, b) => a + b, 0) / Math.max(daily.length, 1);
    const variance = daily.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(daily.length - 1, 1);
    return {
      symbol: s,
      totalReturn: last[s]!,
      volatility: Math.sqrt(variance) * Math.sqrt(252) * 100,
      maxDrawdown,
      ebiSpread: ebiTotal - last[s]!,
      pe: peRatios?.[s]?.peRatio ?? null,
    };
  });
}

/** Per-day spread rows: EBI cumulative return minus each peer's, in percentage points. */
export function spreadRows(rows: ReturnRow[]): ReturnRow[] {
  return rows
    .filter((r) => r.ebi !== undefined)
    .map((r) => {
      const out: ReturnRow = { date: r.date };
      for (const p of PEERS) if (r[p] !== undefined) out[p] = r.ebi! - r[p]!;
      return out;
    });
}

/** Total return by range for every symbol — the "period returns" grid. */
export function periodReturns(
  prices: Partial<Record<Sym, PricePoint[]>>,
): Record<RangeKey, Partial<Record<Sym, number>>> {
  const out = {} as Record<RangeKey, Partial<Record<Sym, number>>>;
  for (const r of RANGES) {
    const rows = cumulativeReturns(prices, r);
    const last = rows[rows.length - 1] ?? { date: "" };
    const { date: _date, ...rest } = last;
    void _date;
    out[r] = rest;
  }
  return out;
}

export function fmtPct(v: number | undefined | null, digits = 1, signed = true): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  const s = v.toFixed(digits);
  return `${signed && v > 0 ? "+" : ""}${s}%`;
}

export function fmtPts(v: number | undefined | null, digits = 1): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)} pts`;
}

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  const date = new Date(`${d}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}
