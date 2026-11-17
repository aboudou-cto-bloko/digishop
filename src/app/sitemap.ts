import type { MetadataRoute } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { abs } from "@/lib/seo";
import { storeFromHeaders } from "@/lib/store-from-headers";

// Un sitemap par boutique : servi sur le domaine de la boutique (hôte posé par proxy.ts)
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const store = await storeFromHeaders();
  if (!store || store.status !== "active") return [];
  const e = await fetchQuery(api.seo.sitemapEntries, { storeId: store._id });
  const base = store.url;
  return [
    { url: abs("/", base), lastModified: e.lastProductUpdate ? new Date(e.lastProductUpdate) : new Date(), changeFrequency: "daily", priority: 1 },
    ...e.products.map((p) => ({
      url: abs(`/p/${p.slug}`, base),
      lastModified: new Date(p.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.9,
      ...(p.image ? { images: [p.image] } : {}),
    })),
    ...e.pages.map((p) => ({ url: abs(`/pages/${p.slug}`, base), lastModified: new Date(p.updatedAt), changeFrequency: "yearly" as const, priority: 0.3 })),
  ];
}
