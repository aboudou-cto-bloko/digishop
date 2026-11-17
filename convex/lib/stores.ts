import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Domaine racine des sous-domaines boutique (ex. digishop.bj → slug.digishop.bj ; local : localhost:3000). */
export function rootDomain(): string {
  return (process.env.ROOT_DOMAIN ?? "localhost:3000").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

const isLocal = (host: string) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) || host.endsWith(".localhost") || host.includes(".localhost:");

/** Adressage des boutiques : sous-domaines (domaine propre) ou chemin /b/<slug> (ex. sur vercel.app). */
export function storeRouting(): "subdomain" | "path" {
  return process.env.STORE_ROUTING === "path" ? "path" : "subdomain";
}

/** URL publique d'une boutique : domaine personnalisé, sinon sous-domaine ou chemin selon STORE_ROUTING. */
export function storeUrl(store: Pick<Doc<"stores">, "slug" | "customDomain">): string {
  if (store.customDomain) return `https://${store.customDomain}`;
  if (storeRouting() === "path") return `${(process.env.SITE_URL ?? "").replace(/\/$/, "")}/b/${store.slug}`;
  const root = rootDomain();
  return `${isLocal(root) ? "http" : "https"}://${store.slug}.${root}`;
}

/** Hôte (sans port pour le domaine perso) → boutique. */
export async function storeByHost(ctx: QueryCtx, rawHost: string): Promise<Doc<"stores"> | null> {
  const host = rawHost.toLowerCase().trim();
  const root = rootDomain().toLowerCase();
  if (host.endsWith(`.${root}`)) {
    const slug = host.slice(0, -root.length - 1);
    return await ctx.db
      .query("stores")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
  }
  const bare = host.replace(/^www\./, "").replace(/:\d+$/, "");
  return await ctx.db
    .query("stores")
    .withIndex("by_domain", (q) => q.eq("customDomain", bare))
    .first();
}

export function assertSameStore(doc: { storeId: Id<"stores"> } | null | undefined, storeId: Id<"stores">): asserts doc {
  if (!doc || doc.storeId !== storeId) throw new Error("Introuvable dans cette boutique");
}
