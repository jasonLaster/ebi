#!/usr/bin/env bun

/**
 * Tight feedback-loop smoke test for the PDF parsing path under Next dev + Turbopack.
 *
 * Runs `bun next dev --turbopack`, waits for readiness, hits:
 *   GET /api/_test/pdf-parse
 *
 * Fails fast if the notorious pdfjs-dist worker resolution breaks again.
 */

import { Command } from "commander";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    // ignore
  }
  return { res, text, json };
}

async function main() {
  const program = new Command()
    .name("smoke-next-pdf-parse")
    .description("Smoke test PDF parsing under Next dev + Turbopack")
    .option("-p, --port <port>", "Port for dev server", "3105")
    .option("-t, --timeout <seconds>", "Overall timeout", "90")
    .parse(process.argv);

  const opts = program.opts<{ port: string; timeout: string }>();
  const port = Number(opts.port);
  const timeoutMs = Number(opts.timeout) * 1000;

  const baseUrl = `http://localhost:${port}`;
  const testUrl = `${baseUrl}/api/_test/pdf-parse`;

  console.log(`Starting Next dev (turbopack) on ${baseUrl}`);

  const proc = Bun.spawn(
    ["bun", "next", "dev", "--turbopack", "-p", String(port)],
    {
      cwd: process.cwd(),
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        // Keep it explicit: pdf parsing must not rely on worker.
        PDFJS_DISABLE_WORKER: "1",
      },
    }
  );

  const start = Date.now();
  try {
    // Wait for the test endpoint to become reachable.
    while (Date.now() - start < timeoutMs) {
      try {
        const { res, json } = await fetchJson(testUrl);
        const obj =
          json && typeof json === "object"
            ? (json as Record<string, unknown>)
            : null;

        if (res.ok && obj?.success === true) {
          console.log("\n✅ PDF parse smoke test passed");
          console.log(`textLength: ${String(obj.textLength ?? "")}`);
          return;
        }
        // If endpoint is up but failing, fail fast with details.
        if (res.status >= 400) {
          console.error("\n❌ PDF parse smoke test failed");
          console.error(`HTTP ${res.status}`);
          if (obj) console.error(JSON.stringify(obj, null, 2));
          else console.error("Non-JSON response from test endpoint");
          process.exit(1);
        }
      } catch {
        // not ready yet
      }

      await sleep(500);
    }

    console.error(`\n❌ Timed out waiting for ${testUrl}`);
    process.exit(1);
  } finally {
    proc.kill();
    // Give the process a moment to exit cleanly.
    await sleep(500);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
