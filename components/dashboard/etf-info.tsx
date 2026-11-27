"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ETFS, fmtDate, type Sym } from "@/lib/performance";
import type { HoldingsSummary } from "@/src/holdings/summary";
import { cn } from "@/lib/utils";

type SummaryState = { status: "loading" } | { status: "missing" } | { status: "ready"; data: HoldingsSummary };

// One request per ticker per page load, shared by every popover.
const summaryCache = new Map<Sym, Promise<HoldingsSummary | null>>();

function loadSummary(sym: Sym): Promise<HoldingsSummary | null> {
  let p = summaryCache.get(sym);
  if (!p) {
    p = fetch(`/api/holdings/${sym}?top=8`)
      .then((r) => (r.ok ? (r.json() as Promise<HoldingsSummary>) : null))
      .catch(() => null);
    summaryCache.set(sym, p);
  }
  return p;
}

function Holdings({ sym }: { sym: Sym }) {
  const [state, setState] = useState<SummaryState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    loadSummary(sym).then((data) => {
      if (!cancelled) setState(data ? { status: "ready", data } : { status: "missing" });
    });
    return () => {
      cancelled = true;
    };
  }, [sym]);

  if (state.status === "loading") {
    return (
      <div className="mt-3 space-y-2" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-3 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    );
  }
  if (state.status === "missing") {
    return <p className="mt-3 text-xs text-slate-400">Holdings haven&apos;t been synced for this fund yet.</p>;
  }
  const d = state.data;
  const max = d.top[0]?.weight || 1;
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between text-xs text-slate-500">
        <span>
          <strong className="font-semibold text-slate-800">{d.count.toLocaleString()}</strong> holdings
          {d.weightedPeRatio !== null && (
            <>
              {" · P/E "}
              <strong className="font-semibold text-slate-800">{d.weightedPeRatio.toFixed(1)}</strong>
            </>
          )}
        </span>
        <span>as of {fmtDate(d.date, { month: "short", day: "numeric" })}</span>
      </div>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Top {d.top.length} · {(d.topWeight * 100).toFixed(1)}% of fund
      </p>
      <ul className="mt-1.5 space-y-1">
        {d.top.map((h) => (
          <li key={h.ticker} className="grid grid-cols-[3.25rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="font-semibold text-slate-800">{h.ticker}</span>
            <span className="relative h-4 min-w-0">
              <span
                className="absolute inset-y-0 left-0 rounded-sm opacity-15"
                style={{ width: `${(h.weight / max) * 100}%`, background: ETFS[sym].color }}
              />
              <span className="relative block truncate pl-1 leading-4 text-slate-500">{h.name}</span>
            </span>
            <span className="text-right tabular-nums text-slate-700">{(h.weight * 100).toFixed(2)}%</span>
          </li>
        ))}
      </ul>
      <a
        href={`/api/holdings/${sym}`}
        download
        className="mt-3 inline-block text-xs font-medium text-indigo-600 hover:underline"
      >
        Download all holdings (JSON)
      </a>
    </div>
  );
}

/**
 * A ticker that opens a popover describing the fund and its largest holdings.
 * Click/tap to open, so it works the same on desktop and mobile.
 */
export function EtfInfo({
  sym,
  className,
  children,
  showIcon = true,
  iconClassName,
}: {
  sym: Sym;
  className?: string;
  children?: React.ReactNode;
  showIcon?: boolean;
  iconClassName?: string;
}) {
  const meta = ETFS[sym];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`About ${meta.ticker}`}
          className={cn(
            "group inline-flex min-h-0 items-center gap-1 rounded text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
            className,
          )}
        >
          {children ?? meta.ticker}
          {showIcon && (
            <Info
              className={cn("h-3 w-3 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500", iconClassName)}
              aria-hidden
            />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex items-start gap-2">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: meta.color }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {meta.ticker} <span className="font-normal text-slate-500">· {meta.role}</span>
            </p>
            <p className="text-xs text-slate-500">{meta.name}</p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{meta.description}</p>
        <Holdings sym={sym} />
      </PopoverContent>
    </Popover>
  );
}
