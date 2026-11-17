import type { MetadataRoute } from "next";
import { abs } from "@/lib/seo";
import { storeFromHeaders } from "@/lib/store-from-headers";
import { activeStores } from "@/lib/store-lookup";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const store = await storeFromHeaders();
  if (!store) {
    // Domaine de l'app : le dashboard n'est pas indexé ; en mode chemin, les boutiques le sont sous /b/<slug>
    const active = process.env.NEXT_PUBLIC_STORE_ROUTING === "path" ? await activeStores() : [];
    return {
      rules: [{ userAgent: "*", allow: active.map((s) => `/b/${s.slug}/`), disallow: ["/admin", "/apercu", "/login", "/api", "/b/*/checkout", "/b/*/merci"] }],
      sitemap: active.map((s) => abs("/sitemap.xml", s.url)),
    };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Espaces transactionnels ou personnels : sans intérêt pour la recherche
        disallow: ["/checkout", "/merci", "/desabonnement", "/acces-indisponible", "/api"],
      },
    ],
    sitemap: abs("/sitemap.xml", store.url),
  };
}
