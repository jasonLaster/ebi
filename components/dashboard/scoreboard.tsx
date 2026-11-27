"use client";

import { useMemo, useState } from "react";
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
import {
  ETFS,
  PEERS,
  RANGES,
  SYMBOLS,
  computeStats,
  cumulativeReturns,
  fmtDate,
  fmtPct,
  fmtPts,
  periodReturns,
  priceSeries,
  spreadRows,
  type PerformanceApiResponse,
  type RangeKey,
  type ReturnRow,
  type Sym,
} from "@/lib/performance";
import { SpreadChart, aheadShare } from "@/components/dashboard/spread-chart";

const MUTED = "#cbd5e1";
const EBI = ETFS.ebi;

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- hero */

function Hero({ data }: { data: PerformanceApiResponse }) {
  const prices = useMemo(() => priceSeries(data), [data]);
  const rows = useMemo(() => cumulativeReturns(prices, "ALL"), [prices]);
  const stats = useMemo(() => computeStats(rows, data.peRatios), [rows, data.peRatios]);
  const ebi = stats.find((s) => s.symbol === "ebi");
  const peers = stats.filter((s) => s.symbol !== "ebi");
  const beating = peers.filter((p) => p.ebiSpread > 0).length;
  const bench = stats.find((s) => s.symbol === "iwv");
  const first = rows[0]?.date;
  const last = rows[rows.length - 1]?.date;

  return (
    <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: EBI.color }} />
          {EBI.ticker} · {EBI.name}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl"
            style={{ color: EBI.color }}
          >
            {fmtPct(ebi?.totalReturn)}
          </span>
          <span className="text-sm text-slate-500">
            since {first ? fmtDate(first, { month: "short", day: "numeric", year: "numeric" }) : "—"}
          </span>
        </div>
        <p className="mt-3 text-base text-slate-700 sm:text-lg">
          Beating <strong className="font-semibold text-slate-900">{beating} of {peers.length}</strong> peers
          {bench && (
            <>
              {" · "}
              <strong
                className={cn("font-semibold", bench.ebiSpread >= 0 ? "text-emerald-600" : "text-rose-600")}
              >
                {fmtPts(bench.ebiSpread)}
              </strong>{" "}
              vs IWV benchmark
            </>
          )}
        </p>
        {last && <p className="mt-1 text-xs text-slate-400">Prices through {fmtDate(last, { month: "short", day: "numeric", year: "numeric" })}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 self-center">
        {peers.map((p) => {
          const meta = ETFS[p.symbol];
          const ahead = p.ebiSpread >= 0;
          return (
            <div key={p.symbol} className="rounded-xl bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-semibold text-slate-700">vs {meta.ticker}</span>
                <span className="truncate pl-2">{meta.role}</span>
              </div>
              <div
                className={cn(
                  "mt-1 text-xl font-semibold tabular-nums",
                  ahead ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {fmtPts(p.ebiSpread)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- leaderboard */

function Leaderboard({ data }: { data: PerformanceApiResponse }) {
  const stats = useMemo(() => {
    const rows = cumulativeReturns(priceSeries(data), "ALL");
    return computeStats(rows, data.peRatios).sort((a, b) => b.totalReturn - a.totalReturn);
  }, [data]);
  const lo = Math.min(0, ...stats.map((s) => s.totalReturn));
  const hi = Math.max(0, ...stats.map((s) => s.totalReturn));
  const span = hi - lo || 1;
  const zero = ((0 - lo) / span) * 100;

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <SectionTitle title="Leaderboard" subtitle="Total return since inception" />
      <ol className="mt-4 space-y-2">
        {stats.map((s, i) => {
          const meta = ETFS[s.symbol];
          const isEbi = s.symbol === "ebi";
          const left = s.totalReturn >= 0 ? zero : ((s.totalReturn - lo) / span) * 100;
          const width = (Math.abs(s.totalReturn) / span) * 100;
          return (
            <li
              key={s.symbol}
              className={cn(
                "grid grid-cols-[1.25rem_5.5rem_1fr_4rem] items-center gap-2 rounded-lg px-2 py-2 sm:grid-cols-[1.5rem_7rem_1fr_4.5rem] sm:gap-3",
                isEbi && "bg-indigo-50 ring-1 ring-indigo-100",
              )}
            >
              <span className="text-xs tabular-nums text-slate-400">{i + 1}</span>
              <span className="min-w-0">
                <span className={cn("block text-sm font-semibold", isEbi ? "text-indigo-700" : "text-slate-700")}>
                  {meta.ticker}
                </span>
                <span className="block truncate text-[11px] text-slate-400">{meta.role}</span>
              </span>
              <div className="relative h-3 min-w-0 rounded-full bg-slate-100">
                <div
                  className="absolute top-0 h-3 rounded-full"
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 0.5)}%`,
                    background: isEbi ? EBI.color : "#94a3b8",
                    opacity: isEbi ? 1 : 0.55,
                  }}
                />
              </div>
              <span
                className={cn(
                  "text-right text-sm tabular-nums",
                  isEbi ? "font-semibold text-indigo-700" : "text-slate-600",
                )}
              >
                {fmtPct(s.totalReturn)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* --------------------------------------------------------------- chart */

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey?: string | number; value?: number }[];
}

function ChartTooltip({ active, label, payload }: TipProps) {
  if (!active || !payload?.length || !label) return null;
  const items = payload
    .filter((p) => typeof p.value === "number")
    .map((p) => ({ sym: p.dataKey as Sym, value: p.value as number }))
    .sort((a, b) => b.value - a.value);
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <div className="mb-1.5 font-medium text-slate-500">
        {fmtDate(label, { month: "short", day: "numeric", year: "numeric" })}
      </div>
      {items.map((it) => (
        <div key={it.sym} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: ETFS[it.sym].color }} />
            <span className={it.sym === "ebi" ? "font-semibold text-slate-900" : "text-slate-600"}>
              {ETFS[it.sym].ticker}
            </span>
          </span>
          <span className={cn("tabular-nums", it.sym === "ebi" ? "font-semibold text-slate-900" : "text-slate-600")}>
            {fmtPct(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function niceDomain(rows: ReturnRow[]): { domain: [number, number]; ticks: number[] } {
  let lo = 0;
  let hi = 0;
  for (const r of rows) {
    for (const s of SYMBOLS) {
      const v = r[s];
      if (v === undefined) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
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

type ChartMode = "cumulative" | "relative";

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

function PerformanceChart({ data }: { data: PerformanceApiResponse }) {
  const [mode, setMode] = useState<ChartMode>("cumulative");
  const [range, setRange] = useState<RangeKey>("ALL");
  const [focus, setFocus] = useState<Sym | null>(null);
  const [peer, setPeer] = useState<Sym>("iwv");
  const prices = useMemo(() => priceSeries(data), [data]);
  const rows = useMemo(() => cumulativeReturns(prices, range), [prices, range]);
  const spreads = useMemo(() => spreadRows(rows), [rows]);
  const { domain, ticks } = useMemo(() => niceDomain(rows), [rows]);
  const last = rows[rows.length - 1];
  const lastSpread = spreads[spreads.length - 1];
  const longRange = range === "ALL" || range === "1Y";
  const peerSpread = lastSpread?.[peer];
  const share = aheadShare(spreads, peer);

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          label="Chart"
          value={mode}
          onChange={setMode}
          options={[
            { value: "cumulative", label: "Cumulative return" },
            { value: "relative", label: "Relative to a peer" },
          ]}
        />
        <Segmented
          label="Range"
          value={range}
          onChange={setRange}
          options={RANGES.map((r) => ({ value: r, label: r }))}
        />
      </div>

      <div className="mt-5">
        {mode === "cumulative" ? (
          <SectionTitle title="EBI vs peers" subtitle="Cumulative return, rebased to the start of the range" />
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionTitle
              title={`EBI vs ${ETFS[peer].ticker}`}
              subtitle={`EBI's return minus ${ETFS[peer].ticker}'s, in percentage points. Green: EBI ahead.`}
            />
            <div className="text-right">
              <div
                className={cn(
                  "text-3xl font-semibold tabular-nums tracking-tight",
                  (peerSpread ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {fmtPts(peerSpread)}
              </div>
              <div className="text-xs text-slate-500">
                EBI ahead <span className="font-semibold text-slate-800">{Math.round(share)}%</span> of days
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {mode === "cumulative"
          ? SYMBOLS.map((s) => {
              const isEbi = s === "ebi";
              const active = isEbi || focus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onMouseEnter={() => !isEbi && setFocus(s)}
                  onMouseLeave={() => setFocus(null)}
                  onClick={() => !isEbi && setFocus(focus === s ? null : s)}
                  className={cn(
                    "flex min-h-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active ? "border-slate-300 bg-white" : "border-transparent bg-slate-50 text-slate-500",
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: active ? ETFS[s].color : MUTED }} />
                  <span className={isEbi ? "font-semibold text-slate-900" : ""}>{ETFS[s].ticker}</span>
                  <span className="tabular-nums text-slate-400">{fmtPct(last?.[s])}</span>
                </button>
              );
            })
          : PEERS.map((s) => {
              const active = s === peer;
              const v = lastSpread?.[s];
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPeer(s)}
                  className={cn(
                    "flex min-h-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                  )}
                >
                  <span>vs</span>
                  <span className="font-semibold">{ETFS[s].ticker}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      active ? "text-slate-300" : (v ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {fmtPts(v)}
                  </span>
                </button>
              );
            })}
      </div>

      <div className="mt-4 h-[280px] sm:h-[380px]">
        {mode === "relative" ? (
          <SpreadChart rows={spreads} dataKey={peer} longRange={longRange} />
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
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e2e8f0" }} />
              {PEERS.map((s) => (
                <Line
                  key={s}
                  dataKey={s}
                  type="monotone"
                  dot={false}
                  isAnimationActive={false}
                  stroke={focus === s ? ETFS[s].color : MUTED}
                  strokeWidth={focus === s ? 2.25 : 1.25}
                  strokeOpacity={focus && focus !== s ? 0.5 : 1}
                  activeDot={{ r: 3 }}
                />
              ))}
              <Line
                dataKey="ebi"
                type="monotone"
                dot={false}
                isAnimationActive={false}
                stroke={EBI.color}
                strokeWidth={3}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {mode === "cumulative"
          ? "Hover or tap a ticker to highlight it against EBI."
          : "Pick a peer above to compare; the range toggle rebases both lines to its first day."}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------ heat grid */

function cellTint(v: number | undefined, ebi: number | undefined): string {
  if (v === undefined || ebi === undefined) return "";
  const d = ebi - v; // >0 → EBI beat this peer
  const strength = Math.min(Math.abs(d) / 6, 1);
  const alpha = 0.08 + strength * 0.32;
  return d >= 0 ? `rgba(16,185,129,${alpha})` : `rgba(244,63,94,${alpha})`;
}

function PeriodGrid({ data }: { data: PerformanceApiResponse }) {
  const periods = useMemo(() => periodReturns(priceSeries(data)), [data]);
  const order: Sym[] = ["ebi", ...PEERS];

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <SectionTitle title="Returns by period" subtitle="Green: EBI beat that ETF over the period · Red: it beat EBI" />
      <div className="-mx-5 mt-4 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[19rem] border-separate border-spacing-1 text-xs sm:text-sm">
          <thead>
            <tr className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              <th className="text-left font-medium">ETF</th>
              {RANGES.map((r) => (
                <th key={r} className={cn("text-right font-medium", r === "1Y" && "hidden sm:table-cell")}>
                  {r}
                </th>
              ))}
              <th className="pl-2 text-right font-medium">P/E</th>
            </tr>
          </thead>
          <tbody>
            {order.map((s) => {
              const isEbi = s === "ebi";
              const pe = data.peRatios?.[s]?.peRatio;
              return (
                <tr key={s}>
                  <td className="py-1.5 pr-1">
                    <div className={cn("font-semibold", isEbi ? "text-indigo-700" : "text-slate-700")}>
                      {ETFS[s].ticker}
                    </div>
                    <div className="hidden text-[11px] text-slate-400 sm:block">{ETFS[s].role}</div>
                    <a
                      href={`/api/holdings/${s}`}
                      download
                      className="hidden text-[11px] text-slate-400 underline-offset-2 hover:text-indigo-600 hover:underline sm:inline"
                    >
                      Holdings
                    </a>
                  </td>
                  {RANGES.map((r) => {
                    const v = periods[r][s];
                    return (
                      <td
                        key={r}
                        className={cn(
                          "rounded-md px-1.5 py-2 text-right tabular-nums sm:px-2.5",
                          r === "1Y" && "hidden sm:table-cell",
                          isEbi ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700",
                        )}
                        style={isEbi ? undefined : { background: cellTint(v, periods[r].ebi) }}
                      >
                        {fmtPct(v)}
                      </td>
                    );
                  })}
                  <td className="pl-2 text-right tabular-nums text-slate-600">
                    {typeof pe === "number" ? pe.toFixed(1) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- shell */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>}
    </div>
  );
}

export function Scoreboard({ data }: { data: PerformanceApiResponse }) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <Hero data={data} />
      <div className="grid gap-5 sm:gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Leaderboard data={data} />
        <PeriodGrid data={data} />
      </div>
      <PerformanceChart data={data} />
    </div>
  );
}
