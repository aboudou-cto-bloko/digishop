import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { storeFromHeaders } from "@/lib/store-from-headers";
import { BRAND } from "../../convex/lib/brand";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const store = await storeFromHeaders();
  if (!store) {
    // Application du dashboard (PWA installable, notifications de vente)
    return {
      id: "/admin",
      name: `${BRAND.name} — Dashboard`,
      short_name: BRAND.name,
      description: `${BRAND.tagline}. ${BRAND.disclaimer}`,
      start_url: "/admin",
      scope: "/admin",
      display: "standalone",
      orientation: "portrait",
      background_color: "#f3f4f3",
      theme_color: "#141414",
      lang: "fr",
      icons: [
        { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/pwa-icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "Ventes", url: "/admin/ventes", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
        { name: "Revenus", url: "/admin/revenus", icons: [{ src: "/pwa-icon/192", sizes: "192x192" }] },
      ],
    };
  }
  const base = (await headers()).get("x-store-base") ?? "";
  const s = await fetchQuery(api.settings.publicSettings, { storeId: store._id });
  return {
    name: s.storeName,
    short_name: s.storeName.slice(0, 12),
    description: s.seoDescription ?? s.tagline ?? "Produits digitaux",
    start_url: `${base}/`,
    scope: `${base}/`,
    display: "standalone",
    background_color: s.theme.background,
    theme_color: s.theme.background,
    lang: "fr",
    icons: s.logoUrl ? [{ src: s.logoUrl, sizes: "512x512", type: "image/png", purpose: "any" }] : [],
  };
}
