export interface WeightedPe {
  /** Harmonic weighted P/E, or null if no holding has positive earnings. */
  weightedPe: number | null;
  /** Fraction (0–1) of the fund's weight with a usable P/E. */
  coverage: number;
}

/**
 * Fund-level P/E as the weighted harmonic mean of holdings' P/E:
 * Σw / Σ(w / PE), over holdings with positive P/E. This equals portfolio
 * price ÷ portfolio earnings, the convention fund providers use. An
 * arithmetic mean overweights high-P/E names; e.g. two equal holdings at
 * P/E 10 and 100 give 18.2, not 55.
 */
export function weightedHarmonicPe(
  rows: Array<{ weight: number; pe: number | null }>
): WeightedPe {
  let totalWeight = 0;
  let coveredWeight = 0;
  let earningsYield = 0;
  for (const { weight, pe } of rows) {
    if (!(weight > 0)) continue;
    totalWeight += weight;
    if (pe !== null && pe > 0) {
      coveredWeight += weight;
      earningsYield += weight / pe;
    }
  }
  return {
    weightedPe: earningsYield > 0 ? coveredWeight / earningsYield : null,
    coverage: totalWeight > 0 ? coveredWeight / totalWeight : 0,
  };
}
