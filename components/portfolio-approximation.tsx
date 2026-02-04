"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

interface PortfolioApproximationData {
  timestamp: string;
  optimalWeights: {
    vti: number;
    vtv: number;
    iwn: number;
  };
  weightsPercentages: {
    vti: number;
    vtv: number;
    iwn: number;
  };
  optimizationMetrics: {
    finalObjectiveValue: number;
    initialObjectiveValue: number;
    improvementPercent: number;
    averageError: number;
    maxError: number;
    errorCount: number;
    totalStocks: number;
  };
  constraints: {
    weightsSum: number;
    allWeightsNonNegative: boolean;
    allWeightsLessThanOne: boolean;
  };
  analysis?: {
    trackingError: number;
    errorRate: number;
    confidence: string;
  };
}

export function PortfolioApproximation() {
  const [data, setData] = useState<PortfolioApproximationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch("/api/portfolio-approximation", {
        method: isRefresh ? "POST" : "GET",
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      const result: PortfolioApproximationData = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch portfolio approximation data:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to load data. Please run the approximation script first.";
      setError(errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    fetchData(true);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl">Portfolio Approximation</CardTitle>
          <CardDescription className="text-sm">Loading optimization results...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-lg md:text-xl">Portfolio Approximation</CardTitle>
          <CardDescription className="text-red-500 text-sm">
            {error || "No data available"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 md:p-6">
          <p className="text-xs md:text-sm text-gray-600">
            Run the approximation script to generate results.
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "High":
        return "bg-green-100 text-green-800";
      case "Medium":
        return "bg-yellow-100 text-yellow-800";
      case "Low":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const etfData = [
    {
      symbol: "VTI",
      name: "Vanguard Total Stock Market ETF",
      weight: data.weightsPercentages.vti,
      color: "#82ca9d",
    },
    {
      symbol: "VTV",
      name: "Vanguard Value ETF",
      weight: data.weightsPercentages.vtv,
      color: "#387908",
    },
    {
      symbol: "IWN",
      name: "iShares Russell 2000 Value ETF",
      weight: data.weightsPercentages.iwn,
      color: "#ff7300",
    },
  ];

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="text-lg md:text-xl">Portfolio Approximation Results</CardTitle>
            <CardDescription className="text-sm">
              Optimal weights to approximate EBI holdings using VTI, VTV, and
              IWN
              <br />
              <span className="text-xs text-gray-500">
                Last updated: {formatDate(data.timestamp)}
              </span>
            </CardDescription>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            {refreshing ? "Running..." : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 md:space-y-6 p-4 md:p-6">
        {/* Optimal Weights */}
        <div>
          <h3 className="text-base md:text-lg font-semibold mb-2 md:mb-3">Optimal Weights</h3>
          <div className="space-y-3">
            {etfData.map((etf) => (
              <div key={etf.symbol} className="space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-sm md:text-base">{etf.symbol}</span>
                    <span className="text-xs md:text-sm text-gray-500 ml-2 hidden sm:inline">
                      {etf.name}
                    </span>
                  </div>
                  <span className="font-semibold text-sm md:text-base flex-shrink-0">
                    {etf.weight.toFixed(2)}%
                  </span>
                </div>
                <Progress
                  value={etf.weight}
                  className="h-2"
                  style={
                    {
                      "--progress-color": etf.color,
                    } as React.CSSProperties
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced Analysis */}
        {data.analysis && (
          <div>
            <h3 className="text-base md:text-lg font-semibold mb-2 md:mb-3">Analysis</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs md:text-sm text-gray-600">Tracking Error:</span>
                  <span className="font-medium text-sm md:text-base">
                    {(data.analysis.trackingError * 100).toFixed(4)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs md:text-sm text-gray-600">Error Rate:</span>
                  <span className="font-medium text-sm md:text-base">
                    {data.analysis.errorRate.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs md:text-sm text-gray-600">Confidence:</span>
                  <Badge
                    className={getConfidenceColor(data.analysis.confidence)}
                  >
                    {data.analysis.confidence}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs md:text-sm text-gray-600">Improvement:</span>
                  <span className="font-medium text-green-600 flex items-center text-sm md:text-base">
                    <TrendingUp className="h-3 w-3 md:h-4 md:w-4 mr-1" />+
                    {data.optimizationMetrics.improvementPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs md:text-sm text-gray-600">Avg Error:</span>
                  <span className="font-medium text-sm md:text-base">
                    {(data.optimizationMetrics.averageError * 100).toFixed(4)}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs md:text-sm text-gray-600">Max Error:</span>
                  <span className="font-medium text-red-600 flex items-center text-sm md:text-base">
                    <AlertTriangle className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                    {(data.optimizationMetrics.maxError * 100).toFixed(4)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Optimization Metrics */}
        <div>
          <h3 className="text-base md:text-lg font-semibold mb-2 md:mb-3">Optimization Metrics</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs md:text-sm text-gray-600">Final Error:</span>
                <span className="font-medium text-sm md:text-base">
                  {data.optimizationMetrics.finalObjectiveValue.toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs md:text-sm text-gray-600">Stocks w/ Error:</span>
                <span className="font-medium text-sm md:text-base">
                  {data.optimizationMetrics.errorCount}/
                  {data.optimizationMetrics.totalStocks}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs md:text-sm text-gray-600">Total Stocks:</span>
                <span className="font-medium text-sm md:text-base">
                  {data.optimizationMetrics.totalStocks.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Constraints Validation */}
        <div>
          <h3 className="text-base md:text-lg font-semibold mb-2 md:mb-3">Constraints Validation</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs md:text-sm text-gray-600">
                Weights sum to 100%:
              </span>
              <Badge
                variant={
                  data.constraints.weightsSum >= 0.999 &&
                  data.constraints.weightsSum <= 1.001
                    ? "default"
                    : "destructive"
                }
                className="text-xs"
              >
                {data.constraints.weightsSum.toFixed(6)}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs md:text-sm text-gray-600">All weights ≥ 0:</span>
              <Badge
                variant={
                  data.constraints.allWeightsNonNegative
                    ? "default"
                    : "destructive"
                }
                className="text-xs"
              >
                {data.constraints.allWeightsNonNegative ? "✓" : "✗"}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs md:text-sm text-gray-600">All weights ≤ 100%:</span>
              <Badge
                variant={
                  data.constraints.allWeightsLessThanOne
                    ? "default"
                    : "destructive"
                }
                className="text-xs"
              >
                {data.constraints.allWeightsLessThanOne ? "✓" : "✗"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
          <h4 className="font-semibold mb-2 text-sm md:text-base">Summary</h4>
          <p className="text-xs md:text-sm text-gray-600">
            The optimization algorithm found that EBI holdings can be best
            approximated using
            <strong> {data.weightsPercentages.vti.toFixed(1)}% VTI</strong>,
            <strong> {data.weightsPercentages.vtv.toFixed(1)}% VTV</strong>, and
            <strong> {data.weightsPercentages.iwn.toFixed(1)}% IWN</strong>.
            This combination achieves a{" "}
            {data.optimizationMetrics.improvementPercent.toFixed(1)}%
            improvement over the initial guess with an average error of{" "}
            {(data.optimizationMetrics.averageError * 100).toFixed(4)}%.
            {data.analysis && (
              <>
                {" "}
                The tracking error is{" "}
                {(data.analysis.trackingError * 100).toFixed(4)}% with{" "}
                <span
                  className={`font-medium ${getConfidenceColor(
                    data.analysis.confidence
                  )}`}
                >
                  {data.analysis.confidence.toLowerCase()}
                </span>{" "}
                confidence.
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
