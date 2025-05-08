"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts"

const data = [
  {
    date: "2025-03-03",
    value: 100,
  },
  {
    date: "2025-03-10",
    value: 96.4,
  },
  {
    date: "2025-03-17",
    value: 97.5,
  },
  {
    date: "2025-03-24",
    value: 99.2,
  },
  {
    date: "2025-03-31",
    value: 96.6,
  },
  {
    date: "2025-04-07",
    value: 86.4,
  },
  {
    date: "2025-04-14",
    value: 91.0,
  },
  {
    date: "2025-04-21",
    value: 87.8,
  },
  {
    date: "2025-04-28",
    value: 93.3,
  },
  {
    date: "2025-05-05",
    value: 95.3,
  },
]

export default function Chart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{
          top: 5,
          right: 10,
          left: 10,
          bottom: 0,
        }}
      >
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload && payload.length) {
              return (
                <div className="rounded-lg border bg-background p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">Date</span>
                      <span className="font-bold text-muted-foreground">
                        {new Date(payload[0].payload.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.70rem] uppercase text-muted-foreground">Value</span>
                      <span className="font-bold">{payload[0].value}%</span>
                    </div>
                  </div>
                </div>
              )
            }
            return null
          }}
        />
        <Line
          type="monotone"
          strokeWidth={2}
          dataKey="value"
          activeDot={{
            r: 6,
            style: { fill: "var(--theme-primary)", opacity: 0.25 },
          }}
          style={{
            stroke: "var(--theme-primary)",
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
