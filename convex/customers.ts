import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireStore } from "./lib/auth";

export const list = query({
  args: { storeId: v.id("stores"), search: v.optional(v.string()), from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, { storeId, search, from, to }) => {
    await requireStore(ctx, storeId);
    let rows = await ctx.db
      .query("customers")
      .withIndex("by_store_email", (q) => q.eq("storeId", storeId))
      .collect();
    rows.sort((a, b) => b._creationTime - a._creationTime);
    if (from !== undefined) rows = rows.filter((c) => c._creationTime >= from);
    if (to !== undefined) rows = rows.filter((c) => c._creationTime < to);
    if (search?.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter(
        (c) => c.name.toLowerCase().includes(s) || c.email.includes(s) || (c.phone ?? "").includes(s),
      );
    }
    return rows.slice(0, 500);
  },
});

export const detail = query({
  args: { storeId: v.id("stores"), id: v.id("customers") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const c = await ctx.db.get(id);
    if (!c || c.storeId !== storeId) return null;
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", id))
      .order("desc")
      .collect();
    return {
      ...c,
      sales: sales.map((s) => ({
        _id: s._id,
        productTitle: s.productTitle,
        net: s.net,
        status: s.status,
        at: s._creationTime,
      })),
    };
  },
});
