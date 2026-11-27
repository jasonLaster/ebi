import { afterEach, describe, expect, test } from "bun:test";
import { GET } from "./route";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("GET /api/sync", () => {
  test("full sync requires the cron secret when CRON_SECRET is set", async () => {
    process.env.CRON_SECRET = "test-secret";
    const res = await GET(new Request("http://localhost/api/sync"));
    expect(res.status).toBe(401);

    const wrong = await GET(
      new Request("http://localhost/api/sync", {
        headers: { authorization: "Bearer nope" },
      })
    );
    expect(wrong.status).toBe(401);
  });

  test("reports the failing step as JSON when the DB isn't configured", async () => {
    delete process.env.CRON_SECRET;
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.ALERT_EMAIL_TO;
    const res = await GET(new Request("http://localhost/api/sync?test=true"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, step: "open-db" });
    expect(body.error).toContain("TURSO_DATABASE_URL");
  });
});
