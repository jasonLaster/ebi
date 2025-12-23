import { NextResponse } from "next/server";
import * as path from "path";
import { extractTextFromPdf } from "../../../../src/holdings/parse-pdf";

export async function GET() {
  try {
    const pdfPath = path.join(process.cwd(), "in", "holdings.pdf");
    const text = await extractTextFromPdf(pdfPath, { silent: true });

    return NextResponse.json({
      success: true,
      pdfPath,
      textLength: text.length,
      sample: text.slice(0, 200),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}

