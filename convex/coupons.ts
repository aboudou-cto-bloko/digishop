import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { ownedBy, requireStore } from "./lib/auth";
import { effectivePrice } from "./lib/pricing";

export function computeDiscount(coupon: Doc<"coupons">, price: number): number {
  const raw = coupon.type === "percent" ? Math.round((price * coupon.value) / 100) : coupon.value;
  return Math.max(0, Math.min(raw, price));
}

/** Renvoie le coupon applicable ou un message d'erreur lisible par le client. */
export async function resolveCoupon(
  ctx: QueryCtx,
  storeId: Id<"stores">,
  code: string,
  productId: Id<"products">,
): Promise<{ ok: true; coupon: Doc<"coupons"> } | { ok: false; error: string }> {
  // Les codes sont propres à chaque boutique : un code de A n'existe pas sur B
  const c = await ctx.db
    .query("coupons")
    .withIndex("by_store_code", (q) => q.eq("storeId", storeId).eq("code", code.trim().toUpperCase()))
    .unique();
  if (!c || !c.active) return { ok: false, error: "Ce code promo n'existe pas." };
  if (c.expiresAt && c.expiresAt < Date.now()) return { ok: false, error: "Ce code promo a expiré." };
  if (c.maxUses !== undefined && c.uses >= c.maxUses)
    return { ok: false, error: "Ce code promo a atteint sa limite d'utilisation." };
  if (c.productId && c.productId !== productId)
    return { ok: false, error: "Ce code promo ne s'applique pas à ce produit." };
  return { ok: true, coupon: c };
}

/** Prévisualisation au checkout : le vrai calcul est refait dans createSale. */
export const preview = query({
  args: { code: v.string(), productId: v.id("products") },
  handler: async (ctx, { code, productId }) => {
    const product = await ctx.db.get(productId);
    if (!product) return { ok: false as const, error: "Produit introuvable." };
    const r = await resolveCoupon(ctx, product.storeId, code, productId);
    if (!r.ok) return r;
    const { price } = effectivePrice(product, Date.now());
    const discount = computeDiscount(r.coupon, price);
    return { ok: true as const, code: r.coupon.code, discount, net: price - discount };
  },
});

export const list = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const rows = await ctx.db
      .query("coupons")
      .withIndex("by_store_code", (q) => q.eq("storeId", storeId))
      .collect();
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return Promise.all(
      rows.map(async (c) => ({
        ...c,
        productTitle: c.productId ? (await ctx.db.get(c.productId))?.title : undefined,
      })),
    );
  },
});

export const create = mutation({
  args: {
    storeId: v.id("stores"),
    code: v.string(),
    type: v.union(v.literal("percent"), v.literal("fixed")),
    value: v.number(),
    maxUses: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    productId: v.optional(v.id("products")),
  },
  handler: async (ctx, { storeId, ...args }) => {
    await requireStore(ctx, storeId);
    if (args.productId) ownedBy(await ctx.db.get(args.productId), storeId, "Produit");
    const code = args.code.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) {
      throw new ConvexError("Le code doit faire 3 à 30 caractères (lettres, chiffres, - ou _).");
    }
    if (!Number.isInteger(args.value) || args.value <= 0) throw new ConvexError("La valeur doit être positive.");
    if (args.type === "percent" && args.value > 100) throw new ConvexError("Une réduction ne peut pas dépasser 100 %.");
    const exists = await ctx.db
      .query("coupons")
      .withIndex("by_store_code", (q) => q.eq("storeId", storeId).eq("code", code))
      .unique();
    if (exists) throw new ConvexError("Ce code existe déjà.");
    return await ctx.db.insert("coupons", { ...args, storeId, code, uses: 0, active: true });
  },
});

export const toggle = mutation({
  args: { storeId: v.id("stores"), id: v.id("coupons"), active: v.boolean() },
  handler: async (ctx, { storeId, id, active }) => {
    await requireStore(ctx, storeId);
    ownedBy(await ctx.db.get(id), storeId, "Code promo");
    await ctx.db.patch(id, { active });
  },
});

export const remove = mutation({
  args: { storeId: v.id("stores"), id: v.id("coupons") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    ownedBy(await ctx.db.get(id), storeId, "Code promo");
    await ctx.db.delete(id);
  },
});
