import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { api } from "../../../../../convex/_generated/api";
import { CheckoutForm } from "./checkout-form";
import { getStore } from "@/lib/store-context";

export const metadata: Metadata = { title: "Paiement", robots: { index: false } };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  // Le paiement s'ouvre désormais en widget sur la fiche produit : les liens directs (relances, pubs) y mènent
  const sp = new URLSearchParams();
  for (const [k, val] of Object.entries(await searchParams)) if (typeof val === "string") sp.set(k, val);
  sp.set("acheter", "1");
  const target = await getStore();
  const exists = await fetchQuery(api.checkout.page, { storeId: target._id, slug });
  if (exists && !exists.soldOut) redirect(`${target.base}/p/${slug}?${sp.toString()}`);
  const store = await getStore();
  const [product, pages] = await Promise.all([
    fetchQuery(api.checkout.page, { storeId: store._id, slug }),
    fetchQuery(api.pages.publicList, { storeId: store._id }),
  ]);
  if (!product) notFound();
  // Stock épuisé : retour à la fiche produit (le serveur refuse de toute façon la commande)
  if (product.soldOut) redirect(`${store.base}/p/${product.slug}`);
  const cgv = pages.find((p) => p.kind === "cgv");
  const refund = pages.find((p) => p.kind === "remboursement");
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <CheckoutForm product={product} legal={{ cgv: cgv?.slug, refund: refund?.slug }} now={now} base={store.base} />;
}
