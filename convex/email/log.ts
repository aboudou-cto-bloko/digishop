import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";

const template = v.union(v.literal("purchase"), v.literal("seller_sale"), v.literal("recovery"));

export const create = internalMutation({
  args: {
    saleId: v.id("sales"),
    to: v.string(),
    template,
    stepId: v.optional(v.string()),
    meta: v.optional(v.object({ couponCode: v.optional(v.string()), expiresAt: v.optional(v.number()) })),
  },
  handler: async (ctx, args) => {
    // La boutique de l'email est celle de la vente
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Vente introuvable");
    return await ctx.db.insert("emailLog", { ...args, storeId: sale.storeId, status: "queued", attempts: 0 });
  },
});

export const get = internalQuery({
  args: { id: v.id("emailLog") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const result = internalMutation({
  args: {
    id: v.id("emailLog"),
    ok: v.boolean(),
    provider: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, ok, provider, error }) => {
    const row = await ctx.db.get(id);
    if (!row) return { attempts: 0 };
    const attempts = row.attempts + 1;
    await ctx.db.patch(id, {
      attempts,
      status: ok ? "sent" : "failed",
      provider: provider ?? row.provider,
      lastError: ok ? undefined : error,
    });
    return { attempts };
  },
});
