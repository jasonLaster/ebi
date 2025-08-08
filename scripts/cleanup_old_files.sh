#!/bin/bash

echo "🧹 Cleaning up old parsing files..."

# Remove old parsing scripts
echo "Removing old parsing scripts..."
rm -f scripts/parse_extracted_holdings.js
rm -f scripts/parse_extracted_holdings_v2.js
rm -f scripts/parse_extracted_holdings_final.js
rm -f scripts/extract_pdf_simple.js
rm -f scripts/extract_pdf_holdings.js
rm -f scripts/brute_force_approximate.js
rm -f scripts/transform_holdings.js
rm -f scripts/transform_holdings.ts
rm -f scripts/fetch_holdings.js

# Remove old data files
echo "Removing old data files..."
rm -f data/fund_holdings_extracted.json
rm -f data/extracted_holdings.txt
rm -f data/pdf_raw_content.txt
rm -f data/sample_holdings_structure.json

# Remove test script (optional - keep if you want to analyze overlap)
# rm -f scripts/test_holdings_overlap.js

echo "✅ Cleanup complete!"
echo ""
echo "📁 Remaining files:"
echo "  - scripts/parse_ebi_pdf.js (new clean parser)"
echo "  - scripts/approximate_holdings.js (optimization)"
echo "  - scripts/run-approximation.sh (convenience script)"
echo "  - scripts/test_holdings_overlap.js (analysis tool)"
echo ""
echo "🚀 Usage:"
echo "  node scripts/parse_ebi_pdf.js <pdf-file>"
echo "  ./scripts/run-approximation.sh" 