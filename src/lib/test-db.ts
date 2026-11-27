import { createClient } from "@libsql/client";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ensureSchema, type HoldingsDb } from "./db";

/**
 * A fresh, throwaway SQLite database for tests. Tests must never use
 * openHoldingsDb(): it connects to whatever Turso DB is in the env, which
 * after `vercel env pull` is production.
 */
export async function openTestDb(): Promise<HoldingsDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ebi-test-db-"));
  const db = createClient({ url: `file:${path.join(dir, "test.db")}` });
  await ensureSchema(db);
  return db;
}
