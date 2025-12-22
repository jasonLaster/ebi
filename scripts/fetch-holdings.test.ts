import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  fetchEtfHoldings,
  fetchAndStoreManyEtfHoldings,
} from "../src/holdings/fetch";
import { openHoldingsDb } from "../src/lib/db";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ebi-holdings-"));
}

describe("holdings fetch (FMP)", () => {
  test("fetchEtfHoldings normalizes weights and actual_weight", async () => {
    const raw = [
      {
        asset: "AAA",
        name: "AAA Inc",
        shares: "10",
        weightPercentage: "25",
        marketValue: "100",
        price: "10",
      },
      {
        asset: "BBB",
        name: "BBB Inc",
        shares: "20",
        weightPercentage: "75",
        marketValue: "300",
        price: "15",
      },
    ];

    const fetchImpl = async () =>
      new Response(JSON.stringify(raw), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const data = await fetchEtfHoldings("VTI", { apiKey: "test", fetchImpl });
    expect(data.etfSymbol).toBe("VTI");
    expect(Object.keys(data.holdings)).toEqual(["AAA", "BBB"]);

    expect(data.holdings.AAA.weight).toBeCloseTo(0.25, 6);
    expect(data.holdings.BBB.weight).toBeCloseTo(0.75, 6);

    // actual_weight based on market_value ratio
    expect(data.holdings.AAA.actual_weight).toBeCloseTo(0.25, 6);
    expect(data.holdings.BBB.actual_weight).toBeCloseTo(0.75, 6);
  });

  test("fetchAndStoreManyEtfHoldings writes JSON and SQLite", async () => {
    const tmpDir = makeTempDir();
    const outDir = path.join(tmpDir, "data");
    const sqlitePath = path.join(outDir, "holdings.db");

    const fetchImpl = async (url: string | URL | Request) => {
      const sym = (url as string).match(/etf-holder\/([A-Z0-9]+)/)?.[1] ?? "UNKNOWN";
      const raw =
        sym === "VTI"
          ? [
              {
                asset: "AAPL",
                name: "Apple Inc",
                shares: "1",
                weightPercentage: "50",
                marketValue: "100",
                price: "10",
              },
            ]
          : [
              {
                asset: "MSFT",
                name: "Microsoft Corp",
                shares: "2",
                weightPercentage: "100",
                marketValue: "200",
                price: "20",
              },
            ];

      return new Response(JSON.stringify(raw), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const res = await fetchAndStoreManyEtfHoldings(["VTI", "VTV"], {
      outDir,
      sqlitePath,
      apiKey: "test",
      fetchImpl,
    });

    expect(res.outputs.length).toBe(2);
    const vtiJson = path.join(outDir, "vti_holdings.json");
    const vtvJson = path.join(outDir, "vtv_holdings.json");
    expect(fs.existsSync(vtiJson)).toBe(true);
    expect(fs.existsSync(vtvJson)).toBe(true);
    expect(fs.existsSync(sqlitePath)).toBe(true);

    const parsedVti = JSON.parse(fs.readFileSync(vtiJson, "utf8"));
    expect(parsedVti.etfSymbol).toBe("VTI");
    expect(parsedVti.holdings.AAPL).toBeDefined();

    const db = openHoldingsDb(sqlitePath);
    try {
      const etfCount = db.prepare("SELECT COUNT(*) as c FROM etfs").get() as {
        c: number;
      };
      expect(etfCount.c).toBe(2);

      const holdingCount = db
        .prepare("SELECT COUNT(*) as c FROM holdings")
        .get() as { c: number };
      expect(holdingCount.c).toBe(2);
    } finally {
      db.close();
    }
  });
});
