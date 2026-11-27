import { NextResponse } from "next/server";
import { getLatestHoldingsData, openHoldingsDb } from "@/src/lib/db";

/** Latest synced holdings for one ETF, as a JSON download. */
export async function GET(
  _request: Request,
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
    return NextResponse.json(data, {
      headers: {
        "Content-Disposition": `attachment; filename="${symbol.toLowerCase()}_holdings_${data.date}.json"`,
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } finally {
    db.close();
  }
}
