import { headers } from "next/headers";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "../../../convex/_generated/api";
import { Pixels } from "@/components/shared/pixels";
import { ViewTracker } from "@/components/shared/view-tracker";
import { StoreShell } from "@/components/store/store-shell";
import { isCountryCode } from "@/lib/geo";
import { getStore } from "@/lib/store-context";

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  const s = await fetchQuery(api.settings.publicSettings, { storeId: store._id });
  const description = s.seoDescription ?? s.tagline;
  return {
    title: { default: s.seoTitle ?? s.storeName, template: `%s · ${s.storeName}` },
    description,
    applicationName: s.storeName,
    metadataBase: new URL(store.url),
    // Mode chemin : chaque boutique a son propre manifeste (sinon le lien racine servirait celui du dashboard)
    manifest: `${store.base}/manifest.webmanifest`,
    alternates: { canonical: `${store.url}/` },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    openGraph: { type: "website", locale: "fr_FR", siteName: s.storeName, title: s.seoTitle ?? s.storeName, description, images: [{ url: `${store.url}/og`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: s.seoTitle ?? s.storeName, description, images: [`${store.url}/og`] },
    ...(s.logoUrl ? { icons: { icon: s.logoUrl, apple: s.logoUrl } } : {}),
  };
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const store = await getStore();
  const [s, pages, h] = await Promise.all([
    fetchQuery(api.settings.publicSettings, { storeId: store._id }),
    fetchQuery(api.pages.publicList, { storeId: store._id }),
    headers(),
  ]);
  // Géolocalisation fournie par l'hébergeur (Vercel / Cloudflare) ; sinon le navigateur prend le relais
  const ipCountry = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? undefined;
  return (
    <StoreShell storeId={store._id} base={store.base} settings={s} theme={s.theme} pages={pages} initialCountry={isCountryCode(ipCountry) ? ipCountry.toUpperCase() : undefined}>
      <Pixels fbPixelId={s.fbPixelId} tiktokPixelId={s.tiktokPixelId} />
      <ViewTracker />
      {store.status === "paused" ? (
        <main className="mx-auto max-w-lg px-4 pt-16 text-center">
          <h1 className="font-heading text-4xl">Bientôt ouverte</h1>
          <p className="mt-3 text-muted-foreground">{s.storeName} prépare ses premiers produits. Reviens très vite !</p>
        </main>
      ) : (
        children
      )}
    </StoreShell>
  );
}
