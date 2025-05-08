"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Area, ReferenceLine } from "recharts";
import React, { useEffect, useState, useMemo } from "react";

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
  iwn?: PerformanceData; // Optional based on original API output
  vtv?: PerformanceData; // Optional based on original API output
}

interface HistoricalPrices {
  ebi: PerformanceEntry[] | PerformanceError;
  vti: PerformanceEntry[] | PerformanceError;
  iwv: PerformanceEntry[] | PerformanceError;
  iwn?: PerformanceEntry[] | PerformanceError; // Optional
  vtv?: PerformanceEntry[] | PerformanceError; // Optional
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
  delta?: number; // Delta between EBI and IWV
}

interface ProcessedData {
  combinedData: CombinedChartData[];
  yAxisMin: number;
  yAxisMax: number;
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
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length && label) {
    return (
      <div className="bg-white p-4 border rounded-lg shadow-sm">
        <p className="font-medium">{formatDate(label)}</p>
        <div className="mt-2 space-y-1">
          {payload.map((entry: any, index: number) => (
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

    const ebiPerf = individualPerformance.ebi;
    const vtiPerf = individualPerformance.vti;
    const iwvPerf = individualPerformance.iwv;

    let chartReady = false;
    let combinedData: CombinedChartData[] = [];

    if (
      Array.isArray(ebiHist) &&
      ebiPerf &&
      typeof ebiPerf.startPrice === "number"
    ) {
      chartReady = true; // At least EBI data is available for the chart.
      combinedData = ebiHist.map((item, index) => {
        const ebiNorm = (item.close / (ebiPerf.startPrice as number)) * 100;
        let vtiNorm: number | undefined = undefined;
        let iwvNorm: number | undefined = undefined;
        let delta: number | undefined = undefined;

        if (
          Array.isArray(vtiHist) &&
          vtiPerf &&
          typeof vtiPerf.startPrice === "number" &&
          vtiHist[index]
        ) {
          vtiNorm =
            (vtiHist[index].close / (vtiPerf.startPrice as number)) * 100;
        }

        if (
          Array.isArray(iwvHist) &&
          iwvPerf &&
          typeof iwvPerf.startPrice === "number" &&
          iwvHist[index]
        ) {
          iwvNorm =
            (iwvHist[index].close / (iwvPerf.startPrice as number)) * 100;
        }

        if (typeof ebiNorm === "number" && typeof iwvNorm === "number") {
          delta = ebiNorm - iwvNorm;
        }

        const result: CombinedChartData = {
          date: item.date,
          EBI_norm: ebiNorm,
        };
        if (vtiNorm !== undefined) result.VTI_norm = vtiNorm;
        if (iwvNorm !== undefined) result.IWV_norm = iwvNorm;
        if (delta !== undefined) result.delta = delta;
        return result;
      });
    } else {
      // Fallback if EBI historical data or start price isn't available.
      // Try to build based on IWV or VTI if they exist, for completeness, though EBI is primary.
      // This part can be expanded if other series should drive the date range.
      // For now, if EBI isn't there, we assume no primary series for chart x-axis.
      if (
        Array.isArray(iwvHist) &&
        iwvPerf &&
        typeof iwvPerf.startPrice === "number"
      ) {
        chartReady = true;
        combinedData = iwvHist.map((item, index) => {
          const iwvNorm = (item.close / (iwvPerf.startPrice as number)) * 100;
          // Potentially add VTI if available here too
          return { date: item.date, IWV_norm: iwvNorm };
        });
      }
    }

    if (!chartReady || combinedData.length === 0) {
      return {
        combinedData: [],
        yAxisMin: 80,
        yAxisMax: 120,
        chartReady: false,
      };
    }

    const allValues = combinedData
      .flatMap((item) => [item.EBI_norm, item.VTI_norm, item.IWV_norm])
      .filter((v): v is number => typeof v === "number" && !isNaN(v));

    const minValue =
      allValues.length > 0 ? Math.floor(Math.min(...allValues)) : 90;
    const maxValue =
      allValues.length > 0 ? Math.ceil(Math.max(...allValues)) : 110;

    const range = Math.max(100 - minValue, maxValue - 100);
    // Ensure yAxisMin and yAxisMax are reasonable, provide defaults if range is 0
    const yAxisMin = range > 0 ? Math.max(80, 100 - range - 5) : 80;
    const yAxisMax = range > 0 ? Math.min(120, 100 + range + 5) : 120;

    return { combinedData, yAxisMin, yAxisMax, chartReady };
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
  const { combinedData, yAxisMin, yAxisMax, chartReady } = processedData;

  const ebiPerfData = individualPerformance.ebi;
  const vtiPerfData = individualPerformance.vti;
  const iwvPerfData = individualPerformance.iwv;

  // Find the min and max values for the chart to set appropriate y-axis domain
  // const allValues = combinedData.flatMap((item) => [ // Moved to useMemo
  // item.EBI_norm,
  // item.VTI_norm,
  // item.IWV_norm,
  // ]);
  // const minValue = Math.floor(Math.min(...allValues)); // Moved to useMemo
  // const maxValue = Math.ceil(Math.max(...allValues)); // Moved to useMemo

  // Calculate the range to ensure 100% is in the middle
  // const range = Math.max(100 - minValue, maxValue - 100); // Moved to useMemo
  // const yAxisMin = Math.max(80, 100 - range - 5); // Add some padding // Moved to useMemo
  // const yAxisMax = Math.min(120, 100 + range + 5); // Add some padding // Moved to useMemo

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">ETF Performance Dashboard</h1>
      <p className="text-gray-500 mb-8">
        {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
      </p>

      {/* Performance Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* EBI Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">EBI</CardTitle>
            <CardDescription>iShares ESG Aware MSCI EM ETF</CardDescription>
          </CardHeader>
          <CardContent>
            {ebiPerfData && !ebiPerfData.error ? (
              <div className="flex flex-col space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Performance</p>
                  <p
                    className={`text-xl font-medium flex items-center ${
                      ebiPerfData.performance &&
                      Number.parseFloat(ebiPerfData.performance) < 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {ebiPerfData.performance &&
                    Number.parseFloat(ebiPerfData.performance) < 0 ? (
                      <ArrowDownIcon className="mr-1 h-4 w-4" />
                    ) : (
                      <ArrowUpIcon className="mr-1 h-4 w-4" />
                    )}
                    {ebiPerfData.performance || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">vs IWV (Benchmark)</p>
                  <p
                    className={`text-xl font-medium flex items-center ${
                      typeof performanceDeltas.ebi_iwv === "number" &&
                      performanceDeltas.ebi_iwv < 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {typeof performanceDeltas.ebi_iwv === "number" &&
                    performanceDeltas.ebi_iwv < 0 ? (
                      <ArrowDownIcon className="mr-1 h-4 w-4" />
                    ) : (
                      <ArrowUpIcon className="mr-1 h-4 w-4" />
                    )}
                    {typeof performanceDeltas.ebi_iwv === "number"
                      ? `${performanceDeltas.ebi_iwv.toFixed(2)}%`
                      : performanceDeltas.ebi_iwv || "N/A"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-red-500">
                {ebiPerfData?.error || "Data unavailable for EBI"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* VTI Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">VTI</CardTitle>
            <CardDescription>Vanguard Total Stock Market ETF</CardDescription>
          </CardHeader>
          <CardContent>
            {vtiPerfData && !vtiPerfData.error ? (
              <div className="flex flex-col space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Performance</p>
                  <p
                    className={`text-xl font-medium flex items-center ${
                      vtiPerfData.performance &&
                      Number.parseFloat(vtiPerfData.performance) < 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {vtiPerfData.performance &&
                    Number.parseFloat(vtiPerfData.performance) < 0 ? (
                      <ArrowDownIcon className="mr-1 h-4 w-4" />
                    ) : (
                      <ArrowUpIcon className="mr-1 h-4 w-4" />
                    )}
                    {vtiPerfData.performance || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">vs IWV (Benchmark)</p>
                  <p
                    className={`text-xl font-medium flex items-center ${
                      typeof performanceDeltas.vti_iwv === "number" &&
                      performanceDeltas.vti_iwv < 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {typeof performanceDeltas.vti_iwv === "number" &&
                    performanceDeltas.vti_iwv < 0 ? (
                      <ArrowDownIcon className="mr-1 h-4 w-4" />
                    ) : (
                      <ArrowUpIcon className="mr-1 h-4 w-4" />
                    )}
                    {typeof performanceDeltas.vti_iwv === "number"
                      ? `${performanceDeltas.vti_iwv.toFixed(2)}%`
                      : performanceDeltas.vti_iwv || "N/A"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-red-500">
                {vtiPerfData?.error || "Data unavailable for VTI"}
              </p>
            )}
          </CardContent>
        </Card>

        {/* IWV Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">IWV</CardTitle>
            <CardDescription>
              iShares Russell 3000 ETF (Benchmark)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {iwvPerfData && !iwvPerfData.error ? (
              <div className="flex flex-col space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Performance</p>
                  <p
                    className={`text-xl font-medium flex items-center ${
                      iwvPerfData.performance &&
                      Number.parseFloat(iwvPerfData.performance) < 0
                        ? "text-red-600"
                        : "text-green-600"
                    }`}
                  >
                    {iwvPerfData.performance &&
                    Number.parseFloat(iwvPerfData.performance) < 0 ? (
                      <ArrowDownIcon className="mr-1 h-4 w-4" />
                    ) : (
                      <ArrowUpIcon className="mr-1 h-4 w-4" />
                    )}
                    {iwvPerfData.performance || "N/A"}
                  </p>
                </div>
                {/* IWV is the benchmark, so no "vs IWV" here */}
              </div>
            ) : (
              <p className="text-red-500">
                {iwvPerfData?.error || "Data unavailable for IWV"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="space-y-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Percentage Change</CardTitle>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-gray-400" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs">
                      This chart shows the percentage change over the selected
                      time period, normalized to 100% at the start date.
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
              <Tabs defaultValue="EBI">
                <TabsList className="mb-4">
                  <TabsTrigger value="ebi">EBI</TabsTrigger>
                  <TabsTrigger value="iwv">IWV</TabsTrigger>
                  <TabsTrigger value="delta">EBI vs IWV</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
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
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                        // interval="preserveStartEnd" // To ensure first and last ticks are shown
                        // minTickGap={30} // Adjust for density
                      />
                      <YAxis
                        domain={[yAxisMin, yAxisMax]}
                        tickFormatter={(value) => `${value.toFixed(0)}%`} // Simpler tick format
                        // ticks={[85, 90, 95, 100, 105, 110, 115]} // Keep or make dynamic
                        allowDataOverflow={true}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      {combinedData[0]?.EBI_norm !== undefined && (
                        <>
                          <Area
                            type="monotone"
                            name="EBI"
                            dataKey="EBI_norm"
                            stroke="#8884d8"
                            fillOpacity={1}
                            fill="url(#colorEBI)"
                            strokeWidth={0}
                            connectNulls={true}
                          />
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
                      {combinedData[0]?.VTI_norm !== undefined && (
                        <>
                          <Area
                            type="monotone"
                            name="VTI"
                            dataKey="VTI_norm"
                            stroke="#82ca9d"
                            fillOpacity={1}
                            fill="url(#colorVTI)"
                            strokeWidth={0}
                            connectNulls={true}
                          />
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
                          <Area
                            type="monotone"
                            name="IWV"
                            dataKey="IWV_norm"
                            stroke="#ffc658"
                            fillOpacity={1}
                            fill="url(#colorIWV)"
                            strokeWidth={0}
                            connectNulls={true}
                          />
                          <Line
                            type="monotone"
                            name="IWV"
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

                <TabsContent value="ebi" className="h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={combinedData.filter(
                        (d) => d.EBI_norm !== undefined
                      )}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorEBISolo"
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
                        // ticks={[85, 90, 95, 100, 105, 110, 115]}
                        allowDataOverflow={true}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area
                        type="monotone"
                        name="EBI"
                        dataKey="EBI_norm"
                        stroke="#8884d8"
                        fillOpacity={1}
                        fill="url(#colorEBISolo)"
                        strokeWidth={0}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        name="EBI"
                        dataKey="EBI_norm"
                        stroke="#8884d8"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                        connectNulls={true}
                      />
                      <ReferenceLine
                        y={100}
                        stroke="#666"
                        strokeDasharray="3 3"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>

                <TabsContent value="iwv" className="h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={combinedData.filter(
                        (d) => d.IWV_norm !== undefined
                      )}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorIWVSolo"
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
                        // ticks={[85, 90, 95, 100, 105, 110, 115]}
                        allowDataOverflow={true}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Area
                        type="monotone"
                        name="IWV"
                        dataKey="IWV_norm"
                        stroke="#ffc658"
                        fillOpacity={1}
                        fill="url(#colorIWVSolo)"
                        strokeWidth={0}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        name="IWV"
                        dataKey="IWV_norm"
                        stroke="#ffc658"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                        connectNulls={true}
                      />
                      <ReferenceLine
                        y={100}
                        stroke="#666"
                        strokeDasharray="3 3"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>

                <TabsContent value="delta" className="h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={combinedData.filter((d) => d.delta !== undefined)}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient
                          id="colorDelta"
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
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        domain={[-5, 5]} // Adjusted domain for delta if needed
                        tickFormatter={(value) => `${value.toFixed(1)}%`}
                        allowDataOverflow={true}
                      />
                      <Tooltip
                        formatter={(value: any, name: string) => [
                          // Added name argument
                          `${
                            typeof value === "number" ? value.toFixed(2) : value
                          }%`, // Check value type
                          name === "delta" ? "EBI vs IWV Delta" : name, // Make name more descriptive
                        ]}
                        labelFormatter={formatDate}
                      />
                      <Legend />
                      <Area
                        type="monotone"
                        name="EBI vs IWV Delta"
                        dataKey="delta"
                        stroke="#ff7300"
                        fillOpacity={1}
                        fill="url(#colorDelta)"
                        strokeWidth={0}
                        connectNulls={true}
                      />
                      <Line
                        type="monotone"
                        name="EBI vs IWV Delta"
                        dataKey="delta"
                        stroke="#ff7300"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6 }}
                        connectNulls={true}
                      />
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
