import { Command } from "commander";

interface SyncResponse {
  success: boolean;
  message?: string;
  targetEtf?: string;
  optimizationMetrics?: {
    improvementPercent?: number;
    averageError?: number;
    maxError?: number;
    errorCount?: number;
    totalStocks?: number;
  };
  [key: string]: unknown;
}

async function testSyncEndpoint(
  url: string,
  timeout: number = 180000
): Promise<void> {
  const endpoint = `${url}/api/sync`;
  console.log(`Testing sync endpoint at: ${endpoint}`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const httpCode = response.status;
    console.log(`HTTP Status: ${httpCode}`);

    const body: SyncResponse = await response.json();
    console.log("Response:", JSON.stringify(body, null, 2));

    // Verify HTTP status
    if (httpCode !== 200) {
      console.error(`❌ Sync endpoint returned status ${httpCode}`);
      process.exit(1);
    }

    // Verify JSON response
    if (body.success !== true) {
      console.error("❌ Sync endpoint returned success=false");
      console.error(JSON.stringify(body, null, 2));
      process.exit(1);
    }

    // Verify required fields
    if (body.targetEtf !== "EBI") {
      console.error(
        `❌ Expected targetEtf=EBI, got ${body.targetEtf ?? "undefined"}`
      );
      process.exit(1);
    }

    // Verify optimization metrics exist
    const improvement = body.optimizationMetrics?.improvementPercent;
    if (improvement === undefined || improvement === null) {
      console.error("❌ Missing optimizationMetrics.improvementPercent");
      process.exit(1);
    }

    console.log("✅ Sync endpoint test passed!");
    console.log(`Improvement: ${improvement}%`);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error(`❌ Request timed out after ${timeout / 1000} seconds`);
      } else {
        console.error(`❌ Error testing sync endpoint: ${error.message}`);
      }
    } else {
      console.error("❌ Unknown error occurred");
    }
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("test-sync")
    .description("Test the sync endpoint")
    .argument(
      "[url]",
      "Base URL to test (e.g., https://example.vercel.app)",
      "http://localhost:3000"
    )
    .option("-t, --timeout <seconds>", "Request timeout in seconds", "180")
    .parse(process.argv);

  const [url] = program.args as [string];
  const opts = program.opts<{ timeout: string }>();
  const timeout = parseInt(opts.timeout, 10) * 1000;

  // Normalize URL: ensure it has a protocol and remove trailing slash
  let normalizedUrl = url.replace(/\/$/, "");
  if (!normalizedUrl.match(/^https?:\/\//)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  await testSyncEndpoint(normalizedUrl, timeout);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
