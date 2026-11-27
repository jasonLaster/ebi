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

- Node.js 22+
- Bun
- Financial Modeling Prep API key

### Installation

1. **Clone and install dependencies:**

   ```bash
   git clone <repository-url>
   cd ebi
   bun install
   ```

2. **Set up environment variables:**

   ```bash
   cp env.example .env
   # Add your FMP_API_KEY to .env (used by fetch-holdings)
   ```

3. **Run portfolio approximation:**

   ```bash
   bun scripts/sync.ts
   ```

4. **Start the development server:**

   ```bash
   bun run dev
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
│   ├── ebi_holdings.json        # EBI holdings (from PDF)
│   ├── vti_holdings.json        # VTI holdings (from API)
│   ├── vtv_holdings.json        # VTV holdings (from API)
│   ├── iwn_holdings.json        # IWN holdings (from API)
│   └── holdings.db              # SQLite mirror of holdings (Bun sqlite)
├── src/                         # Business logic (reusable)
│   ├── lib/                     # Shared libs (types, db, API client)
│   └── holdings/                # Holdings fetch/parse/storage modules
├── scripts/                     # Analysis scripts
│   ├── parse-pdf.ts             # PDF holdings parser (extracts and parses PDF to JSON)
│   ├── parse-pdf.test.ts        # Tests for PDF parsing
│   ├── fetch-holdings.ts        # Fetch holdings from FMP API (VTI/VTV/IWN)
│   ├── fetch-holdings.test.ts   # Tests for fetch holdings + sqlite
│   ├── approximate-holdings.ts  # Main optimization script (reads from SQLite)
│   ├── sync.ts                  # Parse PDF + fetch holdings + approximate
│   └── vendor/                  # Third-party libraries
│       └── Alglib-v1.1.0.js    # Optimization library
└── package.json                 # Dependencies and scripts
```

## 🔧 Scripts

### PDF Parsing

Parse PDF holdings files into JSON format:

```bash
# Parse a PDF holdings file
bun scripts/parse-pdf.ts <input-pdf-path> <output-json-path>

# Example:
bun scripts/parse-pdf.ts data/holdings.pdf data/ebi_holdings.json

# Or use the npm script:
bun run parse:pdf data/holdings.pdf data/ebi_holdings.json

# Write to sqlite too (default: data/holdings.db):
bun scripts/parse-pdf.ts data/holdings.pdf data/ebi_holdings.json --sqlite data/holdings.db
```

### Fetch Holdings (Baseline ETFs)

Fetch holdings for the baseline ETFs (VTI, VTV, IWN) from Financial Modeling Prep and store both JSON and SQLite:

```bash
# Fetch all baseline ETFs
bun run fetch:all

# Fetch a subset
bun run fetch:holdings VTI VTV

# Override output dir and sqlite db
bun run fetch:holdings --all --out-dir data --sqlite data/holdings.db
```

### Portfolio Approximation

```bash
# Sync holdings + run the approximation (recommended)
bun scripts/sync.ts

# Or run directly
bun scripts/approximate-holdings.ts
```

### Testing

```bash
# Run all tests
bun test

# Run holdings validation tests
bun test:holdings
```

### Development

```bash
# Start development server
bun run dev

# Build for production
bun run build

# Start production server
bun run start
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

- **EBI holdings**: FMP `etf-holder/EBI` (same API as the baselines), falling back automatically to the holdings table on [Longview's fund page](https://longviewresearchpartners.com/ebi/fund-data/) with an alert email (`src/holdings/fetch-ebi.ts`). `bun run sync <pdf>` still parses a holdings PDF manually.
- **Baseline holdings & prices**: Financial Modeling Prep API

### Operations

- **Daily sync**: Vercel Cron calls `GET /api/sync` at 05:00 UTC. Full syncs require `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it automatically); `?test=true` runs the read-only approximation and is used as the post-deploy smoke test.
- **Issue emails**: `src/lib/notify.ts` emails `ALERT_EMAIL_TO` through Resend when a sync fails, the published holdings are stale (> 5 days), FMP price fetches fail, the approximation fails, or Next.js captures an unhandled server error (`onRequestError` in `instrumentation.ts`). Without `RESEND_API_KEY`/`ALERT_EMAIL_TO` it just logs.
- **Tracing**: `instrumentation.ts` registers `@vercel/otel`; sync steps, FMP fetches, and the optimizer run in custom spans (`src/lib/trace.ts`). Inspect with `vercel traces search --project ebi`.
- **Metrics**: `sync.run` (by `mode`/`outcome`), `sync.duration_ms`, and `sync.ebi_holdings` via `metric()` from `@vercel/functions`.

### Technologies Used

- **Frontend**: Next.js 16, React 19, TypeScript
- **UI**: shadcn/ui, Tailwind CSS, Recharts
- **Optimization**: Alglib.js (WASM-based)
- **Runtime**: Node.js on Vercel (Bun for installs, scripts, and tests)
- **Storage**: Turso (libSQL)

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
