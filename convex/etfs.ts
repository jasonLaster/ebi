import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get an ETF by its symbol
 */
export const getBySymbol = query({
  args: { symbol: v.string() },
  handler: async (ctx, args) => {
    const symbol = args.symbol.toUpperCase();
    return await ctx.db
      .query("etfs")
      .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
      .first();
  },
});

/**
 * Upsert an ETF - create if not exists, update if exists
 * Returns the ETF id
 */
export const upsert = mutation({
  args: {
    symbol: v.string(),
    lastUpdated: v.string(),
  },
  handler: async (ctx, args) => {
    const symbol = args.symbol.toUpperCase();

    const existing = await ctx.db
      .query("etfs")
      .withIndex("by_symbol", (q) => q.eq("symbol", symbol))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { lastUpdated: args.lastUpdated });
      return existing._id;
    } else {
      return await ctx.db.insert("etfs", {
        symbol,
        lastUpdated: args.lastUpdated,
      });
    }
  },
});

/**
 * List all ETFs
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("etfs").collect();
  },
});
