import * as fs from "fs";
import * as path from "path";
import { HoldingsData } from "../lib/types";
import { openHoldingsDb, storeHoldingsData, HoldingsDb } from "../lib/db";

export function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

export function writeHoldingsJson(
  data: HoldingsData,
  outputJsonPath: string
): string {
  const resolved = resolvePath(outputJsonPath);
  ensureParentDir(resolved);
  fs.writeFileSync(resolved, JSON.stringify(data, null, 2));
  return resolved;
}

export async function writeHoldingsSqlite(
  data: HoldingsData,
  db: HoldingsDb
): Promise<void> {
  await storeHoldingsData(db, data);
}

export async function writeHoldingsOutputs(
  data: HoldingsData,
  opts: { jsonPath: string; db?: HoldingsDb }
): Promise<{ jsonPath: string }> {
  const jsonPath = writeHoldingsJson(data, opts.jsonPath);
  if (opts.db) {
    await writeHoldingsSqlite(data, opts.db);
  }
  return { jsonPath };
}
