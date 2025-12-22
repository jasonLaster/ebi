import "dotenv/config";
import { Hyperbrowser } from "@hyperbrowser/sdk";
import * as fs from "fs";
import * as path from "path";
import AdmZip from "adm-zip";

/**
 * Downloads the latest EBI holdings PDF from Longview Research Partners
 * @param outputPath Optional custom output path. If not provided, generates a timestamped filename in the 'in' directory
 * @returns The path to the downloaded PDF file
 */
export async function downloadHoldingsPdf(
  outputPath?: string
): Promise<string> {
  const apiKey = process.env.HYPERBROWSER_API_KEY;
  if (!apiKey) {
    throw new Error("HYPERBROWSER_API_KEY environment variable is required");
  }

  const client = new Hyperbrowser({
    apiKey,
  });

  // Generate timestamp for filename if not provided
  if (!outputPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
    const filename = `ebi-holdings-${timestamp}.pdf`;
    outputPath = path.resolve(process.cwd(), "in", filename);
  } else {
    outputPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);
  }

  // Ensure the output directory exists
  const inDir = path.dirname(outputPath);
  if (!fs.existsSync(inDir)) {
    fs.mkdirSync(inDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);

  console.log(`🚀 Starting PDF download from Longview Research Partners...`);
  console.log(`📁 Output will be saved to: ${outputPath}`);

  try {
    // Create a browser session with download support
    const session = await client.sessions.create({
      saveDownloads: true,
    });

    console.log(`✅ Browser session created: ${session.id}`);

    try {
      // Use browser-use agent to navigate and download the PDF
      const result = await client.agents.browserUse.startAndWait({
        task: `Navigate to https://longviewresearchpartners.com/charts/ and click the "Download PDF" button or link to download the PDF file. The download should start automatically.`,
        sessionId: session.id,
        llm: "gemini-2.5-flash",
        maxSteps: 30,
        keepBrowserOpen: false,
      });

      console.log(`✅ Task completed: ${result.status}`);
      if (result.data?.finalResult) {
        console.log(`📝 Agent result: ${result.data.finalResult}`);
      }

      // Wait a bit for the download to complete and be processed
      console.log(`⏳ Waiting for download to be processed...`);
      let downloadsResponse;
      let attempts = 0;
      const maxAttempts = 30; // Wait up to 5 minutes (10s * 30)

      while (attempts < maxAttempts) {
        downloadsResponse = await client.sessions.getDownloadsURL(session.id);

        if (downloadsResponse.status === "completed") {
          break;
        } else if (downloadsResponse.status === "failed") {
          throw new Error(
            `Download processing failed: ${
              downloadsResponse.error || "Unknown error"
            }`
          );
        } else if (downloadsResponse.status === "not_enabled") {
          throw new Error("Downloads were not enabled for this session");
        }

        // Status is "pending" or "in_progress", wait and retry
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds
        attempts++;
        console.log(
          `⏳ Status: ${downloadsResponse.status}, attempt ${attempts}/${maxAttempts}...`
        );
      }

      if (!downloadsResponse || downloadsResponse.status !== "completed") {
        throw new Error(
          `Download did not complete within timeout. Status: ${downloadsResponse?.status}`
        );
      }

      if (!downloadsResponse.downloadsUrl) {
        throw new Error("Downloads URL not available");
      }

      console.log(
        `📥 Downloading zip file from: ${downloadsResponse.downloadsUrl}`
      );

      // Download the zip file
      const zipResponse = await fetch(downloadsResponse.downloadsUrl);
      if (!zipResponse.ok) {
        throw new Error(
          `Failed to download zip file: ${zipResponse.statusText}`
        );
      }

      const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
      const tempZipPath = path.join(inDir, `temp-downloads-${timestamp}.zip`);
      fs.writeFileSync(tempZipPath, zipBuffer);

      // Extract the zip file and find the PDF
      const zip = new AdmZip(tempZipPath);
      const zipEntries = zip.getEntries();

      // Find the PDF file in the zip
      const pdfEntry = zipEntries.find(
        (entry) =>
          entry.name.toLowerCase().endsWith(".pdf") && !entry.isDirectory
      );

      if (!pdfEntry) {
        throw new Error(
          `No PDF file found in downloads zip. Files found: ${zipEntries
            .map((e) => e.name)
            .join(", ")}`
        );
      }

      console.log(`📄 Found PDF in zip: ${pdfEntry.name}`);

      // Extract and save the PDF
      const pdfBuffer = pdfEntry.getData();
      fs.writeFileSync(outputPath, pdfBuffer);

      // Clean up temp zip file
      fs.unlinkSync(tempZipPath);

      console.log(`✅ PDF saved successfully to: ${outputPath}`);
      
      return outputPath;
    } finally {
      // Clean up the session
      await client.sessions.stop(session.id);
      console.log(`🧹 Session closed`);
    }
  } catch (err) {
    console.error(`❌ Error:`, err);
    throw err;
  }
}

async function main(): Promise<void> {
  const pdfPath = await downloadHoldingsPdf();
  console.log(`\n✅ Download complete: ${pdfPath}`);
}

// Only run main if this script is executed directly
if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
