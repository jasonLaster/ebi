import { afterEach, describe, expect, test } from "bun:test";
import { formatIssueEmail, notifyIssue } from "./notify";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("notifyIssue", () => {
  test("is a no-op when email isn't configured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.ALERT_EMAIL_TO;
    const res = await notifyIssue({ subject: "unconfigured test" });
    expect(res).toEqual({ sent: false, reason: "not_configured" });
  });

  test("dedupes identical subjects and never throws on send failure", async () => {
    process.env.RESEND_API_KEY = "re_invalid_test_key";
    process.env.ALERT_EMAIL_TO = "nobody@example.com";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ statusCode: 401, name: "validation_error", message: "bad key" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      const first = await notifyIssue({ subject: "dedupe test" });
      expect(first.sent).toBe(false);
      const second = await notifyIssue({ subject: "dedupe test" });
      expect(second).toEqual({ sent: false, reason: "deduped" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("formatIssueEmail", () => {
  test("includes env, context and the error stack, HTML-escaped", () => {
    process.env.VERCEL_ENV = "preview";
    const email = formatIssueEmail({
      subject: "Sync failed",
      error: new Error("boom <b>"),
      context: { step: "fetch-ebi-holdings" },
    });
    expect(email.subject).toBe("[ebi:preview] Sync failed");
    expect(email.text).toContain("step: fetch-ebi-holdings");
    expect(email.text).toContain("Error: boom <b>");
    expect(email.html).toContain("boom &lt;b&gt;");
  });

  test("production subjects have no env suffix", () => {
    process.env.VERCEL_ENV = "production";
    expect(formatIssueEmail({ subject: "x" }).subject).toBe("[ebi] x");
  });
});
