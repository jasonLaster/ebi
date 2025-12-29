declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  // PDF.js worker entrypoint used for Node "fake worker" mode.
  // We don't need full typings here; we just need `WorkerMessageHandler`.
  export const WorkerMessageHandler: unknown;
}
