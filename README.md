# EBI Portfolio Approximation Dashboard

This project analyzes the iShares ESG Aware MSCI EM ETF (EBI) and provides portfolio approximation using optimization algorithms to find optimal weights for VTI, VTV, and IWN ETFs that best replicate EBI's holdings.

## 🎯 Project Overview

The dashboard provides:

- **Performance Analysis**: Historical performance comparison of EBI, VTI, IWV, IWN, and VTV
- **Portfolio Approximation**: Mathematical optimization to find optimal ETF weights
- **Interactive Charts**: Visual performance tracking and delta analysis
- **Real-time Data**: Live market data integration via Financial Modeling Prep API

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Financial Modeling Prep API key

### Installation

1. **Clone and install dependencies:**

   ```bash
   git clone <repository-url>
   cd ebi
   pnpm install
   ```

2. **Set up environment variables:**

   ```bash
   cp .env.example .env
   # Add your FMP_API_KEY to .env
   ```

3. **Run portfolio approximation:**

   ```bash
   ./scripts/run-approximation.sh
   ```

4. **Start the development server:**

   ```bash
   pnpm dev
   ```

5. **View the dashboard:**
   Open [http://localhost:3000](http://localhost:3000)

## 📊 Portfolio Approximation

The optimization algorithm uses mathematical programming to find the optimal combination of VTI, VTV, and IWN that best approximates EBI's holdings.

### Key Features:

- **Mathematical Optimization**: Uses Alglib.js for constrained optimization
- **Holdings Analysis**: Processes 3,743 unique stock symbols
- **Error Metrics**: Provides detailed error statistics and improvement metrics
- **Constraint Validation**: Ensures weights sum to 100% and are within bounds

### Current Results:

- **VTI**: 100.00% (Vanguard Total Stock Market ETF)
- **VTV**: 0.00% (Vanguard Value ETF)
- **IWN**: 0.00% (iShares Russell 2000 Value ETF)

### Optimization Metrics:

- **Final Error**: 0.012397 (sum of squared differences)
- **Improvement**: 0.34% over initial guess
- **Average Error**: 0.000260 per stock
- **Stocks with Error > 0.1%**: 174 out of 3,743

## 🏗️ Project Structure

```
ebi/
├── app/                          # Next.js app directory
│   ├── api/                      # API routes
│   │   ├── performance/          # Performance data endpoint
│   │   └── portfolio-approximation/ # Approximation results endpoint
│   ├── globals.css              # Global styles
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Main dashboard page
├── components/                   # React components
│   ├── ui/                      # UI components (shadcn/ui)
│   └── portfolio-approximation.tsx # Portfolio approximation component
├── data/                        # Data files
│   ├── data-may/                # Holdings data
│   │   ├── ebi_holdings.json    # EBI holdings
│   │   ├── vti_holdings.json    # VTI holdings
│   │   ├── vtv_holdings.json    # VTV holdings
│   │   └── iwn_holdings.json    # IWN holdings
│   └── portfolio_approximation_results.json # Optimization results
├── scripts/                     # Analysis scripts
│   ├── approximate_holdings.js  # Main optimization script
│   ├── run-approximation.sh     # Convenience script
│   └── vendor/                  # Third-party libraries
│       └── Alglib-v1.1.0.js    # Optimization library
└── package.json                 # Dependencies and scripts
```

## 🔧 Scripts

### Portfolio Approximation

```bash
# Run the full approximation process
./scripts/run-approximation.sh

# Or run directly
node scripts/approximate_holdings.js
```

### Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## 📈 API Endpoints

### Performance Data

- **GET** `/api/performance`
- Returns historical performance data for all ETFs
- Includes price data, performance metrics, and deltas

### Portfolio Approximation

- **GET** `/api/portfolio-approximation`
- Returns optimization results and metrics
- Includes optimal weights, error statistics, and constraints validation

## 🎨 Dashboard Features

### Performance Table

- Real-time performance comparison
- Delta analysis against IWV benchmark
- Color-coded performance indicators

### Interactive Charts

- **Percentage Change Chart**: Normalized performance over time
- **Delta Chart**: Performance differences vs benchmark
- **Responsive Design**: Works on all screen sizes

### Portfolio Approximation Results

- **Optimal Weights**: Visual representation of ETF allocations
- **Optimization Metrics**: Detailed error analysis
- **Constraints Validation**: Mathematical constraint verification
- **Summary**: Plain English explanation of results

## 🔬 Technical Details

### Optimization Algorithm

The portfolio approximation uses constrained optimization with the following objective function:

```
minimize: Σ(synthetic_holding_i - actual_holding_i)²
subject to:
  - w₁ + w₂ + w₃ = 1 (weights sum to 100%)
  - 0 ≤ w_i ≤ 1 (weights between 0% and 100%)
```

Where:

- `synthetic_holding_i = w₁×VTI_i + w₂×VTV_i + w₃×IWN_i`
- `actual_holding_i = EBI_i`

### Data Sources

- **Holdings Data**: ETF provider holdings files
- **Market Data**: Financial Modeling Prep API
- **Historical Prices**: Real-time market data

### Technologies Used

- **Frontend**: Next.js 15, React 19, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Recharts
- **Optimization**: Alglib.js (WASM-based)
- **Data Processing**: Node.js, ES modules
- **API**: Financial Modeling Prep

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- **Alglib.js**: Mathematical optimization library
- **Financial Modeling Prep**: Market data API
- **shadcn/ui**: Beautiful UI components
- **Recharts**: Interactive chart library
