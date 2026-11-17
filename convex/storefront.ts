import { query } from "./_generated/server";
import { v } from "convex/values";
import { loadSettings } from "./settings";

/** Preuve sociale : derniers achats réels (prénom + pays uniquement), 14 jours. */
export const recentPurchases = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const s = await loadSettings(ctx, storeId);
    if (!s?.socialProofPopup) return [];
    const since = Date.now() - 14 * 86_400_000;
    const paid = await ctx.db
      .query("sales")
      .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "paid"))
      .order("desc")
      .take(40);
    const out = [];
    for (const sale of paid) {
      const at = sale.paidAt ?? sale._creationTime;
      if (at < since) break;
      if (sale.net === 0) continue; // pas les produits offerts
      const product = await ctx.db.get(sale.productId);
      if (!product || product.status !== "published") continue;
      // Le vendeur a masqué le nombre de ventes de ce produit : il n'apparaît pas non plus ici
      if (!product.showSalesCount) continue;
      out.push({
        firstName: sale.customerName.trim().split(/\s+/)[0] ?? "Quelqu'un",
        country: sale.context.country,
        productTitle: product.title,
        slug: product.slug,
        at,
      });
      if (out.length >= 12) break;
    }
    return out;
  },
});
