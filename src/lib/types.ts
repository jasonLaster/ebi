/**
 * Test symbols that should be excluded from production data.
 * These are used in unit tests but should never appear in public API responses.
 */
export const TEST_SYMBOLS = new Set(["AAA", "BBB"]);

/**
 * Check if a ticker is a test symbol that should be excluded from production data.
 */
export function isTestSymbol(ticker: string): boolean {
  return TEST_SYMBOLS.has(ticker.toUpperCase());
}

export interface Holding {
  name: string;
  weight: number;
  market_value: number;
  actual_weight: number;
  price: number | null;
  shares: number;
  pe_ratio?: number | null;
}

export interface HoldingsData {
  etfSymbol: string;
  lastUpdated: string;
  holdings: Record<string, Holding>;
}

export interface EtfHoldingRow extends Holding {
  etfSymbol: string;
  ticker: string;
}
