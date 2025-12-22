import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
/**
 * Holding data structure for upsert
 */
const holdingValidator = v.object({
    ticker: v.string(),
    name: v.string(),
    weight: v.float64(),
    marketValue: v.float64(),
    actualWeight: v.float64(),
    price: v.optional(v.float64()),
    shares: v.float64(),
});
/**
 * Upsert a single holding for an ETF
 */
export const upsertHolding = mutation({
    args: {
        etfId: v.id("etfs"),
        holding: holdingValidator,
    },
    handler: async (ctx, args) => {
        const { etfId, holding } = args;
        // Check if holding already exists for this ETF
        const existing = await ctx.db
            .query("holdings")
            .withIndex("by_etf_ticker", (q) => q.eq("etfId", etfId).eq("ticker", holding.ticker))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                name: holding.name,
                weight: holding.weight,
                marketValue: holding.marketValue,
                actualWeight: holding.actualWeight,
                price: holding.price,
                shares: holding.shares,
            });
            return existing._id;
        }
        else {
            return await ctx.db.insert("holdings", {
                etfId,
                ticker: holding.ticker,
                name: holding.name,
                weight: holding.weight,
                marketValue: holding.marketValue,
                actualWeight: holding.actualWeight,
                price: holding.price,
                shares: holding.shares,
            });
        }
    },
});
/**
 * Upsert multiple holdings for an ETF (batch operation)
 */
export const upsertHoldingsForEtf = mutation({
    args: {
        etfId: v.id("etfs"),
        holdings: v.array(holdingValidator),
    },
    handler: async (ctx, args) => {
        const { etfId, holdings } = args;
        for (const holding of holdings) {
            const existing = await ctx.db
                .query("holdings")
                .withIndex("by_etf_ticker", (q) => q.eq("etfId", etfId).eq("ticker", holding.ticker))
                .first();
            if (existing) {
                await ctx.db.patch(existing._id, {
                    name: holding.name,
                    weight: holding.weight,
                    marketValue: holding.marketValue,
                    actualWeight: holding.actualWeight,
                    price: holding.price,
                    shares: holding.shares,
                });
            }
            else {
                await ctx.db.insert("holdings", {
                    etfId,
                    ticker: holding.ticker,
                    name: holding.name,
                    weight: holding.weight,
                    marketValue: holding.marketValue,
                    actualWeight: holding.actualWeight,
                    price: holding.price,
                    shares: holding.shares,
                });
            }
        }
    },
});
/**
 * Get holdings weight map for an ETF
 * Returns a map of ticker -> weight
 */
export const getHoldingsWeightMap = query({
    args: {
        etfSymbol: v.string(),
        weightField: v.optional(v.union(v.literal("weight"), v.literal("actualWeight"))),
    },
    handler: async (ctx, args) => {
        const symbol = args.etfSymbol.toUpperCase();
        const weightField = args.weightField ?? "actualWeight";
        // Get the ETF first
        const etf = await ctx.db
            .query("etfs")
            .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
            .first();
        if (!etf) {
            return {};
        }
        // Get all holdings for this ETF
        const holdings = await ctx.db
            .query("holdings")
            .withIndex("by_etf", (q) => q.eq("etfId", etf._id))
            .collect();
        const result = {};
        for (const h of holdings) {
            const ticker = h.ticker?.trim();
            if (!ticker)
                continue;
            const weight = weightField === "weight" ? h.weight : h.actualWeight;
            result[ticker] = Number.isFinite(weight) ? weight : 0;
        }
        return result;
    },
});
/**
 * Get all unique ticker symbols across all holdings
 */
export const getAllUniqueSymbols = query({
    args: {},
    handler: async (ctx) => {
        const holdings = await ctx.db.query("holdings").collect();
        const symbols = new Set();
        for (const h of holdings) {
            const ticker = h.ticker?.trim();
            if (ticker)
                symbols.add(ticker);
        }
        return Array.from(symbols).sort();
    },
});
/**
 * Get holdings for a specific ETF
 */
export const getHoldingsByEtf = query({
    args: { etfId: v.id("etfs") },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("holdings")
            .withIndex("by_etf", (q) => q.eq("etfId", args.etfId))
            .collect();
    },
});
/**
 * Get holdings count for a specific ETF
 */
export const getHoldingsCount = query({
    args: { etfSymbol: v.string() },
    handler: async (ctx, args) => {
        const symbol = args.etfSymbol.toUpperCase();
        const etf = await ctx.db
            .query("etfs")
            .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
            .first();
        if (!etf) {
            return 0;
        }
        const holdings = await ctx.db
            .query("holdings")
            .withIndex("by_etf", (q) => q.eq("etfId", etf._id))
            .collect();
        return holdings.length;
    },
});
