#!/bin/bash

# Portfolio Approximation Update Script
# This script updates the portfolio approximation with the latest data

set -e

echo "🔄 Starting portfolio approximation update..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH"
    exit 1
fi

# Check if the approximation script exists
if [ ! -f "scripts/approximate_holdings.js" ]; then
    echo "❌ Error: approximation script not found at scripts/approximate_holdings.js"
    exit 1
fi

echo "📊 Running portfolio approximation optimization..."
echo "⏱️  This may take a few moments..."

# Run the approximation script
node scripts/approximate_holdings.js

if [ $? -eq 0 ]; then
    echo "✅ Portfolio approximation completed successfully!"
    echo "📈 Results saved to data/portfolio_approximation_results.json"
    
    # Display a summary of the results
    if [ -f "data/portfolio_approximation_results.json" ]; then
        echo ""
        echo "📋 Latest Results Summary:"
        echo "=========================="
        
        # Extract and display key metrics using jq if available, otherwise use grep
        if command -v jq &> /dev/null; then
            echo "VTI Weight: $(jq -r '.weightsPercentages.vti' data/portfolio_approximation_results.json)%"
            echo "VTV Weight: $(jq -r '.weightsPercentages.vtv' data/portfolio_approximation_results.json)%"
            echo "IWN Weight: $(jq -r '.weightsPercentages.iwn' data/portfolio_approximation_results.json)%"
            echo "Improvement: $(jq -r '.optimizationMetrics.improvementPercent' data/portfolio_approximation_results.json)%"
            echo "Average Error: $(jq -r '.optimizationMetrics.averageError' data/portfolio_approximation_results.json)"
        else
            echo "Install jq for better result formatting: brew install jq (macOS) or apt-get install jq (Ubuntu)"
            echo "Results available in data/portfolio_approximation_results.json"
        fi
    fi
    
    echo ""
    echo "🌐 You can now view the updated results in your web dashboard!"
    echo "   Run 'pnpm dev' to start the development server"
    
else
    echo "❌ Portfolio approximation failed!"
    echo "Please check the error messages above and try again."
    exit 1
fi 