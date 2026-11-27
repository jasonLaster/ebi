import { fetchPeRatiosFromFmp, type FetchLike } from "@/src/lib/fmp-api";
import { getLatestSnapshot, storePeRatios, type HoldingsDb } from "@/src/lib/db";
import { weightedHarmonicPe } from "./pe";

export interface EtfPeResult {
  symbol: string;
  date: string;
  weightedPe: number | null;
  coverage: number;
}

/**
 * Fetches P/E for every holding in each ETF's latest snapshot (one batched
 * quote lookup over the union of tickers) and stores per-holding and
 * fund-level weighted P/E.
 */
export async function updatePeRatios(
  db: HoldingsDb,
  symbols: string[],
  opts?: { apiKey?: string; fetchImpl?: FetchLike }
): Promise<EtfPeResult[]> {
  const snapshots = (
    await Promise.all(
      symbols.map(async (symbol) => ({ symbol, snap: await getLatestSnapshot(db, symbol) }))
    )
  ).filter((s): s is { symbol: string; snap: NonNullable<typeof s.snap> } => s.snap !== null);

  const allTickers = snapshots.flatMap((s) => s.snap.holdings.map((h) => h.ticker));
  const peByTicker = await fetchPeRatiosFromFmp(allTickers, opts);

  const results: EtfPeResult[] = [];
  for (const { symbol, snap } of snapshots) {
    const perHolding = new Map(
      snap.holdings.map((h) => [h.ticker, peByTicker.get(h.ticker.toUpperCase()) ?? null])
    );
    const { weightedPe, coverage } = weightedHarmonicPe(
      snap.holdings.map((h) => ({ weight: h.actual_weight, pe: perHolding.get(h.ticker) ?? null }))
    );
    await storePeRatios(db, snap.etfId, perHolding, weightedPe);
    results.push({ symbol: symbol.toUpperCase(), date: snap.date, weightedPe, coverage });
  }
  return results;
}
