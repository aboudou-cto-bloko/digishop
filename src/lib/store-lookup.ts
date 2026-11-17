import "server-only";
import { unstable_cache } from "next/cache";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";

/**
 * Résolutions boutique mises en cache côté Next : une page vue ne doit pas coûter un appel Convex
 * juste pour retrouver la boutique. Invalidation : `revalidateTag("stores")` ou expiration (5 min).
 */
const TTL = 300;

export const storeBySlug = unstable_cache(
  (slug: string) => fetchQuery(api.stores.bySlugPublic, { slug }),
  ["store-by-slug"],
  { revalidate: TTL, tags: ["stores"] },
);

export const storeByHost = unstable_cache(
  (host: string) => fetchQuery(api.stores.byHost, { host }),
  ["store-by-host"],
  { revalidate: TTL, tags: ["stores"] },
);

export const activeStores = unstable_cache(() => fetchQuery(api.stores.activeList, {}), ["stores-active"], {
  revalidate: 3600,
  tags: ["stores"],
});
