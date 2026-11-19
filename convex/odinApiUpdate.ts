/** Mise à jour d'une fiche produit par l'API OdiN : mêmes règles que le dashboard (applyProductUpdate). */
import { internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { applyProductUpdate, productUpdateFields } from "./products";

export const run = internalMutation({
  args: { ownerId: v.id("users"), productId: v.string(), fields: v.object(productUpdateFields) },
  handler: async (ctx, { ownerId, productId, fields }) => {
    const id = ctx.db.normalizeId("products", productId);
    const p = id ? await ctx.db.get(id) : null;
    const store = p ? await ctx.db.get(p.storeId) : null;
    if (!id || !p || !store || store.ownerId !== ownerId) throw new ConvexError("Produit introuvable.");
    await applyProductUpdate(ctx, p.storeId, id, fields);
  },
});
