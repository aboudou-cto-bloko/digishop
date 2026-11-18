import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { storeByHost, storeBySlug } from "./store-lookup";

/**
 * Boutique de la requête courante, posée par proxy.ts :
 *  - mode chemin (/b/<slug>) : en-têtes x-store-slug + x-store-base
 *  - sous-domaine / domaine perso : en-tête x-store-host
 * `base` = préfixe des liens internes ("" ou "/b/<slug>"). Mémoïsée par requête.
 */
export const getStore = cache(async () => {
  const h = await headers();
  const slug = h.get("x-store-slug");
  const host = h.get("x-store-host") ?? h.get("host") ?? "";
  let store = slug ? await storeBySlug(slug) : await storeByHost(host);
  // Boutique en pause dans le cache : on relit l'état réel (elle vient peut-être d'ouvrir avec son premier produit).
  // Coût limité aux boutiques en pause ; les boutiques ouvertes restent servies par le cache.
  if (store?.status === "paused") {
    store = slug ? await fetchQuery(api.stores.bySlugPublic, { slug }) : await fetchQuery(api.stores.byHost, { host });
  }
  if (!store) notFound();
  return { ...store, base: slug ? (h.get("x-store-base") ?? `/b/${slug}`) : "" };
});
