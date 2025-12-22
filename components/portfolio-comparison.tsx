"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useEffect, useState } from "react";

interface PerformanceData {
  date: string;
  ebi: number;
  approximated: number;
  difference: number;
}

interface PortfolioComparisonProps {
  approximationWeights?: {
    vti: number;
    vtv: number;
    iwn: number;
  };
}

export function PortfolioComparison({
  approximationWeights,
}: PortfolioComparisonProps) {
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [weights, setWeights] = useState<{
    vti: number;
    vtv: number;
    iwn: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch weights from API if not provided
  useEffect(() => {
    const fetchWeights = async () => {
      if (approximationWeights) {
        setWeights(approximationWeights);
        return;
      }

      try {
        const response = await fetch("/api/portfolio-approximation");
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        setWeights(data.optimalWeights);
      } catch (err) {
        console.error("Failed to fetch approximation weights:", err);
        setError("Failed to load approximation weights");
      }
    };

    fetchWeights();
  }, [approximationWeights]);

  useEffect(() => {
    if (!weights) return;

    const fetchPerformanceData = async () => {
      try {
        const response = await fetch("/api/performance");
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        // Calculate approximated portfolio performance
        const historicalPrices = data.historicalPrices;
        const combinedData: PerformanceData[] = [];

        if (historicalPrices.ebi && Array.isArray(historicalPrices.ebi)) {
          historicalPrices.ebi.forEach((entry: { date: string; close: number }) => {
            const date = entry.date;
            const ebiPrice = entry.close;

            // Get corresponding prices for VTI, VTV, IWN
            const vtiEntry = historicalPrices.vti?.find(
              (d: { date: string; close: number }) => d.date === date
            );
            const vtvEntry = historicalPrices.vtv?.find(
              (d: { date: string; close: number }) => d.date === date
            );
            const iwnEntry = historicalPrices.iwn?.find(
              (d: { date: string; close: number }) => d.date === date
            );

            if (vtiEntry && vtvEntry && iwnEntry) {
              const vtiPrice = vtiEntry.close;
              const vtvPrice = vtvEntry.close;
              const iwnPrice = iwnEntry.close;

              // Calculate weighted portfolio value
              const approximatedValue =
                vtiPrice * weights.vti +
                vtvPrice * weights.vtv +
                iwnPrice * weights.iwn;

              // Normalize to percentage change from first day
              const firstEbiPrice = historicalPrices.ebi[0]?.close;
              const firstVtiPrice = historicalPrices.vti[0]?.close;
              const firstVtvPrice = historicalPrices.vtv[0]?.close;
              const firstIwnPrice = historicalPrices.iwn[0]?.close;

              if (
                firstEbiPrice &&
                firstVtiPrice &&
                firstVtvPrice &&
                firstIwnPrice
              ) {
                const firstApproximatedValue =
                  firstVtiPrice * weights.vti +
                  firstVtvPrice * weights.vtv +
                  firstIwnPrice * weights.iwn;

                const ebiNormalized = (ebiPrice / firstEbiPrice) * 100;
                const approximatedNormalized =
                  (approximatedValue / firstApproximatedValue) * 100;

                combinedData.push({
                  date,
                  ebi: ebiNormalized,
                  approximated: approximatedNormalized,
                  difference: approximatedNormalized - ebiNormalized,
                });
              }
            }
          });
        }

        setPerformanceData(combinedData);
      } catch (err) {
        console.error("Failed to fetch performance data:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to load performance data";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchPerformanceData();
  }, [weights]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      name?: string;
      value?: number;
      color?: string;
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
                {entry.name}: {entry.value !== undefined ? entry.value.toFixed(2) : 'N/A'}%
              </p>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading || !weights) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Performance Comparison</CardTitle>
          <CardDescription>Loading performance data...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || performanceData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio Performance Comparison</CardTitle>
          <CardDescription className="text-red-500">
            {error || "No performance data available"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Calculate performance statistics
  const lastEntry = performanceData[performanceData.length - 1];

  const ebiPerformance = lastEntry ? lastEntry.ebi - 100 : 0;
  const approximatedPerformance = lastEntry ? lastEntry.approximated - 100 : 0;
  const trackingDifference = approximatedPerformance - ebiPerformance;

  const avgTrackingError =
    performanceData.reduce(
      (sum, entry) => sum + Math.abs(entry.difference),
      0
    ) / performanceData.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Performance Comparison</CardTitle>
        <CardDescription>
          Comparing actual EBI performance vs approximated portfolio performance
          <br />
          <span className="text-xs text-gray-500">
            Weights: VTI {(weights.vti * 100).toFixed(1)}%, VTV{" "}
            {(weights.vtv * 100).toFixed(1)}%, IWN{" "}
            {(weights.iwn * 100).toFixed(1)}%
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Performance Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {ebiPerformance.toFixed(2)}%
            </div>
            <div className="text-sm text-gray-600">EBI Performance</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {approximatedPerformance.toFixed(2)}%
            </div>
            <div className="text-sm text-gray-600">
              Approximated Performance
            </div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div
              className={`text-2xl font-bold ${
                trackingDifference >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {trackingDifference >= 0 ? "+" : ""}
              {trackingDifference.toFixed(2)}%
            </div>
            <div className="text-sm text-gray-600">Tracking Difference</div>
          </div>
        </div>

        {/* Performance Chart */}
        <div className="h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={performanceData}
              margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                domain={[90, 120]}
                tickFormatter={(value) => `${value.toFixed(0)}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <ReferenceLine y={100} stroke="#666" strokeDasharray="3 3" />
              <Line
                type="monotone"
                name="EBI (Actual)"
                dataKey="ebi"
                stroke="#8884d8"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                name="Approximated Portfolio"
                dataKey="approximated"
                stroke="#82ca9d"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tracking Error Analysis */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold mb-2">Tracking Error Analysis</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Average Tracking Error:</span>
              <span className="font-medium ml-2">
                {avgTrackingError.toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="text-gray-600">Final Tracking Error:</span>
              <span className="font-medium ml-2">
                {trackingDifference.toFixed(2)}%
              </span>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Positive values indicate the approximated portfolio outperformed
            EBI. Negative values indicate EBI outperformed the approximation.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
