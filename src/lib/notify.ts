import { Resend } from "resend";

/**
 * Email notifications for operational issues (failed syncs, stale data,
 * upstream API failures, unhandled server errors), sent through Resend.
 *
 * Env:
 *   RESEND_API_KEY   – Resend key (send-only is enough)
 *   ALERT_EMAIL_TO   – comma-separated recipients
 *   ALERT_EMAIL_FROM – sender; defaults to Resend's shared onboarding address,
 *                      which can only deliver to the Resend account owner
 *
 * Missing config makes this a logged no-op so local dev never breaks.
 */

const DEFAULT_FROM = "EBI Alerts <onboarding@resend.dev>";
/** Suppress identical alerts from the same instance for this long. */
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;

const recentlySent = new Map<string, number>();

export interface IssueReport {
  /** Short, stable summary; also the dedupe key. */
  subject: string;
  error?: unknown;
  /** Extra key/values rendered into the email body. */
  context?: Record<string, unknown>;
}

export type NotifyResult =
  | { sent: true; id: string | undefined }
  | { sent: false; reason: string };

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return typeof error === "string" ? error : JSON.stringify(error, null, 2);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatIssueEmail(report: IssueReport): {
  subject: string;
  text: string;
  html: string;
} {
  const env = process.env.VERCEL_ENV ?? "local";
  const subject = `[ebi${env === "production" ? "" : `:${env}`}] ${report.subject}`;

  const meta: Record<string, unknown> = {
    environment: env,
    deployment: process.env.VERCEL_URL,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
    time: new Date().toISOString(),
    ...report.context,
  };
  const metaLines = Object.entries(meta)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(
      ([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`
    );

  const errorText = report.error !== undefined ? describeError(report.error) : "";
  const text = [report.subject, "", ...metaLines, ...(errorText ? ["", errorText] : [])].join("\n");
  const html = `<h2 style="font-family:sans-serif">${escapeHtml(report.subject)}</h2>
<pre style="font-size:13px">${escapeHtml(metaLines.join("\n"))}</pre>
${errorText ? `<pre style="font-size:12px;background:#f6f6f6;padding:12px;white-space:pre-wrap">${escapeHtml(errorText)}</pre>` : ""}`;

  return { subject, text, html };
}

export async function notifyIssue(report: IssueReport): Promise<NotifyResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = (process.env.ALERT_EMAIL_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!apiKey || to.length === 0) {
    console.warn(
      `[notify] Skipping email (RESEND_API_KEY or ALERT_EMAIL_TO not set): ${report.subject}`
    );
    return { sent: false, reason: "not_configured" };
  }

  const now = Date.now();
  const last = recentlySent.get(report.subject);
  if (last && now - last < DEDUPE_WINDOW_MS) {
    return { sent: false, reason: "deduped" };
  }
  recentlySent.set(report.subject, now);

  try {
    const { subject, text, html } = formatIssueEmail(report);
    const { data, error } = await new Resend(apiKey).emails.send({
      from: process.env.ALERT_EMAIL_FROM || DEFAULT_FROM,
      to,
      subject,
      text,
      html,
    });
    if (error) {
      console.error("[notify] Resend rejected alert email:", error);
      return { sent: false, reason: error.message };
    }
    console.log(`[notify] Alert email sent (${data?.id}): ${report.subject}`);
    return { sent: true, id: data?.id };
  } catch (err) {
    // Never let alerting failures mask the original problem.
    console.error("[notify] Failed to send alert email:", err);
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
