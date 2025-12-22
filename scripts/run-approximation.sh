#!/bin/bash

echo "🚀 Running Portfolio Approximation..."
echo "=================================="

# Run the approximation script
bun scripts/approximate-holdings.ts

echo ""
echo "✅ Approximation complete!"
echo ""
echo "📊 Results saved to: data/portfolio_approximation_results.json"
echo "🌐 View results in the dashboard at: http://localhost:3000"
echo ""
echo "To run the development server:"
echo "  bun run dev"