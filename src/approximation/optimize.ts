import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  HoldingsDb,
  getHoldingsWeightMap,
  getAllUniqueSymbols,
} from "../lib/db";

export interface OptimizationMetrics {
  finalObjectiveValue: number;
  initialObjectiveValue: number;
  improvementPercent: number;
  averageError: number;
  maxError: number;
  errorCount: number;
  totalStocks: number;
}

export interface ApproximationResult {
  timestamp: string;
  targetEtf: string;
  baselineEtfs: string[];
  optimalWeights: Record<string, number>;
  weightsPercentages: Record<string, number>;
  optimizationMetrics: OptimizationMetrics;
  constraints: {
    weightsSum: number;
    allWeightsNonNegative: boolean;
    allWeightsLessThanOne: boolean;
  };
}

type AlglibCtor = new () => {
  promise: Promise<void>;
  add_function: (fn: (x: number[]) => number) => void;
  add_equality_constraint: (fn: (x: number[]) => number) => void;
  add_less_than_or_equal_to_constraint: (fn: (x: number[]) => number) => void;
  solve: (
    mode: "min" | "max",
    x0: number[],
    s0: unknown[],
    maxits: number,
    epsx: number,
    epsf: number,
    epsg: number,
    epsg2: number
  ) => boolean;
  get_results: () => number[];
  get_status: () => unknown;
  remove: () => void;
};

async function loadAlglib(): Promise<{ Alglib: AlglibCtor }> {
  // The vendor wrapper expects these globals.
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  (globalThis as unknown as { __filename?: string }).__filename = __filename;
  (globalThis as unknown as { __dirname?: string }).__dirname = __dirname;

  const modUrl = new URL(
    "../../scripts/vendor/Alglib-v1.1.0.js",
    import.meta.url
  );
  return (await import(modUrl.href)) as { Alglib: AlglibCtor };
}

function computeMetrics(
  H_target: number[],
  H_stack: number[][],
  weights: number[],
  initialObjectiveValue: number,
  finalObjectiveValue: number
): OptimizationMetrics {
  const nStocks = H_target.length;
  let totalError = 0;
  let maxError = 0;
  let errorCount = 0;

  for (let i = 0; i < nStocks; i++) {
    let synthetic = 0;
    for (let j = 0; j < weights.length; j++)
      synthetic += H_stack[i][j] * weights[j];
    const diff = Math.abs(synthetic - H_target[i]);
    totalError += diff;
    maxError = Math.max(maxError, diff);
    if (diff > 0.001) errorCount++;
  }

  const improvementPercent =
    initialObjectiveValue > 0
      ? ((initialObjectiveValue - finalObjectiveValue) /
          initialObjectiveValue) *
        100
      : 0;

  return {
    finalObjectiveValue,
    initialObjectiveValue,
    improvementPercent,
    averageError: nStocks > 0 ? totalError / nStocks : 0,
    maxError,
    errorCount,
    totalStocks: nStocks,
  };
}

function defaultInitialGuess(nVars: number): number[] {
  if (nVars <= 0) return [];
  // Bias towards the first baseline ETF if we don't know better.
  const first = 0.75;
  if (nVars === 1) return [1];
  if (nVars === 2) return [first, 1 - first];
  const remaining = 1 - first;
  const each = remaining / (nVars - 1);
  return [first, ...Array.from({ length: nVars - 1 }, () => each)];
}

export async function runApproximation(
  db: HoldingsDb,
  targetEtf: string,
  baselineEtfs: string[],
  opts?: {
    weightField?: "weight" | "actual_weight";
    initialGuess?: number[];
    maxIterations?: number;
  }
): Promise<ApproximationResult> {
  const weightField = opts?.weightField ?? "actual_weight";
  const target = targetEtf.toUpperCase();
  const baselines = baselineEtfs.map((s) => s.toUpperCase());
  if (baselines.length === 0) {
    throw new Error("baselineEtfs must have at least 1 symbol");
  }

  const targetMap = getHoldingsWeightMap(db, target, { weightField });
  const baselineMaps = baselines.map((s) =>
    getHoldingsWeightMap(db, s, { weightField })
  );

  // Use DB tickers as the master universe, but optimization only needs union across these ETFs.
  // Pulling from DB avoids relying on JSON exports and ensures we match what the app uses.
  const allSymbols = getAllUniqueSymbols(db);
  const symbols = Array.from(allSymbols).sort();

  // Build vectors/matrix.
  const H_target = symbols.map((sym) => targetMap.get(sym) ?? 0);
  const H_columns = baselineMaps.map((m) =>
    symbols.map((sym) => m.get(sym) ?? 0)
  );
  const H_stack: number[][] = symbols.map((_, i) =>
    H_columns.map((col) => col[i])
  );

  const nStocks = symbols.length;
  if (nStocks === 0) throw new Error("No symbols found in DB holdings");

  const { Alglib } = await loadAlglib();
  const alglib = new Alglib();

  const initialGuess =
    opts?.initialGuess ?? defaultInitialGuess(baselines.length);
  if (initialGuess.length !== baselines.length) {
    throw new Error(
      `initialGuess length (${initialGuess.length}) must match baselineEtfs length (${baselines.length})`
    );
  }

  const objectiveFunction = (weights: number[]): number => {
    let sumSquaredDiff = 0;
    for (let i = 0; i < nStocks; i++) {
      let synthetic = 0;
      for (let j = 0; j < weights.length; j++)
        synthetic += H_stack[i][j] * weights[j];
      const diff = synthetic - H_target[i];
      sumSquaredDiff += diff * diff;
    }
    return sumSquaredDiff;
  };

  const initialObjectiveValue = objectiveFunction(initialGuess);

  try {
    await alglib.promise;
    alglib.add_function(objectiveFunction);

    // weights must sum to 1
    alglib.add_equality_constraint(
      (w) => w.reduce((sum, x) => sum + x, 0) - 1.0
    );

    // 0 <= w_i <= 1
    for (let j = 0; j < baselines.length; j++) {
      alglib.add_less_than_or_equal_to_constraint((w) => -w[j]);
      alglib.add_less_than_or_equal_to_constraint((w) => w[j] - 1.0);
    }

    const ok = alglib.solve(
      "min",
      initialGuess,
      [],
      opts?.maxIterations ?? 5000,
      100.0,
      0.01,
      1e-7,
      1e-7
    );

    if (!ok) {
      throw new Error(
        `Optimization failed. Status: ${JSON.stringify(alglib.get_status())}`
      );
    }

    const weights = alglib.get_results();
    const finalObjectiveValue = objectiveFunction(weights);
    const metrics = computeMetrics(
      H_target,
      H_stack,
      weights,
      initialObjectiveValue,
      finalObjectiveValue
    );

    const optimalWeights: Record<string, number> = {};
    const weightsPercentages: Record<string, number> = {};
    for (let i = 0; i < baselines.length; i++) {
      optimalWeights[baselines[i].toLowerCase()] = weights[i];
      weightsPercentages[baselines[i].toLowerCase()] = weights[i] * 100;
    }

    const weightsSum = weights.reduce((sum, w) => sum + w, 0);

    return {
      timestamp: new Date().toISOString(),
      targetEtf: target,
      baselineEtfs: baselines,
      optimalWeights,
      weightsPercentages,
      optimizationMetrics: metrics,
      constraints: {
        weightsSum,
        allWeightsNonNegative: weights.every((w) => w >= 0),
        allWeightsLessThanOne: weights.every((w) => w <= 1),
      },
    };
  } finally {
    alglib.remove();
  }
}
