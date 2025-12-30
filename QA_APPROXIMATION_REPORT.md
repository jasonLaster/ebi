# QA Report: Portfolio Approximation Scripts

## Executive Summary

Multiple critical issues were found that affect the accuracy and reliability of portfolio approximation results:

1. **CRITICAL: Test data contamination in production database**
2. **CRITICAL: Non-normalized weight sums (weights don't sum to 100%)**
3. **MODERATE: Inefficient symbol universe (uses all DB symbols instead of union)**
4. **MINOR: Zero-weight rows add unnecessary computation**

## Issue Details

### 1. Test Data Contamination (CRITICAL)

**Problem**: The production database contains test symbols (AAA, BBB) from unit tests mixed with real ETF holdings.

**Evidence**:

- EBI has AAA at 100% weight and BBB at 50% weight
- VTV has MSFT at 100%, AAA at 50%, BBB at 50%
- VTI and IWN also contain AAA and BBB with large weights

**Impact**:

- Contaminates optimization results
- Causes incorrect weight calculations
- Makes results unreliable for production use

**Root Cause**: Test fixtures in `scripts/approximate-holdings.test.ts` write test data to the same database used for production.

**Recommendation**:

- Filter out test symbols (AAA, BBB) before optimization, OR
- Use separate test database for unit tests, OR
- Delete test data after tests run

### 2. Non-Normalized Weight Sums (CRITICAL)

**Problem**: ETF weight sums don't equal 100%, which violates portfolio optimization assumptions.

**Evidence**:

```
EBI:   248.13% total weight (should be ~100%)
VTI:   199.99% total weight (reasonable, but still high)
VTV:   300.00% total weight (should be ~100%)
IWN:   200.09% total weight (reasonable, but high)
```

**Impact**:

- Optimization algorithm works mathematically but results are not meaningful for portfolio approximation
- The constraint that baseline weights sum to 1 assumes input weights are normalized
- Results will be systematically incorrect

**Root Cause**:

- Test data contamination (AAA, BBB with high weights)
- Possible data quality issues in holdings data extraction/parsing
- Holdings may represent multiple share classes or incorrectly aggregated data

**Recommendation**:

- Normalize weights before optimization (divide each ETF's weights by its sum)
- Add validation to detect and warn about non-normalized weights
- Fix data extraction to ensure proper normalization

### 3. Symbol Universe Inefficiency (MODERATE)

**Problem**: Code uses `getAllUniqueSymbols(db)` which gets ALL symbols from entire database, not just union of target + baseline ETFs.

**Current Code** (line 109):

```typescript
const allSymbols = await getAllUniqueSymbols(db); // Gets ALL symbols
```

**Better Approach**:

```typescript
const relevantSymbols = new Set<string>();
for (const sym of targetMap.keys()) relevantSymbols.add(sym);
for (const map of baselineMaps) {
  for (const sym of map.keys()) relevantSymbols.add(sym);
}
```

**Impact**:

- In current database: 3651 symbols total, 3651 in union (no difference, but inefficient query)
- 334 rows have all zeros (don't affect optimization but add computation)
- If database grows with other ETFs, problem size will grow unnecessarily

**Recommendation**:

- Use union of symbols from target + baseline ETFs only
- This reduces problem size and improves performance
- Matches the approach used in `brute_force_approximate.js`

### 4. Zero-Weight Rows (MINOR)

**Problem**: 334 out of 3651 rows have zero weights for both target and all baseline ETFs.

**Impact**:

- Adds unnecessary computation (doesn't affect objective function but still processed)
- Increases memory usage slightly

**Recommendation**:

- Can be addressed by using union approach (Issue #3)
- Or filter out zero rows after matrix construction

## Algorithm Correctness

The optimization algorithm itself appears correct:

✅ **Objective function**: Correctly minimizes sum of squared differences  
✅ **Constraints**: Properly enforces weights sum to 1 and are in [0,1] range  
✅ **Matrix construction**: Correctly builds H_target and H_stack  
✅ **Error metrics**: Correctly computes average error, max error, etc.

However, the algorithm assumes:

- Input weights are normalized (sum to 1) ❌ **VIOLATED**
- Input data is clean (no test contamination) ❌ **VIOLATED**

## Comparison with Brute Force

The brute force script (`brute_force_approximate.js`) correctly:

- Uses union of symbols from all ETFs ✅
- Loads from JSON files (not database) ✅
- Handles weight normalization correctly ✅

The optimization script should match this behavior but currently doesn't.

## Fixes Implemented

### ✅ Fixed: Symbol Universe Optimization

**Status**: IMPLEMENTED  
**Change**: Now uses union of symbols from target + baseline ETFs instead of all DB symbols  
**Location**: `src/approximation/optimize.ts` lines 107-114  
**Impact**: Reduces problem size, improves performance, avoids irrelevant symbols

### ✅ Fixed: Test Symbol Filtering

**Status**: IMPLEMENTED  
**Change**: Automatically filters out test symbols (AAA, BBB) with warning  
**Location**: `src/approximation/optimize.ts` lines 116-127  
**Impact**: Prevents test data contamination from affecting results

### ✅ Fixed: Weight Normalization

**Status**: IMPLEMENTED  
**Change**: Normalizes ETF weights before optimization (divides by sum)  
**Location**: `src/approximation/optimize.ts` lines 135-162  
**Impact**: Ensures proper portfolio approximation even if input weights don't sum to 100%

### ✅ Fixed: Data Validation & Warnings

**Status**: IMPLEMENTED  
**Change**: Adds warnings when weight sums deviate significantly from 100%  
**Location**: `src/approximation/optimize.ts` lines 142-154  
**Impact**: Helps identify data quality issues early

## Remaining Recommendations

1. **HIGH**: Clean test data from production database
   - Test symbols (AAA, BBB) should be removed from production DB
   - Consider using separate test database for unit tests
2. **MEDIUM**: Investigate root cause of non-normalized weights
   - Why do EBI weights sum to 248%? (likely test data contamination)
   - Why do VTV weights sum to 300%? (data quality issue)
   - Fix data extraction/parsing if needed
3. **LOW**: Filter zero-weight rows for optimization
   - Currently ~334 zero rows don't affect correctness but add computation
   - Could be optimized further if performance becomes an issue

## Test Results

Current tests pass but use test data, so they don't catch production issues:

- Test uses AAA/BBB which are the problematic symbols in production
- Test validates constraints but not weight normalization
- Test doesn't validate against real-world data quality issues

## Files Affected

- `src/approximation/optimize.ts` - Main optimization logic
- `scripts/approximate-holdings.test.ts` - Test fixtures contaminate DB
- `scripts/qa-approximation.ts` - New diagnostic script
- `scripts/qa-weight-sums.ts` - New diagnostic script
