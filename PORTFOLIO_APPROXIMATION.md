# Portfolio Approximation System

This system provides a comprehensive solution for approximating the holdings of the EBI ETF using a combination of other ETFs (VTI, VTV, IWN) through mathematical optimization.

## Overview

The portfolio approximation system consists of:

1. **Optimization Engine**: Uses Alglib WASM for mathematical optimization
2. **Web Dashboard**: Next.js application with real-time data visualization
3. **API Endpoints**: RESTful APIs for data access and optimization triggering
4. **Performance Comparison**: Real-time comparison between actual and approximated performance

## Key Features

### 🔧 Optimization Engine

- **Mathematical Optimization**: Uses constrained optimization to find optimal weights
- **Multiple Constraints**: Ensures weights sum to 100% and are within valid ranges
- **Error Minimization**: Minimizes the sum of squared differences between actual and approximated holdings

### 📊 Web Dashboard

- **Real-time Data**: Live performance data from multiple ETFs
- **Interactive Charts**: Percentage change and delta performance visualizations
- **Portfolio Approximation Results**: Detailed analysis of optimal weights and metrics
- **Performance Comparison**: Side-by-side comparison of actual vs approximated performance

### 🔄 API System

- **GET /api/portfolio-approximation**: Retrieve current optimization results
- **POST /api/portfolio-approximation**: Trigger new optimization run
- **GET /api/performance**: Get historical performance data for all ETFs

### 📈 Analysis Metrics

- **Tracking Error**: Root mean square error of the approximation
- **Error Rate**: Percentage of stocks with significant approximation errors
- **Confidence Level**: High/Medium/Low based on improvement percentage
- **Performance Comparison**: Real-time tracking of approximated vs actual performance

## Current Results

Based on the latest optimization:

| ETF | Weight | Purpose                     |
| --- | ------ | --------------------------- |
| VTI | 74.3%  | Total Stock Market exposure |
| VTV | 0.0%   | Value factor exposure       |
| IWN | 25.7%  | Small-cap value exposure    |

**Key Metrics:**

- **Improvement**: 1.93% over initial guess
- **Average Error**: 0.025% per stock
- **Tracking Error**: 0.78%
- **Confidence**: Medium

## Usage

### Running the Optimization

```bash
# Run the optimization script directly
node scripts/approximate_holdings.js

# Or use the convenience script
./scripts/update_approximation.sh
```

### Starting the Web Dashboard

```bash
# Install dependencies (if not already done)
pnpm install

# Start the development server
pnpm dev
```

### API Usage

```bash
# Get current approximation results
curl http://localhost:3000/api/portfolio-approximation

# Trigger new optimization
curl -X POST http://localhost:3000/api/portfolio-approximation

# Get performance data
curl http://localhost:3000/api/performance
```

## Data Sources

The system uses holdings data from:

- `data/data-may/ebi_holdings.json` - EBI ETF holdings
- `data/data-may/vti_holdings.json` - VTI ETF holdings
- `data/data-may/vtv_holdings.json` - VTV ETF holdings
- `data/data-may/iwn_holdings.json` - IWN ETF holdings

## Technical Details

### Optimization Algorithm

- **Objective Function**: Minimizes sum of squared differences between actual and approximated holdings
- **Constraints**:
  - Weights must sum to 100%
  - Each weight must be between 0% and 100%
- **Solver**: Alglib WASM optimization library

### Performance Tracking

- **Historical Data**: Fetches real-time price data from financial APIs
- **Normalization**: Compares performance relative to start date
- **Tracking Error**: Measures how well the approximation tracks actual performance

### Web Components

- **PortfolioApproximation**: Shows optimization results and metrics
- **PortfolioComparison**: Compares actual vs approximated performance
- **Performance Dashboard**: Overall ETF performance tracking

## Future Enhancements

1. **Additional ETFs**: Include more ETFs for better approximation
2. **Dynamic Rebalancing**: Automatic rebalancing based on market conditions
3. **Risk Metrics**: Include volatility and drawdown analysis
4. **Backtesting**: Historical performance validation
5. **Real-time Updates**: Automatic optimization when new data is available

## Troubleshooting

### Common Issues

1. **"Alglib WASM failed to load"**

   - Ensure you're using a modern browser with WebAssembly support
   - Check that the Alglib library is properly loaded

2. **"Portfolio approximation results not found"**

   - Run the optimization script first: `node scripts/approximate_holdings.js`
   - Check that the data files exist in the correct locations

3. **"API request failed"**
   - Ensure the development server is running: `pnpm dev`
   - Check that the API endpoints are properly configured

### Performance Optimization

- The optimization typically takes 5-10 seconds
- Results are cached and can be refreshed via the web interface
- Historical data is fetched on-demand to minimize API calls

## Contributing

To contribute to the portfolio approximation system:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with different data sets
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
