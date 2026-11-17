import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
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
  const store = slug
    ? await storeBySlug(slug)
    : await storeByHost(h.get("x-store-host") ?? h.get("host") ?? "");
  if (!store) notFound();
  return { ...store, base: slug ? (h.get("x-store-base") ?? `/b/${slug}`) : "" };
});
