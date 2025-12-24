/// <reference types="bun-types" />
/// <reference types="node" />

import "dotenv/config";
import { Command } from "commander";
import {
  parsePdfToJson,
  parsePdfToHoldingsData,
  parseHoldingsFromText,
  extractTextFromPdf,
  analyzeHoldings,
} from "@/src/holdings/parse-pdf";
import { openHoldingsDb } from "@/src/lib/db";

export {
  parsePdfToJson,
  parsePdfToHoldingsData,
  parseHoldingsFromText,
  extractTextFromPdf,
  analyzeHoldings,
};
export type { Holding, HoldingsData } from "@/src/lib/types";

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("parse-pdf")
    .description("Parse PDF holdings files into JSON format")
    .version("1.0.0")
    .argument("<input-pdf>", "Path to input PDF file")
    .argument("<output-json>", "Path to output JSON file")
    .option("-a, --no-analyze", "Skip holdings analysis")
    .option("-s, --silent", "Suppress output messages")
    .option("--no-db", "Disable database output")
    .action(
      async (
        inputPdf: string,
        outputJson: string,
        options: { analyze: boolean; silent: boolean; db?: boolean }
      ) => {
        try {
          const db = options.db === false ? undefined : await openHoldingsDb();
          try {
            await parsePdfToJson(inputPdf, outputJson, {
              analyze: options.analyze !== false,
              silent: options.silent === true,
              db,
            });
          } finally {
            if (db) db.close();
          }
        } catch (error) {
          console.error("Error processing PDF:", error);
          process.exit(1);
        }
      }
    );

  program.parse();
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
