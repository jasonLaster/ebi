import { NextResponse } from "next/server";
import { openHoldingsDb, getHoldingsForEtf } from "@/src/lib/db";

export const maxDuration = 60; // seconds

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const { symbol: symbolParam } = await params;
    const symbol = symbolParam?.toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        { error: "ETF symbol is required" },
        { status: 400 }
      );
    }

    const db = await openHoldingsDb();
    try {
      const holdingsData = await getHoldingsForEtf(db, symbol);

      if (!holdingsData) {
        return NextResponse.json(
          { error: `No holdings found for ETF: ${symbol}` },
          { status: 404 }
        );
      }

      // Return as JSON with appropriate headers for download
      return NextResponse.json(holdingsData, {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${symbol.toLowerCase()}_holdings.json"`,
        },
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(`Error fetching holdings:`, error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return NextResponse.json(
      { error: "Failed to fetch holdings", details: errorMessage },
      { status: 500 }
    );
  }
}
