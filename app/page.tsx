"use client";

import { Scoreboard } from "@/components/dashboard/scoreboard";
import { usePerformance } from "@/lib/use-performance";

export default function DashboardPage() {
  const state = usePerformance();

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Performance</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            How is EBI doing?
          </h1>
        </header>
        {state.status === "loading" && (
          <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        )}
        {state.status === "error" && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{state.error}</div>
        )}
        {state.status === "ready" && <Scoreboard data={state.data} />}
      </div>
    </main>
  );
}
