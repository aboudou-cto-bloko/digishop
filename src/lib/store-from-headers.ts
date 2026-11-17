import "server-only";
import { headers } from "next/headers";
import { storeByHost, storeBySlug } from "./store-lookup";

/** Variante sans 404 (sitemap, robots, manifest) : null si la requête ne vise pas une boutique. */
export async function storeFromHeaders() {
  const h = await headers();
  const slug = h.get("x-store-slug");
  if (slug) return await storeBySlug(slug);
  const host = h.get("x-store-host");
  return host ? await storeByHost(host) : null;
}
