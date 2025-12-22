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

export function writeHoldingsJson(data: HoldingsData, outputJsonPath: string): string {
  const resolved = resolvePath(outputJsonPath);
  ensureParentDir(resolved);
  fs.writeFileSync(resolved, JSON.stringify(data, null, 2));
  return resolved;
}

export function writeHoldingsSqlite(
  data: HoldingsData,
  dbOrPath: HoldingsDb | string
): void {
  const db = typeof dbOrPath === "string" ? openHoldingsDb(dbOrPath) : dbOrPath;
  storeHoldingsData(db, data);
  if (typeof dbOrPath === "string") db.close();
}

export function writeHoldingsOutputs(
  data: HoldingsData,
  opts: { jsonPath: string; sqlitePath?: string; db?: HoldingsDb }
): { jsonPath: string } {
  const jsonPath = writeHoldingsJson(data, opts.jsonPath);
  const dbToUse = opts.db ?? opts.sqlitePath;
  if (dbToUse) writeHoldingsSqlite(data, dbToUse);
  return { jsonPath };
}

