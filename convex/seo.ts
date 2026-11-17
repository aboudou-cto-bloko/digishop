import { query } from "./_generated/server";
import { v } from "convex/values";

/** Entrées du sitemap : produits et pages publiés, avec date de mise à jour. */
export const sitemapEntries = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "published"))
      .collect();
    const pages = (
      await ctx.db
        .query("pages")
        .withIndex("by_store_order", (q) => q.eq("storeId", storeId))
        .collect()
    ).filter((p) => p.published);
    return {
      products: await Promise.all(
        products.map(async (p) => ({ slug: p.slug, updatedAt: p.updatedAt, image: p.coverId ? await ctx.storage.getUrl(p.coverId) : null })),
      ),
      pages: pages.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
      lastProductUpdate: Math.max(0, ...products.map((p) => p.updatedAt)),
    };
  },
});
