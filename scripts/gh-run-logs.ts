#!/usr/bin/env bun

/**
 * Get logs for the last GitHub Actions run
 * Uses Bun's interpreted shell to execute gh CLI commands
 */

import { Command } from "commander";

const { $ } = Bun;

const program = new Command();

program
  .name("gh-run-logs")
  .description("Get logs for the last GitHub Actions run")
  .option("-a, --all", "Show all logs (default: failed logs only)", false)
  .parse(process.argv);

const options = program.opts();

async function getLastRunLogs() {
  try {
    // Get the databaseId of the last run
    const lastRunId =
      await $`gh run list --limit 1 --json databaseId --jq '.[0].databaseId'`.text();
    const runId = lastRunId.trim();

    if (!runId || runId === "null") {
      console.error("No runs found");
      process.exit(1);
    }

    // Check if the run is in progress
    const runStatus =
      await $`gh run view ${runId} --json status --jq '.status'`.text();
    const status = runStatus.trim();

    console.log(`Fetching logs for run: ${runId}`);
    console.log(`Status: ${status}`);
    console.log("---\n");

    // Determine which logs to show (default to failed logs)
    const showAll = options.all;
    const logFlag = showAll ? "--log" : "--log-failed";

    // If run is in progress, watch it; otherwise get logs
    if (status === "in_progress" || status === "queued") {
      console.log("Run is in progress, watching logs...\n");
      // Use watch to stream logs in real-time
      await $`gh run watch ${runId} ${showAll ? "" : "--log-failed"}`.quiet(
        false
      );
    } else {
      // Get the logs for completed runs
      await $`gh run view ${runId} ${logFlag}`.quiet(false);
    }
  } catch (error: unknown) {
    const errorMessage =
      typeof (error as { stderr?: unknown } | null)?.stderr === "string"
        ? ((error as { stderr: string }).stderr ?? "")
        : error instanceof Error
          ? error.message
          : String(error);

    if (
      errorMessage.includes("still in progress") ||
      errorMessage.includes("logs will be available")
    ) {
      console.log("Run is in progress, watching logs...\n");
      try {
        // Get run ID from error context or re-fetch
        const lastRunId =
          await $`gh run list --limit 1 --json databaseId --jq '.[0].databaseId'`.text();
        const runId = lastRunId.trim();
        const showAll = options.all;
        await $`gh run watch ${runId} ${showAll ? "" : "--log-failed"}`.quiet(
          false
        );
      } catch (watchError) {
        console.error("Error watching logs:", watchError);
        process.exit(1);
      }
    } else {
      console.error("Error fetching logs:", error);
      process.exit(1);
    }
  }
}

getLastRunLogs();
