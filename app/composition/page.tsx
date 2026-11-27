import type { Metadata } from "next";
import { CompositionDashboard } from "@/components/composition/composition-dashboard";

export const metadata: Metadata = {
  title: "EBI Composition",
  description: "The blend of VTI, IWN and VTV that best approximates EBI's holdings, and how it has tracked EBI",
};

export default function CompositionPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Composition</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            What is EBI made of?
          </h1>
        </header>
        <CompositionDashboard />
      </div>
    </main>
  );
}
