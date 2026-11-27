"use client";

import { useEffect, useState } from "react";
import type { PerformanceApiResponse } from "@/lib/performance";

export type PerformanceState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: PerformanceApiResponse };

export function usePerformance(): PerformanceState {
  const [state, setState] = useState<PerformanceState>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/performance")
      .then(async (res) => {
        if (!res.ok) throw new Error(`API request failed with status ${res.status}`);
        return (await res.json()) as PerformanceApiResponse;
      })
      .then((data) => !cancelled && setState({ status: "ready", data }))
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: "error", error: err instanceof Error ? err.message : String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
