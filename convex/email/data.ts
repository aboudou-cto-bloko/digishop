import { internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import { v } from "convex/values";
import { sourceOf } from "../analytics";
import type { Id } from "../_generated/dataModel";
import { deliverableFiles } from "../sales";
import { loadSettings } from "../settings";
import { storeUrl } from "../lib/stores";

/** Adresse du dashboard (admin) : l'app principale, pas le domaine d'une boutique. */
function adminSite() {
  return (process.env.SITE_URL ?? "").replace(/\/$/, "");
}

/** Identité de la boutique dans les emails : nom, logo, domaine, pages légales. */
async function storeInfo(ctx: QueryCtx, storeId: Id<"stores">) {
  const s = await loadSettings(ctx, storeId);
  const st = await ctx.db.get(storeId);
  const base = st ? storeUrl(st) : adminSite();
  const pages = (
    await ctx.db
      .query("pages")
      .withIndex("by_store_order", (q) => q.eq("storeId", storeId))
      .collect()
  ).filter((p) => p.published && p.kind !== "custom");
  return {
    settings: s,
    slug: st?.slug,
    base,
    store: {
      storeName: s?.storeName ?? st?.name ?? "Ma boutique",
      logoUrl: s?.logoId ? await ctx.storage.getUrl(s.logoId) : null,
      siteUrl: base,
      legalLinks: pages.map((p) => ({ title: p.kind === "cgv" ? "CGV" : p.title, url: `${base}/pages/${p.slug}` })),
    },
  };
}

/** Tout ce qu'il faut pour rendre un email de vente, en une seule lecture. */
export const forSale = internalQuery({
  args: { saleId: v.id("sales") },
  handler: async (ctx, { saleId }) => {
    const sale = await ctx.db.get(saleId);
    if (!sale) return null;
    const product = await ctx.db.get(sale.productId);
    const { settings, store, base, slug } = await storeInfo(ctx, sale.storeId);
    return {
      sale,
      store,
      notifyEmail: settings?.notifyEmail,
      supportEmail: settings?.supportEmail,
      supportWhatsapp: settings?.whatsapp,
      coverUrl: product?.coverId ? await ctx.storage.getUrl(product.coverId) : null,
      files: (await deliverableFiles(ctx, sale)).map((f) => ({ name: f.name, size: f.size })),
      source: sourceOf(sale.context),
      productSlug: product?.slug,
      accessUrl: `${base}/merci/${sale._id}?k=${sale.accessKey}`,
      dashboardUrl: `${adminSite()}/admin/ventes?boutique=${slug ?? ""}&vente=${sale._id}`,
    };
  },
});

export const store = internalQuery({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const { settings, store } = await storeInfo(ctx, storeId);
    return { store, notifyEmail: settings?.notifyEmail };
  },
});

export const couponByCode = internalQuery({
  args: { storeId: v.id("stores"), code: v.string() },
  handler: async (ctx, { storeId, code }) =>
    await ctx.db
      .query("coupons")
      .withIndex("by_store_code", (q) => q.eq("storeId", storeId).eq("code", code))
      .first(),
});

export const anySale = internalQuery({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) =>
    (
      await ctx.db
        .query("sales")
        .withIndex("by_store", (q) => q.eq("storeId", storeId))
        .order("desc")
        .first()
    )?._id ?? null,
});
