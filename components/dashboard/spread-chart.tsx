"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDate, fmtPts } from "@/lib/performance";

type Row = { date: string };

function valueAt<R extends Row>(r: R, key: keyof R & string): number | undefined {
  const v = r[key];
  return typeof v === "number" ? v : undefined;
}

const UP = "#059669";
const DOWN = "#e11d48";

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/** Share of days (after the first) on which the spread series was above zero. */
export function aheadShare<R extends Row>(rows: R[], dataKey: keyof R & string): number {
  const days = rows
    .slice(1)
    .map((r) => valueAt(r, dataKey))
    .filter((v): v is number => v !== undefined);
  return days.length ? (days.filter((v) => v > 0).length / days.length) * 100 : 0;
}

/**
 * A spread series in percentage points (e.g. EBI minus a peer): green above
 * zero (EBI ahead), red below.
 */
export function SpreadChart<R extends Row>({
  rows,
  dataKey,
  longRange,
}: {
  rows: R[];
  dataKey: keyof R & string;
  longRange: boolean;
}) {
  const values = rows.map((r) => valueAt(r, dataKey)).filter((v): v is number => v !== undefined);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const step = niceStep((hi - lo) / 4);
  const domainMin = Math.floor((lo - step * 0.15) / step) * step;
  const domainMax = Math.ceil((hi + step * 0.15) / step) * step;
  const ticks: number[] = [];
  for (let t = domainMin; t <= domainMax + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100);
  // SVG gradients default to objectBoundingBox units, so the zero crossing must
  // be placed relative to each shape's own extent, not the axis domain.
  // The area spans [lo, hi] (baseValue 0 is included); the line spans the data.
  const fillZeroAt = hi === lo ? 0.5 : hi / (hi - lo);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const strokeZeroAt =
    dataMax === dataMin ? (dataMax >= 0 ? 1 : 0) : Math.min(1, Math.max(0, dataMax / (dataMax - dataMin)));
  const gid = `spread-${dataKey}`;

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id={`${gid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor={UP} stopOpacity={0.3} />
            <stop offset={fillZeroAt} stopColor={UP} stopOpacity={0.05} />
            <stop offset={fillZeroAt} stopColor={DOWN} stopOpacity={0.05} />
            <stop offset={1} stopColor={DOWN} stopOpacity={0.3} />
          </linearGradient>
          <linearGradient id={`${gid}-stroke`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={strokeZeroAt} stopColor={UP} />
            <stop offset={strokeZeroAt} stopColor={DOWN} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) =>
            fmtDate(d, longRange ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" })
          }
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis
          domain={[domainMin, domainMax]}
          ticks={ticks}
          tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}`}
          tick={{ fontSize: 11, fill: "#94a3b8" }}
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <ReferenceLine y={0} stroke="#475569" />
        <Tooltip
          cursor={{ stroke: "#e2e8f0" }}
          content={({ active, payload, label }) => {
            const v = payload?.[0]?.value;
            if (!active || typeof v !== "number" || typeof label !== "string") return null;
            return (
              <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                <p className="font-medium text-slate-500">
                  {fmtDate(label, { month: "short", day: "numeric", year: "numeric" })}
                </p>
                <p className="mt-0.5 font-semibold tabular-nums" style={{ color: v >= 0 ? UP : DOWN }}>
                  {fmtPts(v, 2)}
                </p>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey as string}
          baseValue={0}
          stroke={`url(#${gid}-stroke)`}
          strokeWidth={2}
          fill={`url(#${gid}-fill)`}
          isAnimationActive={false}
          connectNulls
          activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: "#0f172a" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
