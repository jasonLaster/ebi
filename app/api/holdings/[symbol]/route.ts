import { NextResponse } from "next/server";
import { getLatestHoldingsData, openHoldingsDb } from "@/src/lib/db";
import { summarizeHoldings } from "@/src/holdings/summary";

const CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";

/**
 * Latest synced holdings for one ETF, as a JSON download.
 * `?top=N` instead returns a compact summary (count + N largest positions).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;
  if (!/^[A-Za-z]{1,6}$/.test(symbol)) {
    return NextResponse.json({ error: "Invalid ETF symbol" }, { status: 400 });
  }

  const db = await openHoldingsDb();
  try {
    const data = await getLatestHoldingsData(db, symbol);
    if (!data) {
      return NextResponse.json(
        { error: `No holdings found for ${symbol.toUpperCase()}` },
        { status: 404 }
      );
    }
    const top = new URL(request.url).searchParams.get("top");
    if (top !== null) {
      const n = Math.min(Math.max(Number.parseInt(top, 10) || 10, 1), 50);
      return NextResponse.json(summarizeHoldings(data, n), {
        headers: { "Cache-Control": CACHE_CONTROL },
      });
    }
    return NextResponse.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="${symbol.toLowerCase()}_holdings_${data.date}.json"`,
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } finally {
    db.close();
  }
}
