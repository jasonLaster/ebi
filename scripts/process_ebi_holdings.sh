#!/bin/bash

echo "🚀 EBI Holdings Processing Workflow"
echo "=================================="

# Check if PDF file is provided
if [ $# -eq 0 ]; then
    echo "❌ Please provide the PDF file path"
    echo "Usage: ./scripts/process_ebi_holdings.sh <pdf-file>"
    echo "Example: ./scripts/process_ebi_holdings.sh data/Fund Holdings (3).pdf"
    exit 1
fi

PDF_FILE="$1"

# Check if PDF file exists
if [ ! -f "$PDF_FILE" ]; then
    echo "❌ PDF file not found: $PDF_FILE"
    exit 1
fi

echo "📄 Processing PDF: $PDF_FILE"

echo ""
echo "Running full sync (parse PDF + fetch holdings + approximate)..."
bun scripts/sync.ts "$PDF_FILE"

echo ""
echo "✅ EBI Holdings Processing Complete!"
echo ""
echo "📊 Results:"
echo "  - Holdings data: data/ebi_holdings.json"
echo "  - Approximation results: data/portfolio_approximation_results.json"
echo "  - Dashboard: http://localhost:3000"
echo ""
echo "🚀 To view results:"
echo "  bun run dev"