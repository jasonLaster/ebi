"use client"

import { ResponsiveContainer, Scatter, ScatterChart, XAxis, YAxis } from "recharts"

const data = [
  {
    x: 10,
    y: 100,
  },
  {
    x: 20,
    y: 120,
  },
  {
    x: 30,
    y: 140,
  },
  {
    x: 40,
    y: 160,
  },
  {
    x: 50,
    y: 180,
  },
  {
    x: 60,
    y: 200,
  },
  {
    x: 70,
    y: 220,
  },
  {
    x: 80,
    y: 240,
  },
  {
    x: 90,
    y: 260,
  },
  {
    x: 100,
    y: 280,
  },
]

export default function Chart() {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart
        margin={{
          top: 20,
          right: 20,
          bottom: 20,
          left: 20,
        }}
      >
        <XAxis
          type="number"
          dataKey="x"
          name="stature"
          unit="cm"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="weight"
          unit="kg"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Scatter name="A school" data={data} fill="var(--theme-primary)" />
      </ScatterChart>
    </ResponsiveContainer>
  )
}
