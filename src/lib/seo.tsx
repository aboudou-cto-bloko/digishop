import { effectivePrice, type Promo } from "../../convex/lib/pricing";
import { htmlToText } from "./rich-html";

/** URL publique (canonical, sitemap, OG). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** URL absolue ; `base` = URL de la boutique (multi-boutiques), sinon l'URL du site. */
export const abs = (path: string, base?: string) => `${(base ?? siteUrl()).replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

/** Coupe proprement un texte pour une meta description (≈ 155 caractères, sans couper un mot). */
export function metaDescription(text: string | undefined, max = 155): string | undefined {
  const t = htmlToText(text ?? "").trim();
  if (!t) return undefined;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : max).trim()}…`;
}

const absUrl = (path: string, base: string) => abs(path, base);

/** Données structurées schema.org (Google, réseaux sociaux). `<` échappé pour éviter toute injection. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function storeJsonLd(
  s: { storeName: string; tagline?: string; logoUrl: string | null; whatsapp?: string; supportEmail?: string; seoDescription?: string },
  base: string,
) {
  const abs = (path: string) => absUrl(path, base);
  const org = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": abs("/#store"),
    name: s.storeName,
    url: abs("/"),
    description: s.seoDescription ?? s.tagline,
    ...(s.logoUrl ? { logo: s.logoUrl, image: s.logoUrl } : {}),
    ...(s.supportEmail || s.whatsapp
      ? {
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "customer support",
            ...(s.supportEmail ? { email: s.supportEmail } : {}),
            ...(s.whatsapp ? { telephone: s.whatsapp.replace(/\s/g, "") } : {}),
            availableLanguage: ["fr"],
          },
        }
      : {}),
  };
  const site = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": abs("/#website"),
    url: abs("/"),
    name: s.storeName,
    inLanguage: "fr",
    publisher: { "@id": abs("/#store") },
  };
  return [org, site];
}

type ProductForLd = {
  _id: string;
  title: string;
  slug: string;
  tagline?: string;
  description: string;
  coverUrl: string | null;
  price: number;
  compareAtPrice?: number;
  promo: Promo | null;
  testimonials: { name: string; rating: number; text: string }[];
  faq: { question: string; answer: string }[];
  files: { mime: string }[];
  seoDescription?: string;
};

export function productJsonLd(p: ProductForLd, storeName: string, now: number, base: string) {
  const abs = (path: string) => absUrl(path, base);
  const url = abs(`/p/${p.slug}`);
  const { price, promo } = effectivePrice(p, now);
  const ratings = p.testimonials.filter((t) => t.rating >= 1);
  const out: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "@id": `${url}#product`,
      name: p.title,
      description: p.seoDescription ?? p.tagline ?? metaDescription(p.description, 300),
      sku: p._id,
      url,
      ...(p.coverUrl ? { image: [p.coverUrl] } : {}),
      brand: { "@type": "Brand", name: storeName },
      category: "Produit numérique téléchargeable",
      offers: {
        "@type": "Offer",
        url,
        price,
        priceCurrency: "XOF",
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
        seller: { "@id": abs("/#store") },
        ...(promo ? { priceValidUntil: new Date(promo.endsAt).toISOString().slice(0, 10) } : {}),
        // Produit numérique : livraison instantanée, sans frais
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "XOF" },
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 0, unitCode: "DAY" },
          },
        },
      },
      ...(ratings.length
        ? {
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: Math.round((ratings.reduce((a, t) => a + t.rating, 0) / ratings.length) * 10) / 10,
              reviewCount: ratings.length,
              bestRating: 5,
              worstRating: 1,
            },
            review: ratings.slice(0, 10).map((t) => ({
              "@type": "Review",
              author: { "@type": "Person", name: t.name },
              reviewRating: { "@type": "Rating", ratingValue: t.rating, bestRating: 5 },
              reviewBody: t.text,
            })),
          }
        : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: storeName, item: abs("/") },
        { "@type": "ListItem", position: 2, name: p.title, item: url },
      ],
    },
  ];
  if (p.faq.length) {
    out.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: p.faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })),
    });
  }
  return out;
}

export function itemListJsonLd(products: { slug: string; title: string }[], base: string) {
  const abs = (path: string) => absUrl(path, base);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(`/p/${p.slug}`), name: p.title })),
  };
}
