import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get a cached performance result by key
 */
export const get = query({
  args: { cacheKey: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("performanceCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", args.cacheKey))
      .first();
  },
});

/**
 * Set a cached performance result
 */
export const set = mutation({
  args: {
    cacheKey: v.string(),
    asofDate: v.string(),
    payloadJson: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("performanceCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", args.cacheKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        asofDate: args.asofDate,
        createdAt: new Date().toISOString(),
        payloadJson: args.payloadJson,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("performanceCache", {
        cacheKey: args.cacheKey,
        asofDate: args.asofDate,
        createdAt: new Date().toISOString(),
        payloadJson: args.payloadJson,
      });
    }
  },
});

/**
 * Delete a cached entry by key
 */
export const remove = mutation({
  args: { cacheKey: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("performanceCache")
      .withIndex("by_cache_key", (q) => q.eq("cacheKey", args.cacheKey))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

/**
 * Clear all cache entries older than a given date
 */
export const clearOlderThan = mutation({
  args: { date: v.string() },
  handler: async (ctx, args) => {
    const entries = await ctx.db.query("performanceCache").collect();
    let deleted = 0;

    for (const entry of entries) {
      if (entry.asofDate < args.date) {
        await ctx.db.delete(entry._id);
        deleted++;
      }
    }

    return deleted;
  },
});
