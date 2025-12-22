import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  etfs: defineTable({
    symbol: v.string(),
    lastUpdated: v.string(),
  }).index("by_symbol", ["symbol"]),

  holdings: defineTable({
    etfId: v.id("etfs"),
    ticker: v.string(),
    name: v.string(),
    weight: v.float64(),
    marketValue: v.float64(),
    actualWeight: v.float64(),
    price: v.optional(v.float64()),
    shares: v.float64(),
  })
    .index("by_etf", ["etfId"])
    .index("by_etf_ticker", ["etfId", "ticker"])
    .index("by_ticker", ["ticker"]),

  performanceCache: defineTable({
    cacheKey: v.string(),
    asofDate: v.string(),
    createdAt: v.string(),
    payloadJson: v.string(),
  }).index("by_cache_key", ["cacheKey"]),
});
