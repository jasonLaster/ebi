import { NextResponse } from "next/server";

// Debug: API route loaded
console.log("[EBI API] route.ts loaded");

const FMP_API_KEY = process.env.FMP_API_KEY;

export const runtime = "nodejs";

interface HistoricalPriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume: number;
  unadjustedVolume?: number;
  change?: number;
  changePercent?: number;
  vwap?: number;
  label?: string;
  changeOverTime?: number;
}

interface PerformanceResult {
  symbol: string;
  startDate?: string;
  startPrice?: number;
  endDate?: string;
  endPrice?: number;
  performance?: number; // as a percentage
  error?: string;
}

const API_BASE_URL =
  "https://financialmodelingprep.com/api/v3/historical-price-full";

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getHistoricalData(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<HistoricalPriceData[]> {
  const urlSymbol = symbol.startsWith("^")
    ? `index/${symbol.substring(1)}`
    : symbol;
  const url = `${API_BASE_URL}/${urlSymbol}?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`;

  console.log(
    `[EBI API] Fetching data for ${symbol} from ${fromDate} to ${toDate}...`
  );
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(
        `[EBI API] Error fetching data for ${symbol}:`,
        response.status,
        response.statusText
      );
      return [];
    }
    const data: { historical?: HistoricalPriceData[] } = await response.json();
    if (data && Array.isArray(data.historical)) {
      // FMP returns data in reverse chronological order, so reverse it.
      return data.historical.sort(
        (a: HistoricalPriceData, b: HistoricalPriceData) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      );
    }
    console.warn(
      `[EBI API] No historical data found for ${symbol} or unexpected format.`
    );
    return [];
  } catch (error) {
    console.error(
      `[EBI API] Exception fetching historical data for ${symbol}:`,
      error
    );
    return [];
  }
}

function calculatePerformance(
  symbol: string,
  data: HistoricalPriceData[],
  targetStartDate: string
): PerformanceResult {
  if (!data || data.length === 0) {
    return { symbol, error: "No data available" };
  }

  const requestedStartDate = new Date(targetStartDate);

  const startRecord: HistoricalPriceData | undefined = data.find((d) => {
    const recordDate = new Date(d.date);
    return (
      !isNaN(recordDate.getTime()) &&
      (recordDate.getTime() === requestedStartDate.getTime() ||
        recordDate.getTime() > requestedStartDate.getTime())
    );
  });

  // The last record is the most recent one available (already sorted chronologically)
  const endRecord: HistoricalPriceData | undefined = data[data.length - 1];

  if (!startRecord) {
    return {
      symbol,
      error: `No data found on or after start date ${targetStartDate}`,
    };
  }
  if (!endRecord) {
    return {
      symbol,
      error: "Could not determine end price (empty dataset after filtering?)",
    };
  }

  const startPrice = startRecord.close;
  const endPrice = endRecord.close;

  if (startPrice === 0) {
    return {
      symbol,
      startDate: startRecord.date,
      startPrice,
      endDate: endRecord.date,
      endPrice,
      error: "Start price is zero, cannot calculate performance",
    };
  }

  const performance = ((endPrice - startPrice) / startPrice) * 100;

  return {
    symbol,
    startDate: startRecord.date,
    startPrice,
    endDate: endRecord.date,
    endPrice,
    performance,
  };
}

export async function GET() {
  console.log("[EBI API] GET handler called");
  if (!FMP_API_KEY) {
    console.error("[EBI API] FMP_API_KEY environment variable is not set.");
    return NextResponse.json(
      { error: "FMP_API_KEY environment variable is not set." },
      { status: 500 }
    );
  }

  const symbolsToCompare = ["EBI", "VTI", "IWV", "IWN", "VTV"];
  const startDateStr = "2025-03-01";
  const endDateStr = isoDateUTC(new Date()); // yyyy-mm-dd

  const results: PerformanceResult[] = [];
  const allHistoricalData: {
    [symbol: string]: { date: string; close: number }[] | { error: string };
  } = {};

  for (const symbol of symbolsToCompare) {
    const historicalDataArray = await getHistoricalData(
      symbol,
      startDateStr,
      endDateStr
    );

    if (historicalDataArray.length > 0) {
      allHistoricalData[symbol.toLowerCase()] = historicalDataArray.map((d) => ({
        date: d.date,
        close: d.close,
      }));
      const performanceData = calculatePerformance(
        symbol,
        historicalDataArray,
        startDateStr
      );
      results.push(performanceData);
      console.log(`[EBI API] Performance for ${symbol}:`, performanceData);
    } else {
      allHistoricalData[symbol.toLowerCase()] = {
        error: "Failed to fetch or no data returned from API.",
      };
      results.push({
        symbol,
        error: "Failed to fetch or no data returned from API.",
      });
      console.warn(`[EBI API] No data for ${symbol}`);
    }
  }

  const resEBI = results.find((r) => r.symbol === "EBI");
  const resVTI = results.find((r) => r.symbol === "VTI");
  const resIWV = results.find((r) => r.symbol === "IWV");
  const resIWN = results.find((r) => r.symbol === "IWN");
  const resVTV = results.find((r) => r.symbol === "VTV");

  const comparisonDeltas: { [key: string]: string | number } = {};
  const benchmarkSymbol = "IWV";
  const symbolsForDelta = ["EBI", "IWN", "VTV", "VTI"];

  const benchmarkResult = results.find((r) => r.symbol === benchmarkSymbol);

  if (benchmarkResult && benchmarkResult.performance !== undefined) {
    for (const sym of symbolsForDelta) {
      const symResult = results.find((r) => r.symbol === sym);
      const deltaKey = `${sym.toLowerCase()}_${benchmarkSymbol.toLowerCase()}`;

      if (symResult && symResult.performance !== undefined) {
        comparisonDeltas[deltaKey] = parseFloat(
          (symResult.performance - benchmarkResult.performance).toFixed(2)
        );
      } else {
        comparisonDeltas[
          deltaKey
        ] = `N/A (missing performance for ${sym} or ${benchmarkSymbol})`;
      }
    }
  } else {
    // If benchmark (IWV) data is missing, all deltas against it are N/A
    for (const sym of symbolsForDelta) {
      const deltaKey = `${sym.toLowerCase()}_${benchmarkSymbol.toLowerCase()}`;
      comparisonDeltas[
        deltaKey
      ] = `N/A (missing performance for ${benchmarkSymbol})`;
    }
  }

  const finalJsonOutput = {
    dateRange: {
      startDate: startDateStr,
      endDate: endDateStr,
    },
    individualPerformance: {
      ebi: resEBI?.error
        ? { error: resEBI.error }
        : {
            startDate: resEBI?.startDate,
            startPrice: resEBI?.startPrice,
            endDate: resEBI?.endDate,
            endPrice: resEBI?.endPrice,
            performance: resEBI?.performance?.toFixed(2) + "%",
          },
      vti: resVTI?.error
        ? { error: resVTI.error }
        : {
            startDate: resVTI?.startDate,
            startPrice: resVTI?.startPrice,
            endDate: resVTI?.endDate,
            endPrice: resVTI?.endPrice,
            performance: resVTI?.performance?.toFixed(2) + "%",
          },
      iwv: resIWV?.error
        ? { error: resIWV.error }
        : {
            startDate: resIWV?.startDate,
            startPrice: resIWV?.startPrice,
            endDate: resIWV?.endDate,
            endPrice: resIWV?.endPrice,
            performance: resIWV?.performance?.toFixed(2) + "%",
          },
      iwn: resIWN?.error
        ? { error: resIWN.error }
        : {
            startDate: resIWN?.startDate,
            startPrice: resIWN?.startPrice,
            endDate: resIWN?.endDate,
            endPrice: resIWN?.endPrice,
            performance: resIWN?.performance?.toFixed(2) + "%",
          },
      vtv: resVTV?.error
        ? { error: resVTV.error }
        : {
            startDate: resVTV?.startDate,
            startPrice: resVTV?.startPrice,
            endDate: resVTV?.endDate,
            endPrice: resVTV?.endPrice,
            performance: resVTV?.performance?.toFixed(2) + "%",
          },
    },
    performanceDeltas: comparisonDeltas,
    historicalPrices: allHistoricalData,
    deltaNote:
      "Positive delta means the first symbol performed better than the second by that percentage point difference.",
  };

  console.log("[EBI API] Returning JSON result");
  return NextResponse.json(finalJsonOutput);
}
