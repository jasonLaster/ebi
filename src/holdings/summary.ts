import type { Holding } from "@/src/lib/types";

export interface HoldingsSummary {
  etfSymbol: string;
  date: string;
  count: number;
  /** Combined weight (0–1) of the `top` holdings. */
  topWeight: number;
  top: { ticker: string; name: string; weight: number }[];
  weightedPeRatio: number | null;
}

/** Compact view of a holdings snapshot: count plus the largest positions by weight. */
export function summarizeHoldings(
  data: {
    etfSymbol: string;
    date: string;
    weightedPeRatio: number | null;
    holdings: Record<string, Pick<Holding, "name" | "actual_weight">>;
  },
  topN: number
): HoldingsSummary {
  const top = Object.entries(data.holdings)
    .map(([ticker, h]) => ({ ticker, name: h.name, weight: h.actual_weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, Math.max(0, topN));
  return {
    etfSymbol: data.etfSymbol,
    date: data.date,
    count: Object.keys(data.holdings).length,
    topWeight: top.reduce((s, h) => s + h.weight, 0),
    top,
    weightedPeRatio: data.weightedPeRatio,
  };
}
