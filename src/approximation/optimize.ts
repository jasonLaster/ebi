import {
  HoldingsDb,
  getHoldingsWeightMap,
  getAllUniqueSymbols,
} from "@/src/lib/db";
import { Alglib } from "./alglib.js";

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

// AlglibCtor type removed - not used

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

  const targetMap = await getHoldingsWeightMap(db, target, { weightField });
  const baselineMaps = await Promise.all(
    baselines.map((s) => getHoldingsWeightMap(db, s, { weightField }))
  );

  // Use DB tickers as the master universe, but optimization only needs union across these ETFs.
  // Pulling from DB avoids relying on JSON exports and ensures we match what the app uses.
  const allSymbols = await getAllUniqueSymbols(db);
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
      (w: number[]) => w.reduce((sum: number, x: number) => sum + x, 0) - 1.0
    );

    // 0 <= w_i <= 1
    for (let j = 0; j < baselines.length; j++) {
      alglib.add_less_than_or_equal_to_constraint((w: number[]) => -w[j]);
      alglib.add_less_than_or_equal_to_constraint((w: number[]) => w[j] - 1.0);
    }

    const ok = alglib.solve(
      "min",
      initialGuess,
      [] as unknown[],
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
    if (!weights || weights.length === 0) {
      throw new Error("Optimization returned no results");
    }

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
      optimalWeights[baselines[i].toLowerCase()] = weights[i] ?? 0;
      weightsPercentages[baselines[i].toLowerCase()] = (weights[i] ?? 0) * 100;
    }

    const weightsSum = weights.reduce((sum: number, w: number) => sum + w, 0);

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
