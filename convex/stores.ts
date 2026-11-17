import { internalQuery, mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { canAccessStore, requireAdmin, requireStore } from "./lib/auth";
import { slugify } from "./lib/utils";
import { storeByHost, storeUrl } from "./lib/stores";

const RESERVED = new Set(["www", "admin", "api", "app", "mail", "apercu", "static", "cdn", "dashboard"]);

function cleanSlug(input: string) {
  return slugify(input).slice(0, 40);
}

function cleanDomain(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

// ── Public ──────────────────────────────────────────────────────────────

/** Résolution de la boutique à partir de l'hôte de la requête (proxy → layout boutique). */
export const byHost = query({
  args: { host: v.string() },
  handler: async (ctx, { host }) => {
    const store = await storeByHost(ctx, host);
    if (!store) return null;
    return { _id: store._id, slug: store.slug, name: store.name, status: store.status, url: storeUrl(store) };
  },
});

/** Résolution par chemin (/b/<slug>, mode STORE_ROUTING=path). */
export const bySlugPublic = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const store = await ctx.db
      .query("stores")
      .withIndex("by_slug", (q) => q.eq("slug", slug.toLowerCase()))
      .first();
    if (!store) return null;
    return { _id: store._id, slug: store.slug, name: store.name, status: store.status, url: storeUrl(store) };
  },
});

/** Boutiques en ligne (robots.txt du domaine de l'app en mode chemin). */
export const activeList = query({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("stores").collect()).filter((s) => s.status === "active").map((s) => ({ slug: s.slug, url: storeUrl(s) })),
});

// ── Admin ───────────────────────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAdmin(ctx);
    const stores = (await ctx.db.query("stores").collect()).filter((s) => canAccessStore(s, userId));
    const since = Date.now() - 30 * 86_400_000;
    return Promise.all(
      stores
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (s) => {
          const paid = await ctx.db
            .query("sales")
            .withIndex("by_store_status", (q) => q.eq("storeId", s._id).eq("status", "paid"))
            .collect()
      .then((rows) => rows.filter((x) => !x.refund));
          const recent = paid.filter((x) => (x.paidAt ?? x._creationTime) >= since);
          const settings = await ctx.db
            .query("settings")
            .withIndex("by_store", (q) => q.eq("storeId", s._id))
            .first();
          const published = await ctx.db
            .query("products")
            .withIndex("by_store_status", (q) => q.eq("storeId", s._id).eq("status", "published"))
            .first();
          return {
            ...s,
            url: storeUrl(s),
            logoUrl: settings?.logoId ? await ctx.storage.getUrl(settings.logoId) : null,
            revenue: paid.reduce((a, x) => a + x.net - (x.fees ?? 0), 0),
            sales30: recent.length,
            revenue30: recent.reduce((a, x) => a + x.net, 0),
            hasProduct: Boolean(published),
          };
        }),
    );
  },
});

export const get = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const store = await requireStore(ctx, storeId);
    return { ...store, url: storeUrl(store) };
  },
});

export const slugAvailable = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireAdmin(ctx);
    const clean = cleanSlug(slug);
    if (clean.length < 3) return { ok: false, slug: clean, reason: "3 caractères minimum" };
    if (RESERVED.has(clean)) return { ok: false, slug: clean, reason: "Adresse réservée" };
    const hit = await ctx.db
      .query("stores")
      .withIndex("by_slug", (q) => q.eq("slug", clean))
      .first();
    return hit ? { ok: false, slug: clean, reason: "Déjà utilisée" } : { ok: true, slug: clean };
  },
});

export const create = mutation({
  args: { name: v.string(), slug: v.string() },
  handler: async (ctx, { name, slug }) => {
    const userId = await requireAdmin(ctx);
    const clean = cleanSlug(slug || name);
    if (!name.trim()) throw new ConvexError("Donne un nom à la boutique.");
    if (clean.length < 3 || RESERVED.has(clean)) throw new ConvexError("Adresse invalide ou réservée.");
    const hit = await ctx.db
      .query("stores")
      .withIndex("by_slug", (q) => q.eq("slug", clean))
      .first();
    if (hit) throw new ConvexError("Cette adresse est déjà utilisée.");
    // Le nom du propriétaire et les contacts sont repris d'une boutique du MÊME compte (jamais d'un autre locataire)
    const mine = (await ctx.db.query("stores").withIndex("by_owner", (q) => q.eq("ownerId", userId)).first())?._id;
    const first = mine ? await ctx.db.query("settings").withIndex("by_store", (q) => q.eq("storeId", mine)).first() : null;
    // En pause tant qu'aucun produit n'est publié : pas de vitrine vide en ligne
    const storeId = await ctx.db.insert("stores", { name: name.trim(), slug: clean, status: "paused", createdAt: Date.now(), ownerId: userId });
    await ctx.db.insert("settings", {
      storeId,
      storeName: name.trim(),
      ownerName: first?.ownerName ?? "",
      supportEmail: first?.supportEmail,
      whatsapp: first?.whatsapp,
      notifyEmail: first?.notifyEmail,
    });
    return storeId;
  },
});

export const update = mutation({
  args: {
    storeId: v.id("stores"),
    name: v.optional(v.string()),
    customDomain: v.optional(v.union(v.string(), v.null())),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"))),
  },
  handler: async (ctx, { storeId, name, customDomain, status }) => {
    await requireStore(ctx, storeId);
    const patch: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) throw new ConvexError("Nom obligatoire.");
      patch.name = name.trim();
      const s = await ctx.db
        .query("settings")
        .withIndex("by_store", (q) => q.eq("storeId", storeId))
        .first();
      if (s) await ctx.db.patch(s._id, { storeName: name.trim() });
    }
    if (customDomain !== undefined) {
      if (customDomain === null || !customDomain.trim()) patch.customDomain = undefined;
      else {
        const d = cleanDomain(customDomain);
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new ConvexError("Domaine invalide (ex. boutique.mondomaine.com).");
        const hit = await ctx.db
          .query("stores")
          .withIndex("by_domain", (q) => q.eq("customDomain", d))
          .first();
        if (hit && hit._id !== storeId) throw new ConvexError("Ce domaine est déjà utilisé par une autre boutique.");
        patch.customDomain = d;
      }
    }
    if (status !== undefined) {
      if (status === "active") {
        const published = await ctx.db
          .query("products")
          .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "published"))
          .first();
        if (!published) throw new ConvexError("Publie au moins un produit avant d'ouvrir la boutique.");
      }
      patch.status = status;
    }
    await ctx.db.patch(storeId, patch);
  },
});

export const internalGet = internalQuery({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const s = await ctx.db.get(storeId);
    return s ? { ...s, url: storeUrl(s) } : null;
  },
});
