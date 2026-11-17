import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const byIdAndKey = internalQuery({
  args: { saleId: v.string(), key: v.string() },
  handler: async (ctx, { saleId, key }) => {
    const id = ctx.db.normalizeId("sales", saleId);
    if (!id) return null;
    const sale = await ctx.db.get(id);
    return sale && sale.accessKey === key ? sale : null;
  },
});

export const normalize = internalQuery({
  args: { saleId: v.string() },
  handler: async (ctx, { saleId }) => ctx.db.normalizeId("sales", saleId),
});

export const normalizePayout = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => ctx.db.normalizeId("payouts", id),
});
