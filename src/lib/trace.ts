import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";

const tracer = trace.getTracer("ebi");

/**
 * Runs `operation` inside an active OpenTelemetry span so it shows up in
 * Vercel Tracing. Failures are recorded on the span and rethrown.
 * Span names should be stable `<area>.<operation>` strings.
 */
export function measure<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Error) span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  });
}
