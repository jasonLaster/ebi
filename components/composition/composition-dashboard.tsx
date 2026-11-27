"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SpreadChart, aheadShare } from "@/components/dashboard/spread-chart";
import {
  ETFS,
  RANGES,
  cumulativeReturns,
  fmtDate,
  fmtPct,
  fmtPts,
  priceSeries,
  type PerformanceApiResponse,
  type RangeKey,
} from "@/lib/performance";
import { usePerformance } from "@/lib/use-performance";
import { cn } from "@/lib/utils";

const BLEND = ["vti", "iwn", "vtv"] as const;
type BlendSym = (typeof BLEND)[number];
const BLEND_COLOR = "#0f172a";

interface Approximation {
  timestamp: string;
  optimalWeights: Record<BlendSym, number>;
  optimizationMetrics: {
    finalObjectiveValue: number;
    initialObjectiveValue: number;
    improvementPercent: number;
    averageError: number;
    maxError: number;
    errorCount: number;
    totalStocks: number;
  };
  constraints: { weightsSum: number; allWeightsNonNegative: boolean; allWeightsLessThanOne: boolean };
  analysis?: { trackingError: number; errorRate: number; confidence: string };
}

async function fetchApproximation(method: "GET" | "POST"): Promise<Approximation> {
  const res = await fetch("/api/portfolio-approximation", { method });
  if (!res.ok) throw new Error(`Approximation request failed with status ${res.status}`);
  return (await res.json()) as Approximation;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6", className)}>
      {children}
    </section>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex self-start rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:px-3",
            o.value === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- blend */

function BlendHero({
  approx,
  refreshing,
  onRefresh,
}: {
  approx: Approximation;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const parts = [...BLEND]
    .map((s) => ({ s, w: approx.optimalWeights[s] * 100 }))
    .sort((a, b) => b.w - a.w);
  const m = approx.optimizationMetrics;
  const matched = m.totalStocks - m.errorCount;
  const tiles = [
    {
      label: "Holdings fit error",
      value: approx.analysis ? `${(approx.analysis.trackingError * 100).toFixed(2)}%` : "—",
      hint: "RMS gap in per-stock weights",
    },
    {
      label: "Confidence",
      value: approx.analysis?.confidence ?? "—",
      hint: `${fmtPct(m.improvementPercent)} better than the starting guess`,
    },
    {
      label: "Holdings matched",
      value: `${((matched / m.totalStocks) * 100).toFixed(1)}%`,
      hint: `${matched.toLocaleString()} of ${m.totalStocks.toLocaleString()} stocks`,
    },
    {
      label: "Largest miss",
      value: `${(m.maxError * 100).toFixed(2)}%`,
      hint: `Avg miss ${(m.averageError * 100).toFixed(3)}%`,
    },
  ];

  return (
    <Card className="grid gap-6 sm:p-8 lg:grid-cols-[1.15fr_1fr]">
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: ETFS.ebi.color }} />
            EBI is closest to
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex min-h-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Re-fitting…" : "Re-fit"}
          </button>
        </div>

        <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {parts.map((p, i) => (
            <span key={p.s}>
              {i > 0 && <span className="font-normal text-slate-300"> + </span>}
              <span className="tabular-nums" style={{ color: ETFS[p.s].color }}>
                {p.w.toFixed(1)}%
              </span>{" "}
              {ETFS[p.s].ticker}
            </span>
          ))}
        </p>

        <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          {parts.map((p) => (
            <div key={p.s} style={{ width: `${p.w}%`, background: ETFS[p.s].color }} />
          ))}
        </div>
        <ul className="mt-3 grid gap-1.5 text-xs text-slate-500 sm:grid-cols-3">
          {parts.map((p) => (
            <li key={p.s} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ETFS[p.s].color }} />
              <span className="font-semibold text-slate-700">{ETFS[p.s].ticker}</span>
              <span className="truncate">{ETFS[p.s].role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-slate-400">
          Weights that best reproduce EBI&apos;s stock-level holdings · fitted{" "}
          {new Date(approx.timestamp).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 self-center">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-xs text-slate-500">{t.label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{t.value}</div>
            <div className="mt-0.5 truncate text-[11px] text-slate-400">{t.hint}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------- tracking */

type TrackRow = { date: string; ebi?: number; blend?: number; gap?: number };

function blendRows(data: PerformanceApiResponse, weights: Record<BlendSym, number>, range: RangeKey): TrackRow[] {
  // Buy-and-hold blend rebased at the range start: Σ wᵢ · returnᵢ.
  return cumulativeReturns(priceSeries(data), range).map((r) => {
    const ok = BLEND.every((s) => r[s] !== undefined);
    const blend = ok ? BLEND.reduce((sum, s) => sum + weights[s] * r[s]!, 0) : undefined;
    const gap = r.ebi !== undefined && blend !== undefined ? r.ebi - blend : undefined;
    return { date: r.date, ebi: r.ebi, blend, gap };
  });
}

function niceDomain(rows: TrackRow[]): { domain: [number, number]; ticks: number[] } {
  let lo = 0;
  let hi = 0;
  for (const r of rows)
    for (const v of [r.ebi, r.blend])
      if (v !== undefined) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
  const pad = Math.max((hi - lo) * 0.05, 0.25);
  const raw = (hi - lo + 2 * pad) / 5;
  const step = [0.5, 1, 2, 5, 10, 20, 25, 50].find((s) => s >= raw) ?? 100;
  const min = Math.floor((lo - pad) / step) * step;
  const max = Math.ceil((hi + pad) / step) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + 1e-9; t += step) ticks.push(Number(t.toFixed(2)));
  return { domain: [min, max], ticks };
}

function TrackingCard({ data, approx }: { data: PerformanceApiResponse; approx: Approximation }) {
  const [mode, setMode] = useState<"lines" | "gap">("lines");
  const [range, setRange] = useState<RangeKey>("ALL");
  const rows = useMemo(() => blendRows(data, approx.optimalWeights, range), [data, approx, range]);
  const { domain, ticks } = useMemo(() => niceDomain(rows), [rows]);
  const last = rows[rows.length - 1];
  const longRange = range === "ALL" || range === "1Y";
  const avgAbsGap = rows.reduce((s, r) => s + Math.abs(r.gap ?? 0), 0) / Math.max(rows.length, 1);
  const stats = [
    { label: "EBI", value: fmtPct(last?.ebi), color: ETFS.ebi.color },
    { label: "Blend", value: fmtPct(last?.blend), color: BLEND_COLOR },
    {
      label: "EBI vs blend",
      value: fmtPts(last?.gap),
      color: (last?.gap ?? 0) >= 0 ? "#059669" : "#e11d48",
    },
    { label: "Avg |gap|", value: `${avgAbsGap.toFixed(1)} pts`, color: "#334155" },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Chart"
          value={mode}
          onChange={setMode}
          options={[
            { value: "lines", label: "EBI vs blend" },
            { value: "gap", label: "Gap" },
          ]}
        />
        <Segmented label="Range" value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: r }))} />
      </div>

      <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <SectionTitle
          title="Does the blend track EBI?"
          subtitle={
            mode === "lines"
              ? "Cumulative return of EBI and of the fitted blend, rebased to the start of the range"
              : "EBI's return minus the blend's, in percentage points. Green: EBI ahead."
          }
        />
        <dl className="grid grid-cols-4 gap-4 sm:gap-6">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="truncate text-[11px] text-slate-500">{s.label}</dt>
              <dd className="text-base font-semibold tabular-nums sm:text-lg" style={{ color: s.color }}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-4 h-[280px] sm:h-[360px]">
        {mode === "gap" ? (
          <SpreadChart rows={rows} dataKey="gap" longRange={longRange} />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={rows} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
                domain={domain}
                ticks={ticks}
                tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v}%`}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Tooltip
                cursor={{ stroke: "#e2e8f0" }}
                content={({ active, label, payload }) => {
                  if (!active || typeof label !== "string" || !payload?.length) return null;
                  const row = payload[0].payload as TrackRow;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                      <div className="mb-1 font-medium text-slate-500">
                        {fmtDate(label, { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="font-semibold text-slate-900">EBI</span>
                        <span className="tabular-nums">{fmtPct(row.ebi)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-slate-600">Blend</span>
                        <span className="tabular-nums">{fmtPct(row.blend)}</span>
                      </div>
                      <div className="mt-1 flex justify-between gap-6 border-t border-slate-100 pt-1">
                        <span className="text-slate-600">Gap</span>
                        <span className="tabular-nums">{fmtPts(row.gap, 2)}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                dataKey="blend"
                type="monotone"
                dot={false}
                isAnimationActive={false}
                stroke={BLEND_COLOR}
                strokeWidth={1.75}
                strokeDasharray="5 4"
              />
              <Line
                dataKey="ebi"
                type="monotone"
                dot={false}
                isAnimationActive={false}
                stroke={ETFS.ebi.color}
                strokeWidth={3}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {mode === "lines" ? (
          <>
            <span className="font-semibold" style={{ color: ETFS.ebi.color }}>
              ━ EBI
            </span>{" "}
            <span className="font-semibold text-slate-900">┅ Blend</span> · EBI was ahead of the blend{" "}
            {Math.round(aheadShare(rows, "gap"))}% of days.
          </>
        ) : (
          `EBI was ahead of the blend ${Math.round(aheadShare(rows, "gap"))}% of days in this range.`
        )}
      </p>
    </Card>
  );
}

/* --------------------------------------------------------------- details */

function Details({ approx }: { approx: Approximation }) {
  const m = approx.optimizationMetrics;
  const c = approx.constraints;
  const rows: [string, string][] = [
    ["Final objective", m.finalObjectiveValue.toFixed(6)],
    ["Initial objective", m.initialObjectiveValue.toFixed(6)],
    ["Improvement", fmtPct(m.improvementPercent, 2)],
    ["Stocks with error", `${m.errorCount.toLocaleString()} / ${m.totalStocks.toLocaleString()}`],
    ["Weights sum", c.weightsSum.toFixed(6)],
    ["All weights ≥ 0", c.allWeightsNonNegative ? "Yes" : "No"],
    ["All weights ≤ 100%", c.allWeightsLessThanOne ? "Yes" : "No"],
    ["Error rate", approx.analysis ? `${approx.analysis.errorRate.toFixed(2)}%` : "—"],
  ];
  return (
    <Card className="p-0 sm:p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between p-5 sm:p-6">
          <SectionTitle title="Optimization details" subtitle="Solver metrics and constraint checks" />
          <span className="text-xs text-slate-400 group-open:hidden">Show</span>
          <span className="hidden text-xs text-slate-400 group-open:inline">Hide</span>
        </summary>
        <dl className="grid gap-x-8 gap-y-2 border-t border-slate-100 px-5 py-4 text-sm sm:grid-cols-2 sm:px-6">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-slate-500">{k}</dt>
              <dd className="tabular-nums text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </Card>
  );
}

/* ----------------------------------------------------------------- shell */

export function CompositionDashboard() {
  const perf = usePerformance();
  const [approx, setApprox] = useState<Approximation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchApproximation("GET")
      .then((a) => !cancelled && setApprox(a))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchApproximation("POST")
      .then((a) => {
        setApprox(a);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setRefreshing(false));
  }, []);

  const failure = error ?? (perf.status === "error" ? perf.error : null);
  if (failure) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{failure}</div>;
  }
  if (!approx || perf.status !== "ready") {
    return (
      <div className="space-y-5">
        <div className="h-56 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        <div className="h-96 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }
  return (
    <div className="space-y-5 sm:space-y-6">
      <BlendHero approx={approx} refreshing={refreshing} onRefresh={refresh} />
      <TrackingCard data={perf.data} approx={approx} />
      <Details approx={approx} />
    </div>
  );
}
