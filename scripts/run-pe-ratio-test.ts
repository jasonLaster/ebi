#!/usr/bin/env bun

/**
 * Standalone test runner for P/E ratio tests
 * 
 * Usage:
 *   bun scripts/run-pe-ratio-test.ts
 *   API_URL=http://localhost:3000/api/performance FRONTEND_URL=http://localhost:3000 bun scripts/run-pe-ratio-test.ts
 */

import { spawn } from "bun";

const scriptPath = "./scripts/test-pe-ratio.test.ts";

console.log("🧪 Running P/E Ratio Tests\n");
console.log(`API URL: ${process.env.API_URL || "http://localhost:3000/api/performance"}`);
console.log(`Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}\n`);

const proc = spawn({
  cmd: ["bun", "test", scriptPath],
  cwd: process.cwd(),
  stdout: "inherit",
  stderr: "inherit",
  env: process.env,
});

const exitCode = await proc.exited;

if (exitCode !== 0) {
  console.error(`\n❌ Tests failed with exit code ${exitCode}`);
  process.exit(exitCode);
} else {
  console.log("\n✅ All tests passed!");
}
