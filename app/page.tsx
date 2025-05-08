"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ArrowDownIcon, ArrowUpIcon, InfoIcon } from "lucide-react"
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Area, ReferenceLine } from "recharts"

// Data from the provided JSON
const data = {
  dateRange: {
    startDate: "2025-03-01",
    endDate: "2025-05-08",
  },
  individualPerformance: {
    ebi: {
      startDate: "2025-03-03",
      startPrice: 49,
      endDate: "2025-05-07",
      endPrice: 46.69,
      performance: "-4.71%",
    },
    vti: {
      startDate: "2025-03-03",
      startPrice: 287.71,
      endDate: "2025-05-07",
      endPrice: 276.11,
      performance: "-4.03%",
    },
    iwv: {
      startDate: "2025-03-03",
      startPrice: 332.03,
      endDate: "2025-05-07",
      endPrice: 318.9,
      performance: "-3.95%",
    },
  },
  performanceDeltas: {
    ebi_vti: -0.68,
    ebi_iwv: -0.76,
    vti_iwv: -0.08,
  },
  historicalPrices: {
    ebi: [
      { date: "2025-03-03", close: 49 },
      { date: "2025-03-04", close: 48.33 },
      { date: "2025-03-05", close: 48.83 },
      { date: "2025-03-06", close: 48.13 },
      { date: "2025-03-07", close: 48.45 },
      { date: "2025-03-10", close: 47.23 },
      { date: "2025-03-11", close: 46.93 },
      { date: "2025-03-12", close: 46.96 },
      { date: "2025-03-13", close: 46.26 },
      { date: "2025-03-14", close: 47.34 },
      { date: "2025-03-17", close: 47.79 },
      { date: "2025-03-18", close: 47.39 },
      { date: "2025-03-19", close: 47.96 },
      { date: "2025-03-20", close: 47.79 },
      { date: "2025-03-21", close: 47.66 },
      { date: "2025-03-24", close: 48.61 },
      { date: "2025-03-25", close: 48.54 },
      { date: "2025-03-26", close: 48.21 },
      { date: "2025-03-27", close: 48.03 },
      { date: "2025-03-28", close: 47.08 },
      { date: "2025-03-31", close: 47.31 },
      { date: "2025-04-01", close: 47.42 },
      { date: "2025-04-02", close: 47.93 },
      { date: "2025-04-03", close: 45.1 },
      { date: "2025-04-04", close: 42.62 },
      { date: "2025-04-07", close: 42.33 },
      { date: "2025-04-08", close: 41.48 },
      { date: "2025-04-09", close: 45.3 },
      { date: "2025-04-10", close: 43.52 },
      { date: "2025-04-11", close: 44.17 },
      { date: "2025-04-14", close: 44.58 },
      { date: "2025-04-15", close: 44.5 },
      { date: "2025-04-16", close: 43.79 },
      { date: "2025-04-17", close: 43.97 },
      { date: "2025-04-21", close: 43.03 },
      { date: "2025-04-22", close: 44.12 },
      { date: "2025-04-23", close: 44.74 },
      { date: "2025-04-24", close: 45.54 },
      { date: "2025-04-25", close: 45.64 },
      { date: "2025-04-28", close: 45.72 },
      { date: "2025-04-29", close: 45.99 },
      { date: "2025-04-30", close: 45.88 },
      { date: "2025-05-01", close: 46.2 },
      { date: "2025-05-02", close: 46.98 },
      { date: "2025-05-05", close: 46.72 },
      { date: "2025-05-06", close: 46.48 },
      { date: "2025-05-07", close: 46.69 },
    ],
    vti: [
      { date: "2025-03-03", close: 287.71 },
      { date: "2025-03-04", close: 284.12 },
      { date: "2025-03-05", close: 287.35 },
      { date: "2025-03-06", close: 282.01 },
      { date: "2025-03-07", close: 283.34 },
      { date: "2025-03-10", close: 275.62 },
      { date: "2025-03-11", close: 273.69 },
      { date: "2025-03-12", close: 275.04 },
      { date: "2025-03-13", close: 271.18 },
      { date: "2025-03-14", close: 276.99 },
      { date: "2025-03-17", close: 279.28 },
      { date: "2025-03-18", close: 276.27 },
      { date: "2025-03-19", close: 279.41 },
      { date: "2025-03-20", close: 278.74 },
      { date: "2025-03-21", close: 278.85 },
      { date: "2025-03-24", close: 284.01 },
      { date: "2025-03-25", close: 284.49 },
      { date: "2025-03-26", close: 281.16 },
      { date: "2025-03-27", close: 278.99 },
      { date: "2025-03-28", close: 273.43 },
      { date: "2025-03-31", close: 274.84 },
      { date: "2025-04-01", close: 275.77 },
      { date: "2025-04-02", close: 277.95 },
      { date: "2025-04-03", close: 263.96 },
      { date: "2025-04-04", close: 248.47 },
      { date: "2025-04-07", close: 247.66 },
      { date: "2025-04-08", close: 243.75 },
      { date: "2025-04-09", close: 268.48 },
      { date: "2025-04-10", close: 257.43 },
      { date: "2025-04-11", close: 261.74 },
      { date: "2025-04-14", close: 264.15 },
      { date: "2025-04-15", close: 263.69 },
      { date: "2025-04-16", close: 258.21 },
      { date: "2025-04-17", close: 258.75 },
      { date: "2025-04-21", close: 252.6 },
      { date: "2025-04-22", close: 259.03 },
      { date: "2025-04-23", close: 263.44 },
      { date: "2025-04-24", close: 268.99 },
      { date: "2025-04-25", close: 270.64 },
      { date: "2025-04-28", close: 271.03 },
      { date: "2025-04-29", close: 272.66 },
      { date: "2025-04-30", close: 272.82 },
      { date: "2025-05-01", close: 274.52 },
      { date: "2025-05-02", close: 278.8 },
      { date: "2025-05-05", close: 277.22 },
      { date: "2025-05-06", close: 274.97 },
      { date: "2025-05-07", close: 276.11 },
    ],
    iwv: [
      { date: "2025-03-03", close: 332.03 },
      { date: "2025-03-04", close: 327.92 },
      { date: "2025-03-05", close: 331.37 },
      { date: "2025-03-06", close: 325.3 },
      { date: "2025-03-07", close: 327.42 },
      { date: "2025-03-10", close: 318.35 },
      { date: "2025-03-11", close: 315.72 },
      { date: "2025-03-12", close: 317.58 },
      { date: "2025-03-13", close: 313.1 },
      { date: "2025-03-14", close: 319.89 },
      { date: "2025-03-17", close: 322.28 },
      { date: "2025-03-18", close: 318.11 },
      { date: "2025-03-19", close: 321.81 },
      { date: "2025-03-20", close: 321.08 },
      { date: "2025-03-21", close: 321.18 },
      { date: "2025-03-24", close: 326.95 },
      { date: "2025-03-25", close: 327.54 },
      { date: "2025-03-26", close: 323.49 },
      { date: "2025-03-27", close: 322.67 },
      { date: "2025-03-28", close: 315.99 },
      { date: "2025-03-31", close: 317.64 },
      { date: "2025-04-01", close: 318.85 },
      { date: "2025-04-02", close: 321.2 },
      { date: "2025-04-03", close: 305.45 },
      { date: "2025-04-04", close: 287.37 },
      { date: "2025-04-07", close: 286.12 },
      { date: "2025-04-08", close: 281.67 },
      { date: "2025-04-09", close: 308.35 },
      { date: "2025-04-10", close: 297.56 },
      { date: "2025-04-11", close: 302.59 },
      { date: "2025-04-14", close: 305.2 },
      { date: "2025-04-15", close: 304.55 },
      { date: "2025-04-16", close: 298.31 },
      { date: "2025-04-17", close: 298.97 },
      { date: "2025-04-21", close: 292.05 },
      { date: "2025-04-22", close: 299.38 },
      { date: "2025-04-23", close: 304.49 },
      { date: "2025-04-24", close: 310.86 },
      { date: "2025-04-25", close: 313.2 },
      { date: "2025-04-28", close: 313.12 },
      { date: "2025-04-29", close: 315.19 },
      { date: "2025-04-30", close: 314.85 },
      { date: "2025-05-01", close: 317.1 },
      { date: "2025-05-02", close: 321.97 },
      { date: "2025-05-05", close: 320.26 },
      { date: "2025-05-06", close: 317.81 },
      { date: "2025-05-07", close: 318.9 },
    ],
  },
  deltaNote:
    "Positive delta means the first symbol performed better than the second by that percentage point difference.",
}

// Prepare data for the line chart
const combinedData = data.historicalPrices.ebi.map((item, index) => {
  const ebiNorm = (item.close / data.individualPerformance.ebi.startPrice) * 100
  const iwvNorm = (data.historicalPrices.iwv[index].close / data.individualPerformance.iwv.startPrice) * 100

  return {
    date: item.date,
    // Normalized values for percentage comparison (starting at 100%)
    EBI_norm: ebiNorm,
    VTI_norm: (data.historicalPrices.vti[index].close / data.individualPerformance.vti.startPrice) * 100,
    IWV_norm: iwvNorm,
    // Delta between EBI and IWV (percentage points difference)
    delta: ebiNorm - iwvNorm,
  }
})

// Format date for display
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

// Custom tooltip formatter for the line chart
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border rounded-lg shadow-sm">
        <p className="font-medium">{formatDate(label)}</p>
        <div className="mt-2 space-y-1">
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }}>
              {entry.name}: {entry.value.toFixed(2)}%
            </p>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export default function ETFDashboard() {
  // Find the min and max values for the chart to set appropriate y-axis domain
  const allValues = combinedData.flatMap((item) => [item.EBI_norm, item.VTI_norm, item.IWV_norm])
  const minValue = Math.floor(Math.min(...allValues))
  const maxValue = Math.ceil(Math.max(...allValues))

  // Calculate the range to ensure 100% is in the middle
  const range = Math.max(100 - minValue, maxValue - 100)
  const yAxisMin = Math.max(80, 100 - range - 5) // Add some padding
  const yAxisMax = Math.min(120, 100 + range + 5) // Add some padding

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">ETF Performance Dashboard</h1>
      <p className="text-gray-500 mb-8">
        {formatDate(data.dateRange.startDate)} - {formatDate(data.dateRange.endDate)}
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
            <div className="flex flex-col space-y-4">
              <div>
                <p className="text-sm text-gray-500">Performance</p>
                <p
                  className={`text-xl font-medium flex items-center ${
                    Number.parseFloat(data.individualPerformance.ebi.performance) < 0
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {Number.parseFloat(data.individualPerformance.ebi.performance) < 0 ? (
                    <ArrowDownIcon className="mr-1 h-4 w-4" />
                  ) : (
                    <ArrowUpIcon className="mr-1 h-4 w-4" />
                  )}
                  {data.individualPerformance.ebi.performance}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">vs IWV (Benchmark)</p>
                <p
                  className={`text-xl font-medium flex items-center ${
                    data.performanceDeltas.ebi_iwv < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {data.performanceDeltas.ebi_iwv < 0 ? (
                    <ArrowDownIcon className="mr-1 h-4 w-4" />
                  ) : (
                    <ArrowUpIcon className="mr-1 h-4 w-4" />
                  )}
                  {data.performanceDeltas.ebi_iwv.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VTI Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">VTI</CardTitle>
            <CardDescription>Vanguard Total Stock Market ETF</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div>
                <p className="text-sm text-gray-500">Performance</p>
                <p
                  className={`text-xl font-medium flex items-center ${
                    Number.parseFloat(data.individualPerformance.vti.performance) < 0
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {Number.parseFloat(data.individualPerformance.vti.performance) < 0 ? (
                    <ArrowDownIcon className="mr-1 h-4 w-4" />
                  ) : (
                    <ArrowUpIcon className="mr-1 h-4 w-4" />
                  )}
                  {data.individualPerformance.vti.performance}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">vs IWV (Benchmark)</p>
                <p
                  className={`text-xl font-medium flex items-center ${
                    data.performanceDeltas.vti_iwv < 0 ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {data.performanceDeltas.vti_iwv < 0 ? (
                    <ArrowDownIcon className="mr-1 h-4 w-4" />
                  ) : (
                    <ArrowUpIcon className="mr-1 h-4 w-4" />
                  )}
                  {data.performanceDeltas.vti_iwv.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* IWV Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">IWV</CardTitle>
            <CardDescription>iShares Russell 3000 ETF (Benchmark)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div>
                <p className="text-sm text-gray-500">Performance</p>
                <p
                  className={`text-xl font-medium flex items-center ${
                    Number.parseFloat(data.individualPerformance.iwv.performance) < 0
                      ? "text-red-600"
                      : "text-green-600"
                  }`}
                >
                  {Number.parseFloat(data.individualPerformance.iwv.performance) < 0 ? (
                    <ArrowDownIcon className="mr-1 h-4 w-4" />
                  ) : (
                    <ArrowUpIcon className="mr-1 h-4 w-4" />
                  )}
                  {data.individualPerformance.iwv.performance}
                </p>
              </div>
            </div>
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
                      This chart shows the percentage change over the selected time period, normalized to 100% at the
                      start date.
                    </p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ETFs</TabsTrigger>
                <TabsTrigger value="ebi">EBI</TabsTrigger>
                <TabsTrigger value="iwv">IWV</TabsTrigger>
                <TabsTrigger value="delta">EBI vs IWV</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorEBI" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorVTI" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorIWV" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffc658" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ffc658" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                    <YAxis
                      domain={[yAxisMin, yAxisMax]}
                      tickFormatter={(value) => `${value}%`}
                      ticks={[85, 90, 95, 100, 105, 110, 115]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      name="EBI"
                      dataKey="EBI_norm"
                      stroke="#8884d8"
                      fillOpacity={1}
                      fill="url(#colorEBI)"
                      strokeWidth={0}
                    />
                    <Area
                      type="monotone"
                      name="VTI"
                      dataKey="VTI_norm"
                      stroke="#82ca9d"
                      fillOpacity={1}
                      fill="url(#colorVTI)"
                      strokeWidth={0}
                    />
                    <Area
                      type="monotone"
                      name="IWV"
                      dataKey="IWV_norm"
                      stroke="#ffc658"
                      fillOpacity={1}
                      fill="url(#colorIWV)"
                      strokeWidth={0}
                    />
                    <Line
                      type="monotone"
                      name="EBI"
                      dataKey="EBI_norm"
                      stroke="#8884d8"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      name="VTI"
                      dataKey="VTI_norm"
                      stroke="#82ca9d"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      name="IWV"
                      dataKey="IWV_norm"
                      stroke="#ffc658"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="ebi" className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorEBISolo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                    <YAxis
                      domain={[yAxisMin, yAxisMax]}
                      tickFormatter={(value) => `${value}%`}
                      ticks={[85, 90, 95, 100, 105, 110, 115]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      name="EBI"
                      dataKey="EBI_norm"
                      stroke="#8884d8"
                      fillOpacity={1}
                      fill="url(#colorEBISolo)"
                      strokeWidth={0}
                    />
                    <Line
                      type="monotone"
                      name="EBI"
                      dataKey="EBI_norm"
                      stroke="#8884d8"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <ReferenceLine y={100} stroke="#666" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="iwv" className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorIWVSolo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ffc658" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ffc658" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                    <YAxis
                      domain={[yAxisMin, yAxisMax]}
                      tickFormatter={(value) => `${value}%`}
                      ticks={[85, 90, 95, 100, 105, 110, 115]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      name="IWV"
                      dataKey="IWV_norm"
                      stroke="#ffc658"
                      fillOpacity={1}
                      fill="url(#colorIWVSolo)"
                      strokeWidth={0}
                    />
                    <Line
                      type="monotone"
                      name="IWV"
                      dataKey="IWV_norm"
                      stroke="#ffc658"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <ReferenceLine y={100} stroke="#666" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="delta" className="h-[500px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={combinedData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorDelta" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff7300" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ff7300" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                    <YAxis domain={[-2, 2]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip
                      formatter={(value: any) => [`${value.toFixed(2)}%`, "Delta"]}
                      labelFormatter={formatDate}
                    />
                    <Area
                      type="monotone"
                      name="EBI vs IWV"
                      dataKey="delta"
                      stroke="#ff7300"
                      fillOpacity={1}
                      fill="url(#colorDelta)"
                      strokeWidth={0}
                    />
                    <Line
                      type="monotone"
                      name="EBI vs IWV"
                      dataKey="delta"
                      stroke="#ff7300"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
