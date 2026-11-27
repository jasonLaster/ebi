import type { Instrumentation } from "next";
import { registerOTel } from "@vercel/otel";

export function register() {
  registerOTel({ serviceName: process.env.VERCEL_PROJECT_NAME ?? "ebi" });
}

/** Emails us about any server error Next.js captures that a route didn't handle. */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const { notifyIssue } = await import("@/src/lib/notify");
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest: unknown }).digest)
      : undefined;
  await notifyIssue({
    subject: `Unhandled server error on ${context.routePath}`,
    error: err,
    context: {
      method: request.method,
      path: request.path,
      routeType: context.routeType,
      digest,
    },
  });
};
