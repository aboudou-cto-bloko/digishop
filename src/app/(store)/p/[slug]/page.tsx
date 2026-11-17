import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "../../../../../convex/_generated/api";
import { ViewTracker } from "@/components/shared/view-tracker";
import { ProductView } from "@/components/store/product-view";
import { CheckoutSheet } from "@/components/store/checkout-sheet";
import { effectivePrice } from "../../../../../convex/lib/pricing";
import { JsonLd, metaDescription, productJsonLd } from "@/lib/seo";
import { getStore } from "@/lib/store-context";
import { safeRichHtml } from "@/lib/sanitize";
import { ProductPixel } from "./product-pixel";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStore();
  const p = await fetchQuery(api.products.bySlug, { storeId: store._id, slug });
  if (!p) return {};
  const description = p.seoDescription ?? metaDescription(p.tagline ?? p.description);
  const title = p.seoTitle ?? p.title;
  return {
    title,
    description,
    alternates: { canonical: `${store.url}/p/${p.slug}` },
    openGraph: { type: "website", locale: "fr_FR", url: `${store.url}/p/${p.slug}`, title, description, images: [{ url: `${store.url}/p/${p.slug}/og`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [`${store.url}/p/${p.slug}/og`] },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const store = await getStore();
  const [p, settings, checkout, pages] = await Promise.all([
    fetchQuery(api.products.bySlug, { storeId: store._id, slug }),
    fetchQuery(api.settings.publicSettings, { storeId: store._id }),
    fetchQuery(api.checkout.page, { storeId: store._id, slug }),
    fetchQuery(api.pages.publicList, { storeId: store._id }),
  ]);
  if (!p) notFound();
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <>
      <JsonLd data={productJsonLd(p, settings.storeName, now, store.url)} />
      {/* Balises produit Open Graph (catalogue / partage Facebook) : React 19 les remonte dans <head> */}
      <meta property="product:price:amount" content={String(effectivePrice(p, now).price)} />
      <meta property="product:price:currency" content="XOF" />
      <meta property="product:availability" content="in stock" />
      <meta property="product:condition" content="new" />
      <meta property="product:retailer_item_id" content={p._id} />
      <ViewTracker productId={p._id} />
      <ProductPixel id={p._id} title={p.title} price={effectivePrice(p, now).price} />
      <ProductView product={p} descriptionHtml={safeRichHtml(p.description)} whatsapp={settings.whatsapp} now={now} base={store.base} />
      {/* Paiement en widget par-dessus la fiche (plus de page séparée) */}
      {checkout && !checkout.soldOut && (
        <CheckoutSheet
          product={checkout}
          legal={{ cgv: pages.find((x) => x.kind === "cgv")?.slug, refund: pages.find((x) => x.kind === "remboursement")?.slug }}
          now={now}
          base={store.base}
        />
      )}
    </>
  );
}
