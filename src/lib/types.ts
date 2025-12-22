export interface Holding {
  name: string;
  weight: number;
  market_value: number;
  actual_weight: number;
  price: number | null;
  shares: number;
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

