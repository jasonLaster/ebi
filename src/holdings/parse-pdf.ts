import * as fs from "fs";
import { Holding, HoldingsData } from "../lib/types";
import { HoldingsDb, openHoldingsDb } from "../lib/db";
import { writeHoldingsOutputs, resolvePath } from "./storage";

export type Logger = Pick<typeof console, "log" | "warn" | "error">;

function noop(): void {}

export function getLogger(opts?: {
  silent?: boolean;
  logger?: Logger;
}): Logger {
  if (opts?.logger) return opts.logger;
  if (opts?.silent) return { log: noop, warn: noop, error: noop };
  return console;
}

export async function extractTextFromPdf(
  inputPdfPath: string,
  opts?: { silent?: boolean; logger?: Logger }
): Promise<string> {
  const logger = getLogger(opts);
  const resolved = resolvePath(inputPdfPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`PDF file not found: ${resolved}`);
  }

  logger.log(`Reading PDF from: ${resolved}`);
  const dataBuffer = fs.readFileSync(resolved);
  const uint8Array = new Uint8Array(dataBuffer);

  logger.log("Parsing PDF content...");

  // Ensure the PDF.js worker message handler is available in Node/serverless.
  //
  // In NodeJS, PDF.js uses a "fake worker" that loads `WorkerMessageHandler`
  // via a dynamic import of `GlobalWorkerOptions.workerSrc`. In Next/Vercel
  // server builds, the default `./pdf.worker.mjs` path can break after bundling,
  // yielding:
  //   Setting up fake worker failed: "Cannot find module './pdf.worker.mjs' ..."
  //
  // Preloading the worker module and exposing it on `globalThis.pdfjsWorker`
  // allows PDF.js to skip the fragile dynamic import and use the handler
  // directly.
  type PdfJsWorkerModule = { WorkerMessageHandler?: unknown };
  const g = globalThis as unknown as { pdfjsWorker?: PdfJsWorkerModule } & Record<
    string,
    unknown
  >;

  if (!g.pdfjsWorker?.WorkerMessageHandler) {
    try {
      const workerMod = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
      g.pdfjsWorker = workerMod as unknown as PdfJsWorkerModule;
    } catch (err) {
      logger.warn(
        `Warning: Failed to preload pdfjs worker module: ${String(
          err instanceof Error ? err.message : err
        )}`
      );
    }
  }

  // In Node/serverless environments (e.g. Vercel), `pdfjs-dist` may attempt to
  // polyfill `DOMMatrix`, `ImageData`, and `Path2D` via optional native deps
  // (notably `@napi-rs/canvas`). If those deps are not installed/available,
  // `pdfjs-dist` will log warnings and can crash with `ReferenceError: DOMMatrix
  // is not defined` during module initialization.
  //
  // Since we only use text extraction (not rendering), provide lightweight
  // polyfills to keep `pdfjs-dist` happy without native canvas bindings.
  type DomMatrixLike = {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
  };

  function isDomMatrixLike(v: unknown): v is DomMatrixLike {
    if (!v || typeof v !== "object") return false;
    const o = v as Record<string, unknown>;
    return (
      typeof o.a === "number" &&
      typeof o.b === "number" &&
      typeof o.c === "number" &&
      typeof o.d === "number" &&
      typeof o.e === "number" &&
      typeof o.f === "number"
    );
  }

  if (!globalThis.DOMMatrix) {
    class DOMMatrixPolyfill {
      // Store as 2D matrix [a,b,c,d,e,f]
      a: number;
      b: number;
      c: number;
      d: number;
      e: number;
      f: number;

      constructor(init?: number[] | DomMatrixLike | DOMMatrixPolyfill) {
        const m = isDomMatrixLike(init) ? init : null;
        const arr = Array.isArray(init) ? init : null;
        this.a = arr?.[0] ?? m?.a ?? 1;
        this.b = arr?.[1] ?? m?.b ?? 0;
        this.c = arr?.[2] ?? m?.c ?? 0;
        this.d = arr?.[3] ?? m?.d ?? 1;
        this.e = arr?.[4] ?? m?.e ?? 0;
        this.f = arr?.[5] ?? m?.f ?? 0;
      }

      preMultiplySelf(other: unknown) {
        // this = other * this
        const o =
          other instanceof DOMMatrixPolyfill ? other : new DOMMatrixPolyfill(other as DomMatrixLike);
        const a = o.a * this.a + o.c * this.b;
        const b = o.b * this.a + o.d * this.b;
        const c = o.a * this.c + o.c * this.d;
        const d = o.b * this.c + o.d * this.d;
        const e = o.a * this.e + o.c * this.f + o.e;
        const f = o.b * this.e + o.d * this.f + o.f;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        return this;
      }

      multiplySelf(other: unknown) {
        // this = this * other
        const o =
          other instanceof DOMMatrixPolyfill ? other : new DOMMatrixPolyfill(other as DomMatrixLike);
        const a = this.a * o.a + this.c * o.b;
        const b = this.b * o.a + this.d * o.b;
        const c = this.a * o.c + this.c * o.d;
        const d = this.b * o.c + this.d * o.d;
        const e = this.a * o.e + this.c * o.f + this.e;
        const f = this.b * o.e + this.d * o.f + this.f;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        return this;
      }

      translate(tx = 0, ty = 0) {
        this.e += tx;
        this.f += ty;
        return this;
      }

      scale(sx = 1, sy = sx) {
        this.a *= sx;
        this.b *= sx;
        this.c *= sy;
        this.d *= sy;
        return this;
      }

      invertSelf() {
        const det = this.a * this.d - this.b * this.c;
        if (!det) return this;
        const a = this.d / det;
        const b = -this.b / det;
        const c = -this.c / det;
        const d = this.a / det;
        const e = (this.c * this.f - this.d * this.e) / det;
        const f = (this.b * this.e - this.a * this.f) / det;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        return this;
      }
    }
    g.DOMMatrix = DOMMatrixPolyfill as unknown;
  }

  if (!globalThis.ImageData) {
    class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    }
    g.ImageData = ImageDataPolyfill as unknown;
  }

  if (!globalThis.Path2D) {
    class Path2DPolyfill {
      constructor(_path?: unknown) {
        void _path;
      }
      addPath(_path: unknown, _transform?: unknown) {
        void _path;
        void _transform;
      }
      closePath() {}
    }
    g.Path2D = Path2DPolyfill as unknown;
  }

  // Use pdfjs-dist directly and disable workers. This avoids Next/Turbopack
  // trying (and failing) to bundle/resolve `pdf.worker.mjs`.
  //
  // This is the root cause of:
  // "Setting up fake worker failed: Cannot find module ... pdf.worker.mjs"
  type PdfJs = {
    getDocument: (opts: {
      data: Uint8Array;
      disableWorker: boolean;
      verbosity: number;
    }) => { promise: Promise<PdfDocument> };
  };
  type PdfDocument = {
    numPages: number;
    getPage: (n: number) => Promise<PdfPage>;
  };
  type PdfPage = {
    getTextContent: () => Promise<{
      items: Array<{
        str?: string;
        transform?: number[]; // [a,b,c,d,e,f] where e=x, f=y
      }>;
    }>;
  };

  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfJs;
  const getDocument = pdfjs.getDocument;

  const doc = await getDocument({
    data: uint8Array,
    disableWorker: true,
    verbosity: 0,
  }).promise;

  const pages: string[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    const items = Array.isArray(content.items) ? content.items : [];

    // Reconstruct lines by grouping text items by their Y coordinate, then
    // ordering items by X coordinate within each line.
    //
    // This preserves line breaks, which our holdings parser relies on.
    const linesByY = new Map<number, Array<{ x: number; str: string }>>();

    for (const it of items) {
      const str = typeof it.str === "string" ? it.str.trim() : "";
      if (!str) continue;

      const t = Array.isArray(it.transform) ? it.transform : null;
      const x = typeof t?.[4] === "number" ? t[4] : 0;
      const y = typeof t?.[5] === "number" ? t[5] : 0;

      // Bucket Y to reduce fragmentation (PDFs often vary slightly per glyph).
      const yKey = Math.round(y * 2) / 2; // 0.5pt buckets
      const arr = linesByY.get(yKey) ?? [];
      arr.push({ x, str });
      linesByY.set(yKey, arr);
    }

    const sortedY = Array.from(linesByY.keys()).sort((a, b) => b - a);
    const lines: string[] = [];
    for (const y of sortedY) {
      const parts = (linesByY.get(y) ?? []).sort((a, b) => a.x - b.x);
      const line = parts.map((p) => p.str).join(" ").replace(/\s+/g, " ").trim();
      if (line) lines.push(line);
    }

    pages.push(lines.join("\n"));
  }

  return pages.join("\n");
}

export function parseHoldingsFromText(
  text: string,
  opts?: { silent?: boolean; logger?: Logger }
): Record<string, Holding> {
  const logger = getLogger(opts);
  logger.log("=== Parsing Extracted Holdings (Final Format) ===");

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  logger.log(`Found ${lines.length} lines of text`);

  const holdings: Record<string, Holding> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header lines and page breaks
    if (
      line.toLowerCase().includes("fund holdings") ||
      line.toLowerCase().includes("stock ticker") ||
      line.toLowerCase().includes("security name") ||
      line.toLowerCase().includes("cusip") ||
      line.toLowerCase().includes("shares") ||
      line.toLowerCase().includes("price") ||
      line.toLowerCase().includes("mkt value") ||
      line.toLowerCase().includes("weightings") ||
      line.match(/^-- \d+ of \d+ --$/) ||
      line.length < 10
    ) {
      continue;
    }

    // Example: "AAPL Apple Inc 037833100 94,435.00 273.67 25,844,026.45 4.48"
    const tickerMatch = line.match(/^([A-Z]{1,5})\s+(.+)$/);
    if (!tickerMatch) continue;

    const ticker = tickerMatch[1];
    const restOfLine = tickerMatch[2];
    const parts = restOfLine.split(/\s+/);
    if (parts.length < 6) continue;

    // Find CUSIP (9 alphanumeric)
    let cusipIndex = -1;
    for (let j = parts.length - 5; j >= 0; j--) {
      if (/^[A-Z0-9]{9}$/.test(parts[j])) {
        cusipIndex = j;
        break;
      }
    }
    if (cusipIndex === -1) continue;

    const weight = parseFloat(parts[parts.length - 1]) / 100; // pct → decimal
    const marketValue = parseFloat(parts[parts.length - 2].replace(/,/g, ""));
    const price = parseFloat(parts[parts.length - 3].replace(/,/g, ""));
    const shares = parseFloat(parts[parts.length - 4].replace(/,/g, ""));
    const companyName = parts.slice(0, cusipIndex).join(" ");

    if (
      ticker &&
      companyName &&
      !Number.isNaN(weight) &&
      !Number.isNaN(marketValue)
    ) {
      holdings[ticker] = {
        name: companyName,
        weight,
        market_value: marketValue,
        actual_weight: weight,
        price: Number.isNaN(price) ? null : price,
        shares: Number.isNaN(shares) ? 0 : shares,
      };
    }
  }

  logger.log(`\nExtracted ${Object.keys(holdings).length} holdings`);
  return holdings;
}

export function analyzeHoldings(
  holdings: Record<string, Holding>,
  opts?: { silent?: boolean; logger?: Logger }
): void {
  const logger = getLogger(opts);
  logger.log("\n=== Holdings Analysis ===");

  const totalWeight = Object.values(holdings).reduce(
    (sum, h) => sum + h.weight,
    0
  );
  logger.log(`Total weight: ${(totalWeight * 100).toFixed(2)}%`);

  const sorted = Object.entries(holdings).sort(
    ([, a], [, b]) => b.weight - a.weight
  );
  logger.log("\nTop 10 holdings by weight:");
  sorted.slice(0, 10).forEach(([ticker, data], idx) => {
    logger.log(
      `${idx + 1}. ${ticker}: ${data.name} (${(data.weight * 100).toFixed(2)}%)`
    );
  });
}

export async function parsePdfToHoldingsData(
  inputPdfPath: string,
  opts?: { silent?: boolean; logger?: Logger }
): Promise<HoldingsData> {
  const text = await extractTextFromPdf(inputPdfPath, opts);
  const holdings = parseHoldingsFromText(text, opts);
  if (Object.keys(holdings).length === 0) {
    throw new Error("No holdings found. Check the PDF format.");
  }
  return {
    etfSymbol: "EBI",
    lastUpdated: new Date().toISOString(),
    holdings,
  };
}

export async function parsePdfToJson(
  inputPdfPath: string,
  outputJsonPath: string,
  opts?: {
    analyze?: boolean;
    silent?: boolean;
    logger?: Logger;
    db?: HoldingsDb;
  }
): Promise<HoldingsData> {
  const data = await parsePdfToHoldingsData(inputPdfPath, opts);

  const db = opts?.db ?? (await openHoldingsDb());
  try {
    const out = await writeHoldingsOutputs(data, {
      jsonPath: outputJsonPath,
      db,
    });

    if (opts?.analyze !== false) analyzeHoldings(data.holdings, opts);

    const logger = getLogger(opts);
    if (!opts?.silent) {
      logger.log(
        `\n✅ Successfully extracted ${Object.keys(data.holdings).length} holdings from PDF`
      );
      logger.log(`📁 JSON file saved to: ${out.jsonPath}`);
    }
  } finally {
    if (!opts?.db) {
      // Only close if we created the connection
      db.close();
    }
  }

  return data;
}
