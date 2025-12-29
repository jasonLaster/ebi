"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownIcon, ArrowUpIcon, InfoIcon } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReferenceLine } from "recharts";
import React, { useEffect, useState, useMemo } from "react";
import { PortfolioApproximation } from "@/components/portfolio-approximation";
import { PortfolioComparison } from "@/components/portfolio-comparison";
import { Button } from "@/components/ui/button";

// Define interfaces for the API response
interface PerformanceEntry {
  date: string;
  close: number;
}

interface PerformanceError {
  error: string;
}

interface PerformanceData {
  startDate?: string;
  startPrice?: number;
  endDate?: string;
  endPrice?: number;
  performance?: string; // This is a string like "-4.71%"
  error?: string; // Error specific to this symbol's performance calculation
}

interface IndividualPerformance {
  ebi: PerformanceData;
  vti: PerformanceData;
  iwv: PerformanceData;
  iwn: PerformanceData; // No longer optional
  vtv: PerformanceData; // No longer optional
}

interface HistoricalPrices {
  ebi: PerformanceEntry[] | PerformanceError;
  vti: PerformanceEntry[] | PerformanceError;
  iwv: PerformanceEntry[] | PerformanceError;
  iwn: PerformanceEntry[] | PerformanceError; // No longer optional
  vtv: PerformanceEntry[] | PerformanceError; // No longer optional
}

interface ApiResponse {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  individualPerformance: IndividualPerformance;
  performanceDeltas: Record<string, number | string>; // Deltas can be numbers or "N/A"
  historicalPrices: HistoricalPrices;
  deltaNote: string;
}

interface CombinedChartData {
  date: string;
  EBI_norm?: number;
  VTI_norm?: number;
  IWV_norm?: number;
  IWN_norm?: number; // Added for IWN
  VTV_norm?: number; // Added for VTV
  EBI_delta_IWV?: number; // Delta EBI vs IWV
  IWN_delta_IWV?: number; // Delta IWN vs IWV
  VTV_delta_IWV?: number; // Delta VTV vs IWV
}

interface ProcessedData {
  combinedData: CombinedChartData[];
  yAxisMin: number;
  yAxisMax: number;
  yAxisMinDelta: number; // Added for delta chart y-axis
  yAxisMaxDelta: number; // Added for delta chart y-axis
  chartReady: boolean;
}

// Data from the provided JSON
// const data = { ... }; // Removed hardcoded data

// Prepare data for the line chart
// const combinedData = data.historicalPrices.ebi.map((item, index) => { ... }); // Moved to useMemo

// Format date for display
const formatDate = (dateString: string) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  // Add a check for invalid date
  if (isNaN(date.getTime())) {
    return "Invalid Date";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// Custom tooltip formatter for the line chart
interface TooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number | string;
    color?: string;
    dataKey?: string;
  }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length && label) {
    return (
      <div className="bg-white p-4 border rounded-lg shadow-sm">
        <p className="font-medium">{formatDate(label)}</p>
        <div className="mt-2 space-y-1">
          {payload.map((entry, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {entry.name}:{" "}
              {typeof entry.value === "number"
                ? entry.value.toFixed(2)
                : entry.value}
              {entry.dataKey?.endsWith("_norm") || entry.dataKey === "delta"
                ? "%"
                : ""}
            </p>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function ETFDashboard() {
  const [apiData, setApiData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/performance")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API request failed with status ${res.status}`);
        }
        return res.json();
      })
      .then((data: ApiResponse) => {
        setApiData(data);
      })
      .catch((err) => {
        console.error("Failed to fetch performance data:", err);
        setError(err.message || "Failed to load data. Please try again later.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const processedData = useMemo((): ProcessedData | null => {
    if (!apiData) {
      return null;
    }

    const { historicalPrices, individualPerformance } = apiData;

    const ebiHist = historicalPrices.ebi;
    const vtiHist = historicalPrices.vti;
    const iwvHist = historicalPrices.iwv;
    const iwnHist = historicalPrices.iwn; // Added
    const vtvHist = historicalPrices.vtv; // Added

    const ebiPerf = individualPerformance.ebi;
    const vtiPerf = individualPerformance.vti;
    const iwvPerf = individualPerformance.iwv;
    const iwnPerf = individualPerformance.iwn; // Added
    const vtvPerf = individualPerformance.vtv; // Added

    let chartReady = false;
    let combinedData: CombinedChartData[] = [];

    // Determine the primary array for dates (e.g., ebiHist or iwvHist if ebiHist is missing)
    let primaryDateSource: PerformanceEntry[] | undefined;
    if (Array.isArray(ebiHist) && ebiHist.length > 0) {
      primaryDateSource = ebiHist;
    } else if (Array.isArray(iwvHist) && iwvHist.length > 0) {
      primaryDateSource = iwvHist;
    } else if (Array.isArray(iwnHist) && iwnHist.length > 0) {
      primaryDateSource = iwnHist;
    } else if (Array.isArray(vtvHist) && vtvHist.length > 0) {
      primaryDateSource = vtvHist;
    } else if (Array.isArray(vtiHist) && vtiHist.length > 0) {
      primaryDateSource = vtiHist;
    }

    if (primaryDateSource) {
      chartReady = true;
      combinedData = primaryDateSource.map((dateEntry) => {
        const currentDate = dateEntry.date;

        let ebiNorm: number | undefined = undefined;
        let vtiNorm: number | undefined = undefined;
        let iwvNorm: number | undefined = undefined;
        let iwnNorm: number | undefined = undefined;
        let vtvNorm: number | undefined = undefined;

        let ebiDeltaIwv: number | undefined = undefined;
        let iwnDeltaIwv: number | undefined = undefined;
        let vtvDeltaIwv: number | undefined = undefined;

        if (
          Array.isArray(ebiHist) &&
          ebiPerf &&
          typeof ebiPerf.startPrice === "number" &&
          ebiPerf.startPrice !== 0
        ) {
          const point = ebiHist.find((d) => d.date === currentDate);
          if (point && typeof point.close === "number") {
            ebiNorm = (point.close / ebiPerf.startPrice) * 100;
          } else {
            ebiNorm = undefined;
          }
        } else {
          ebiNorm = undefined;
        }

        if (
          Array.isArray(vtiHist) &&
          vtiPerf &&
          typeof vtiPerf.startPrice === "number" &&
          vtiPerf.startPrice !== 0
        ) {
          const point = vtiHist.find((d) => d.date === currentDate);
          if (point && typeof point.close === "number") {
            vtiNorm = (point.close / vtiPerf.startPrice) * 100;
          } else {
            vtiNorm = undefined;
          }
        } else {
          vtiNorm = undefined;
        }

        if (
          Array.isArray(iwvHist) &&
          iwvPerf &&
          typeof iwvPerf.startPrice === "number" &&
          iwvPerf.startPrice !== 0
        ) {
          const point = iwvHist.find((d) => d.date === currentDate);
          if (point && typeof point.close === "number") {
            iwvNorm = (point.close / iwvPerf.startPrice) * 100;
          } else {
            iwvNorm = undefined;
          }
        } else {
          iwvNorm = undefined;
        }

        if (
          Array.isArray(iwnHist) &&
          iwnPerf &&
          typeof iwnPerf.startPrice === "number" &&
          iwnPerf.startPrice !== 0
        ) {
          const point = iwnHist.find((d) => d.date === currentDate);
          if (point && typeof point.close === "number") {
            iwnNorm = (point.close / iwnPerf.startPrice) * 100;
          } else {
            iwnNorm = undefined;
          }
        } else {
          iwnNorm = undefined;
        }

        if (
          Array.isArray(vtvHist) &&
          vtvPerf &&
          typeof vtvPerf.startPrice === "number" &&
          vtvPerf.startPrice !== 0
        ) {
          const point = vtvHist.find((d) => d.date === currentDate);
          if (point && typeof point.close === "number") {
            vtvNorm = (point.close / vtvPerf.startPrice) * 100;
          } else {
            vtvNorm = undefined;
          }
        } else {
          vtvNorm = undefined;
        }

        if (typeof ebiNorm === "number" && typeof iwvNorm === "number") {
          ebiDeltaIwv = ebiNorm - iwvNorm;
        }
        if (typeof iwnNorm === "number" && typeof iwvNorm === "number") {
          iwnDeltaIwv = iwnNorm - iwvNorm;
        }
        if (typeof vtvNorm === "number" && typeof iwvNorm === "number") {
          vtvDeltaIwv = vtvNorm - iwvNorm;
        }

        const result: CombinedChartData = {
          date: currentDate,
        };
        if (ebiNorm !== undefined) result.EBI_norm = ebiNorm;
        if (vtiNorm !== undefined) result.VTI_norm = vtiNorm;
        if (iwvNorm !== undefined) result.IWV_norm = iwvNorm;
        if (iwnNorm !== undefined) result.IWN_norm = iwnNorm;
        if (vtvNorm !== undefined) result.VTV_norm = vtvNorm;
        if (ebiDeltaIwv !== undefined) result.EBI_delta_IWV = ebiDeltaIwv;
        if (iwnDeltaIwv !== undefined) result.IWN_delta_IWV = iwnDeltaIwv;
        if (vtvDeltaIwv !== undefined) result.VTV_delta_IWV = vtvDeltaIwv;
        return result;
      });
    }

    if (!chartReady || combinedData.length === 0) {
      return {
        combinedData: [],
        yAxisMin: 80,
        yAxisMax: 120,
        yAxisMinDelta: -10,
        yAxisMaxDelta: 10,
        chartReady: false,
      };
    }

    const allValues = combinedData
      .flatMap((item) => [
        item.EBI_norm,
        item.VTI_norm,
        item.IWV_norm,
        item.IWN_norm,
        item.VTV_norm,
      ])
      .filter((v): v is number => typeof v === "number" && !isNaN(v));

    const minValue =
      allValues.length > 0 ? Math.floor(Math.min(...allValues)) : 90;
    const maxValue =
      allValues.length > 0 ? Math.ceil(Math.max(...allValues)) : 110;

    const range = Math.max(100 - minValue, maxValue - 100);
    const yAxisMin = range > 0 ? Math.max(80, 100 - range - 5) : 80;
    const yAxisMax = range > 0 ? Math.min(120, 100 + range + 5) : 120;

    const allDeltaValues = combinedData
      .flatMap((item) => [
        item.EBI_delta_IWV,
        item.IWN_delta_IWV,
        item.VTV_delta_IWV,
      ])
      .filter((v): v is number => typeof v === "number" && !isNaN(v));

    let yAxisMinDelta = -10;
    let yAxisMaxDelta = 10;

    if (allDeltaValues.length > 0) {
      const minDeltaVal = Math.floor(Math.min(...allDeltaValues));
      const maxDeltaVal = Math.ceil(Math.max(...allDeltaValues));
      // Calculate range based on deviation from 0, ensuring symmetry if possible
      const deltaRangeMagnitude = Math.max(
        Math.abs(minDeltaVal),
        Math.abs(maxDeltaVal)
      );
      yAxisMinDelta = Math.max(-25, 0 - deltaRangeMagnitude - 5);
      yAxisMaxDelta = Math.min(25, 0 + deltaRangeMagnitude + 5);

      if (
        yAxisMinDelta === 0 &&
        yAxisMaxDelta === 0 &&
        allDeltaValues.every((v) => v === 0)
      ) {
        yAxisMinDelta = -5; // Default small range if all deltas are exactly 0
        yAxisMaxDelta = 5;
      } else if (yAxisMinDelta >= yAxisMaxDelta) {
        // Ensure min is less than max
        // If calculation leads to min >= max (e.g. all positive/negative small deltas)
        // provide a sensible range around the values or a default.
        if (maxDeltaVal <= 2 && minDeltaVal >= -2) {
          // If values are very close to zero
          yAxisMinDelta = -5;
          yAxisMaxDelta = 5;
        } else {
          // else, base on actual min/max with padding
          yAxisMinDelta = minDeltaVal - 2;
          yAxisMaxDelta = maxDeltaVal + 2;
        }
      }
    }

    return {
      combinedData,
      yAxisMin,
      yAxisMax,
      yAxisMinDelta,
      yAxisMaxDelta,
      chartReady,
    };
  }, [apiData]);

  if (loading) {
    return (
      <div className="container mx-auto py-8 text-center">Loading data...</div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 text-center text-red-500">
        Error: {error}
      </div>
    );
  }

  if (!apiData || !processedData) {
    return (
      <div className="container mx-auto py-8 text-center">
        No data available or failed to process data.
      </div>
    );
  }

  const { dateRange, individualPerformance, performanceDeltas, deltaNote } =
    apiData;
  const {
    combinedData,
    yAxisMin,
    yAxisMax,
    yAxisMinDelta,
    yAxisMaxDelta,
    chartReady,
  } = processedData;

  const ebiPerfData = individualPerformance.ebi;
  const vtiPerfData = individualPerformance.vti;
  const iwvPerfData = individualPerformance.iwv;
  const iwnPerfData = individualPerformance.iwn;
  const vtvPerfData = individualPerformance.vtv;

  // Data for the new table
  const symbolDisplayData = [
    {
      symbol: "EBI",
      name: "iShares ESG Aware MSCI EM ETF",
      perfData: ebiPerfData,
      deltaKey: "ebi_iwv",
      description: "iShares ESG Aware MSCI EM ETF",
    },
    {
      symbol: "IWN",
      name: "iShares Russell 2000 Value ETF",
      perfData: iwnPerfData,
      deltaKey: "iwn_iwv",
      description: "iShares Russell 2000 Value ETF",
    },
    {
      symbol: "VTV",
      name: "Vanguard Value ETF",
      perfData: vtvPerfData,
      deltaKey: "vtv_iwv",
      description: "Vanguard Value ETF",
    },
    // VTI is listed after the benchmark
    {
      symbol: "VTI",
      name: "Vanguard Total Stock Market ETF",
      perfData: vtiPerfData,
      deltaKey: "vti_iwv",
      description: "Vanguard Total Stock Market ETF",
    },
  ];

  const benchmarkSymbolData = {
    symbol: "IWV",
    name: "iShares Russell 3000 ETF",
    perfData: iwvPerfData,
    description: "iShares Russell 3000 ETF (Benchmark)",
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">ETF Performance Dashboard</h1>
      <p className="text-gray-500 mb-8">
        {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
      </p>

      {/* Performance Summary Table - REPLACES THE CARDS */}
      <div className="mb-8 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 shadow-sm rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6"
              >
                Symbol
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell sm:px-6"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6"
              >
                Performance
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6"
              >
                Delta vs IWV
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sm:px-6"
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {symbolDisplayData.slice(0, 3).map((item) => (
              <tr key={item.symbol} className="hover:bg-gray-50">
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sm:px-6">
                  <div className="font-bold">{item.symbol}</div>
                  <div className="text-xs text-gray-500 sm:hidden">
                    {item.name}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell sm:px-6">
                  {item.description}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm sm:px-6">
                  {item.perfData && !item.perfData.error ? (
                    <span
                      className={`flex items-center font-semibold ${
                        item.perfData.performance &&
                        Number.parseFloat(item.perfData.performance) < 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {item.perfData.performance &&
                      Number.parseFloat(item.perfData.performance) < 0 ? (
                        <ArrowDownIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ArrowUpIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      )}
                      {item.perfData.performance || "N/A"}
                    </span>
                  ) : (
                    <span className="text-red-500">
                      {item.perfData?.error || "Data Unavailable"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm sm:px-6">
                  {performanceDeltas &&
                  item.deltaKey &&
                  performanceDeltas[item.deltaKey] !== undefined &&
                  typeof performanceDeltas[item.deltaKey] === "number" ? (
                    <span
                      className={`flex items-center font-semibold ${
                        (performanceDeltas[item.deltaKey] as number) < 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {(performanceDeltas[item.deltaKey] as number) < 0 ? (
                        <ArrowDownIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ArrowUpIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      )}
                      {(performanceDeltas[item.deltaKey] as number).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm sm:px-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadHoldings(item.symbol)}
                    className="flex items-center gap-1"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </td>
              </tr>
            ))}

            {/* Separator Row for IWV (Baseline) */}
            <tr className="bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-800 sm:px-6">
                {benchmarkSymbolData.symbol}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 hidden sm:table-cell sm:px-6">
                {benchmarkSymbolData.description}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold sm:px-6">
                {benchmarkSymbolData.perfData &&
                !benchmarkSymbolData.perfData.error ? (
                  <span
                    className={`flex items-center ${
                      benchmarkSymbolData.perfData.performance &&
                      Number.parseFloat(
                        benchmarkSymbolData.perfData.performance
                      ) < 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {benchmarkSymbolData.perfData.performance &&
                    Number.parseFloat(
                      benchmarkSymbolData.perfData.performance
                    ) < 0 ? (
                      <ArrowDownIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                    ) : (
                      <ArrowUpIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                    )}
                    {benchmarkSymbolData.perfData.performance || "N/A"}
                  </span>
                ) : (
                  <span className="text-red-500">
                    {benchmarkSymbolData.perfData?.error || "Data Unavailable"}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-400 sm:px-6">
                Baseline
              </td>
            </tr>

            {/* VTI Row (after separator) */}
            {symbolDisplayData.slice(3).map((item) => (
              <tr key={item.symbol} className="hover:bg-gray-50">
                <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sm:px-6">
                  <div className="font-bold">{item.symbol}</div>
                  <div className="text-xs text-gray-500 sm:hidden">
                    {item.name}
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 hidden sm:table-cell sm:px-6">
                  {item.description}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm sm:px-6">
                  {item.perfData && !item.perfData.error ? (
                    <span
                      className={`flex items-center font-semibold ${
                        item.perfData.performance &&
                        Number.parseFloat(item.perfData.performance) < 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {item.perfData.performance &&
                      Number.parseFloat(item.perfData.performance) < 0 ? (
                        <ArrowDownIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ArrowUpIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      )}
                      {item.perfData.performance || "N/A"}
                    </span>
                  ) : (
                    <span className="text-red-500">
                      {item.perfData?.error || "Data Unavailable"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm sm:px-6">
                  {performanceDeltas &&
                  item.deltaKey &&
                  performanceDeltas[item.deltaKey] !== undefined &&
                  typeof performanceDeltas[item.deltaKey] === "number" ? (
                    <span
                      className={`flex items-center font-semibold ${
                        (performanceDeltas[item.deltaKey] as number) < 0
                          ? "text-red-600"
                          : "text-green-600"
                      }`}
                    >
                      {(performanceDeltas[item.deltaKey] as number) < 0 ? (
                        <ArrowDownIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ArrowUpIcon className="mr-1 h-4 w-4 flex-shrink-0" />
                      )}
                      {(performanceDeltas[item.deltaKey] as number).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-gray-400">N/A</span>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-sm sm:px-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadHoldings(item.symbol)}
                    className="flex items-center gap-1"
                  >
                    <DownloadIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">Download</span>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Portfolio Approximation Section */}
      <div className="mb-8">
        <PortfolioApproximation />
      </div>

      {/* Portfolio Comparison Section */}
      <div className="mb-8">
        <PortfolioComparison />
      </div>

      {/* Charts Section */}
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Performance Chart</CardTitle>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      Normalized percentage change from start date (top chart).
                      Delta percentage change against IWV (bottom chart).
                    </p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            {!chartReady ? (
              <div className="h-[500px] flex items-center justify-center text-gray-500">
                Chart data is currently unavailable. This might be due to
                missing historical price data for key ETFs.
              </div>
            ) : (
              <Tabs defaultValue="percentageChange">
                <TabsList className="mb-4">
                  <TabsTrigger value="percentageChange">% Change</TabsTrigger>
                  <TabsTrigger value="percentageDelta">% Delta</TabsTrigger>
                </TabsList>

                <TabsContent value="percentageChange" className="h-[500px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={0}
                    minHeight={300}
                  >
                    <LineChart
                      data={combinedData}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorEBI"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8884d8"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8884d8"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorVTI"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#82ca9d"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#82ca9d"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorIWV"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#ffc658"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#ffc658"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorIWN"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#ff7300"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#ff7300"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorVTV"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#387908"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#387908"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        domain={[yAxisMin, yAxisMax]}
                        tickFormatter={(value) => `${value.toFixed(0)}%`}
                        allowDataOverflow={true}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      {combinedData[0]?.EBI_norm !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="EBI"
                            dataKey="EBI_norm"
                            stroke="#8884d8"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      {combinedData[0]?.IWN_norm !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="IWN"
                            dataKey="IWN_norm"
                            stroke="#ff7300"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      {combinedData[0]?.VTV_norm !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="VTV"
                            dataKey="VTV_norm"
                            stroke="#387908"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      {combinedData[0]?.VTI_norm !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="VTI"
                            dataKey="VTI_norm"
                            stroke="#82ca9d"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      {combinedData[0]?.IWV_norm !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="IWV (Benchmark)"
                            dataKey="IWV_norm"
                            stroke="#ffc658"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      <ReferenceLine
                        y={100}
                        stroke="#666"
                        strokeDasharray="3 3"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>

                <TabsContent value="percentageDelta" className="h-[500px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                    minWidth={0}
                    minHeight={300}
                  >
                    <LineChart
                      data={combinedData.filter(
                        (d) =>
                          d.EBI_delta_IWV !== undefined ||
                          d.IWN_delta_IWV !== undefined ||
                          d.VTV_delta_IWV !== undefined
                      )}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <defs>
                        {/* Reusing base colors for delta charts for simplicity */}
                        <linearGradient
                          id="colorEBIDelta"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#8884d8"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#8884d8"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorIWNDelta"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#ff7300"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#ff7300"
                            stopOpacity={0}
                          />
                        </linearGradient>
                        <linearGradient
                          id="colorVTVDelta"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="#387908"
                            stopOpacity={0.3}
                          />
                          <stop
                            offset="95%"
                            stopColor="#387908"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        domain={[yAxisMinDelta, yAxisMaxDelta]}
                        tickFormatter={(value) => `${value.toFixed(1)}%`}
                        allowDataOverflow={true}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      {combinedData[0]?.EBI_delta_IWV !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="EBI vs IWV"
                            dataKey="EBI_delta_IWV"
                            stroke="#8884d8"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      {combinedData[0]?.IWN_delta_IWV !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="IWN vs IWV"
                            dataKey="IWN_delta_IWV"
                            stroke="#ff7300"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      {combinedData[0]?.VTV_delta_IWV !== undefined && (
                        <>
                          <Line
                            type="monotone"
                            name="VTV vs IWV"
                            dataKey="VTV_delta_IWV"
                            stroke="#387908"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 6 }}
                            connectNulls={true}
                          />
                        </>
                      )}
                      <ReferenceLine
                        y={0}
                        stroke="#666"
                        strokeDasharray="3 3"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
      {deltaNote && <p className="mt-8 text-sm text-gray-600">{deltaNote}</p>}
    </div>
  );
}
