import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError, type ObjectType } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ownedBy, requireStore } from "./lib/auth";
import { slugify } from "./lib/utils";
import { DEFAULT_PREVIEW_PAGES, MAX_PREVIEW_PAGES, previewCount } from "./lib/preview";
import { faqItemV, orderBumpV, promoV, testimonialV } from "./lib/validators";

const fileV = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  size: v.number(),
  mime: v.string(),
  // Renseignés par le serveur (aperçu) : ignorés s'ils sont renvoyés par le navigateur
  pages: v.optional(v.number()),
  previewId: v.optional(v.id("_storage")),
  previewStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("none"), v.literal("failed"))),
});

type ProductFile = Doc<"products">["files"][number];

const isPdf = (f: { mime: string; name: string }) => f.mime === "application/pdf" || /\.pdf$/i.test(f.name);

async function withCover(ctx: QueryCtx, p: Doc<"products">) {
  return { ...p, coverUrl: p.coverId ? await ctx.storage.getUrl(p.coverId) : null };
}

/** Version publique : jamais les storageId des fichiers livrables. */
async function publicShape(ctx: QueryCtx, p: Doc<"products"> & { coverUrl: string | null }) {
  let orderBump = null;
  if (p.orderBump) {
    const bp = await ctx.db.get(p.orderBump.productId);
    if (bp && bp.status === "published" && bp._id !== p._id && bp.storeId === p.storeId) {
      orderBump = {
        productId: bp._id,
        title: bp.title,
        coverUrl: bp.coverId ? await ctx.storage.getUrl(bp.coverId) : null,
        price: p.orderBump.price,
        regularPrice: bp.price,
        pitch: p.orderBump.pitch,
      };
    }
  }
  return {
    _id: p._id,
    title: p.title,
    slug: p.slug,
    tagline: p.tagline,
    description: p.description,
    coverUrl: p.coverUrl,
    gallery: (
      await Promise.all(
        (p.gallery ?? []).map(async (g) => {
          const url = await ctx.storage.getUrl(g.storageId);
          return url ? { url, mime: g.mime, width: g.width ?? null, height: g.height ?? null } : null;
        }),
      )
    ).filter((g): g is { url: string; mime: string; width: number | null; height: number | null } => g !== null),
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    promo: p.promo ?? null,
    // Seul le PDF d'aperçu (N premières pages) est exposé, jamais le fichier livrable
    files: await Promise.all(
      p.files.map(async (f) => ({
        name: f.name,
        size: f.size,
        mime: f.mime,
        pages: f.pages ?? null,
        previewUrl: f.previewStatus === "ready" && f.previewId ? await ctx.storage.getUrl(f.previewId) : null,
        previewPages: f.previewStatus === "ready" ? previewCount(p.previewPages, f.pages) : 0,
      })),
    ),
    // Stock : uniquement si le vendeur a fixé une limite (sinon le nombre de ventes reste privé)
    stock: p.stockLimit !== undefined ? { sold: Math.min(p.salesCount, p.stockLimit), left: Math.max(0, p.stockLimit - p.salesCount), limit: p.stockLimit } : null,
    testimonials: await Promise.all(
      (p.testimonials ?? []).map(async (t) => ({ ...t, photoId: undefined, photoUrl: t.photoId ? await ctx.storage.getUrl(t.photoId) : null })),
    ),
    faq: p.faq ?? [],
    guarantee: p.guarantee?.enabled ? p.guarantee.text : null,
    // Nombre de ventes envoyé SEULEMENT si le vendeur l'affiche (≥ 5 vraies ventes) : sinon il ne quitte pas le serveur
    salesCountShown: p.showSalesCount && p.salesCount >= 5 ? p.salesCount : null,
    orderBump,
    countries: p.countries ?? [],
    cta: p.cta ?? null,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    updatedAt: p.updatedAt,
  };
}

// ── Public ──────────────────────────────────────────────────────────────

export const listPublished = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const rows = await ctx.db
      .query("products")
      .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "published"))
      .order("desc")
      .collect();
    return Promise.all(rows.map(async (p) => publicShape(ctx, await withCover(ctx, p))));
  },
});

export const bySlug = query({
  args: { storeId: v.id("stores"), slug: v.string() },
  handler: async (ctx, { storeId, slug }) => {
    const p = await ctx.db
      .query("products")
      .withIndex("by_store_slug", (q) => q.eq("storeId", storeId).eq("slug", slug))
      .unique();
    if (!p || p.status !== "published") return null;
    return publicShape(ctx, await withCover(ctx, p));
  },
});

export const internalGet = internalQuery({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

// ── Admin ───────────────────────────────────────────────────────────────

export const adminList = query({
  args: {
    storeId: v.id("stores"),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, { storeId, status, search }) => {
    await requireStore(ctx, storeId);
    let rows = await ctx.db
      .query("products")
      .withIndex("by_store_status", (q) => (status ? q.eq("storeId", storeId).eq("status", status) : q.eq("storeId", storeId)))
      .collect();
    // collect() sans limite : on retrie simplement par date (plus récent d'abord)
    rows.sort((a, b) => b._creationTime - a._creationTime);
    if (search?.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows.filter((p) => p.title.toLowerCase().includes(s));
    }
    return Promise.all(rows.map((p) => withCover(ctx, p)));
  },
});

export const adminGet = query({
  args: { storeId: v.id("stores"), id: v.id("products") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const p = await ctx.db.get(id);
    if (!p || p.storeId !== storeId) return null;
    const photos: Record<string, string | null> = {};
    for (const t of p.testimonials ?? []) if (t.photoId) photos[t.photoId] = await ctx.storage.getUrl(t.photoId);
    const galleryUrls: Record<string, string | null> = {};
    for (const g of p.gallery ?? []) galleryUrls[g.storageId] = await ctx.storage.getUrl(g.storageId);
    return { ...(await withCover(ctx, p)), photoUrls: photos, galleryUrls };
  },
});

/** Slug unique DANS la boutique : deux boutiques peuvent avoir la même adresse produit. */
async function uniqueSlug(ctx: QueryCtx, storeId: Id<"stores">, base: string, selfId?: string) {
  const root = slugify(base) || "produit";
  let slug = root;
  for (let i = 2; ; i++) {
    const hit = await ctx.db
      .query("products")
      .withIndex("by_store_slug", (q) => q.eq("storeId", storeId).eq("slug", slug))
      .unique();
    if (!hit || hit._id === selfId) return slug;
    slug = `${root}-${i}`;
  }
}

export const create = mutation({
  args: { storeId: v.id("stores"), title: v.string() },
  handler: async (ctx, { storeId, title }) => {
    await requireStore(ctx, storeId);
    const clean = title.trim() || "Nouveau produit";
    return await ctx.db.insert("products", {
      storeId,
      title: clean,
      slug: await uniqueSlug(ctx, storeId, clean),
      description: "",
      price: 0,
      status: "draft",
      files: [],
      salesCount: 0,
      updatedAt: Date.now(),
    });
  },
});

const galleryItemV = v.object({ storageId: v.id("_storage"), mime: v.string(), width: v.optional(v.number()), height: v.optional(v.number()) });
const GALLERY_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export const productUpdateFields = {
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    tagline: v.optional(v.string()),
    description: v.optional(v.string()),
    coverId: v.optional(v.union(v.id("_storage"), v.null())),
    gallery: v.optional(v.array(galleryItemV)),
    price: v.optional(v.number()),
    compareAtPrice: v.optional(v.union(v.number(), v.null())),
    files: v.optional(v.array(fileV)),
    testimonials: v.optional(v.array(testimonialV)),
    faq: v.optional(v.array(faqItemV)),
    guarantee: v.optional(v.union(v.object({ enabled: v.boolean(), text: v.string() }), v.null())),
    promo: v.optional(v.union(promoV, v.null())),
    showSalesCount: v.optional(v.boolean()),
    orderBump: v.optional(v.union(orderBumpV, v.null())),
    countries: v.optional(v.array(v.string())),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    previewPages: v.optional(v.number()),
    stockLimit: v.optional(v.union(v.number(), v.null())),
    cta: v.optional(v.string()),
};
export type ProductUpdateArgs = ObjectType<typeof productUpdateFields>;

export const update = mutation({
  args: { storeId: v.id("stores"), id: v.id("products"), ...productUpdateFields },
  handler: async (ctx, { storeId, id, ...args }) => {
    await requireStore(ctx, storeId);
    await applyProductUpdate(ctx, storeId, id, args);
  },
});

/** Mise à jour d'une fiche produit (dashboard et API OdiN). L'appelant a déjà vérifié le propriétaire. */
export async function applyProductUpdate(ctx: MutationCtx, storeId: Id<"stores">, id: Id<"products">, args: ProductUpdateArgs) {
  {
    const p = ownedBy(await ctx.db.get(id), storeId, "Produit");

    if (args.price !== undefined && (!Number.isInteger(args.price) || args.price < 0)) {
      throw new ConvexError("Le prix doit être un nombre entier positif.");
    }
    if (args.price !== undefined && args.price > 0 && args.price < 200) {
      throw new ConvexError("Le montant minimum accepté par le Mobile Money est de 200 F CFA.");
    }

    const patch: Partial<Doc<"products">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim() || p.title;
    if (args.slug !== undefined) patch.slug = await uniqueSlug(ctx, storeId, args.slug, id);
    if (args.tagline !== undefined) patch.tagline = args.tagline.trim() || undefined;
    if (args.description !== undefined) patch.description = args.description;
    if (args.price !== undefined) patch.price = args.price;
    if (args.compareAtPrice !== undefined) patch.compareAtPrice = args.compareAtPrice ?? undefined;

    if (args.coverId !== undefined) {
      if (p.coverId && p.coverId !== args.coverId) await ctx.storage.delete(p.coverId);
      patch.coverId = args.coverId ?? undefined;
    }
    // ── Fichiers + aperçus ──
    const nextPreviewPages = args.previewPages !== undefined ? Math.max(0, Math.min(MAX_PREVIEW_PAGES, Math.round(args.previewPages))) : p.previewPages;
    const previewChanged = args.previewPages !== undefined && nextPreviewPages !== (p.previewPages ?? DEFAULT_PREVIEW_PAGES);
    if (args.previewPages !== undefined) patch.previewPages = nextPreviewPages;
    if (args.files !== undefined || previewChanged) {
      const prev = new Map(p.files.map((f) => [f.storageId, f]));
      const incoming = args.files ?? p.files;
      const kept = new Set(incoming.map((f) => f.storageId));
      for (const f of p.files) {
        if (kept.has(f.storageId)) continue;
        await ctx.storage.delete(f.storageId);
        if (f.previewId) await ctx.storage.delete(f.previewId);
      }
      const files: ProductFile[] = [];
      for (const f of incoming) {
        const old = prev.get(f.storageId);
        // Les champs d'aperçu viennent toujours de la base, jamais du navigateur
        let next: ProductFile = { storageId: f.storageId, name: f.name, size: f.size, mime: f.mime, pages: old?.pages, previewId: old?.previewId, previewStatus: old?.previewStatus };
        const stale = !old || previewChanged;
        if (stale) {
          if (next.previewId) await ctx.storage.delete(next.previewId);
          next = { ...next, previewId: undefined, previewStatus: !isPdf(f) || nextPreviewPages === 0 ? "none" : "pending" };
        }
        files.push(next);
      }
      patch.files = files;
      if (files.some((f) => f.previewStatus === "pending")) await ctx.scheduler.runAfter(0, internal.previews.generate, { productId: id });
    }
    if (args.cta !== undefined) {
      // Texte libre court, sans caractères de contrôle ; vide = libellé par défaut
      const cta = args.cta.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
      if (cta.length > 28) throw new ConvexError("Le texte du bouton doit faire 28 caractères maximum.");
      patch.cta = cta || undefined;
    }
    if (args.stockLimit !== undefined) {
      if (args.stockLimit !== null && (!Number.isInteger(args.stockLimit) || args.stockLimit < 1)) throw new ConvexError("Le stock doit être un nombre entier d'au moins 1.");
      patch.stockLimit = args.stockLimit ?? undefined;
    }
    // ── Conversion ──
    const price = args.price ?? p.price;
    if (args.promo) {
      const pr = args.promo;
      if (!Number.isInteger(pr.price) || pr.price < 200) throw new ConvexError("Le prix promo doit être d'au moins 200 F CFA.");
      if (pr.price >= price) throw new ConvexError("Le prix promo doit être inférieur au prix normal.");
      if (pr.startsAt !== undefined && pr.startsAt >= pr.endsAt) throw new ConvexError("La fin de la promo doit être après son début.");
    }
    if (args.orderBump) {
      const ob = args.orderBump;
      if (ob.productId === id) throw new ConvexError("L'offre complémentaire doit être un autre produit.");
      ownedBy(await ctx.db.get(ob.productId), storeId, "Produit complémentaire");
      if (!Number.isInteger(ob.price) || ob.price < 100) throw new ConvexError("Le prix de l'offre complémentaire doit être d'au moins 100 F CFA.");
    }
    if (args.testimonials) {
      for (const t of args.testimonials) {
        if (!t.name.trim() || !t.text.trim()) throw new ConvexError("Chaque avis doit avoir un nom et un texte.");
        if (t.rating < 1 || t.rating > 5) throw new ConvexError("La note doit être entre 1 et 5.");
      }
      const kept = new Set(args.testimonials.map((t) => t.photoId).filter(Boolean));
      for (const t of p.testimonials ?? []) if (t.photoId && !kept.has(t.photoId)) await ctx.storage.delete(t.photoId);
      patch.testimonials = args.testimonials.slice(0, 30);
    }
    if (args.faq) patch.faq = args.faq.filter((f) => f.question.trim()).slice(0, 20);
    if (args.guarantee !== undefined) patch.guarantee = args.guarantee ?? undefined;
    if (args.promo !== undefined) patch.promo = args.promo ?? undefined;
    if (args.showSalesCount !== undefined) patch.showSalesCount = args.showSalesCount;
    if (args.orderBump !== undefined) patch.orderBump = args.orderBump ?? undefined;
    if (args.seoTitle !== undefined) patch.seoTitle = args.seoTitle.trim().slice(0, 70) || undefined;
    if (args.seoDescription !== undefined) patch.seoDescription = args.seoDescription.trim().slice(0, 170) || undefined;
    if (args.countries !== undefined) patch.countries = [...new Set(args.countries.map((c) => c.toUpperCase()))].filter((c) => /^[A-Z]{2}$/.test(c));

    if (args.gallery !== undefined) {
      const items = args.gallery.slice(0, 12).map((g) => ({ storageId: g.storageId, mime: g.mime, ...(g.width ? { width: Math.round(g.width) } : {}), ...(g.height ? { height: Math.round(g.height) } : {}) }));
      for (const g of items) {
        const meta = await ctx.db.system.get(g.storageId);
        if (!meta || !meta.contentType || !GALLERY_MIMES.includes(meta.contentType)) throw new ConvexError("Galerie : JPG, PNG, WebP ou GIF uniquement.");
        if (meta.size > 15 * 1024 * 1024) throw new ConvexError("Galerie : 15 Mo maximum par image.");
      }
      const kept = new Set(items.map((g) => g.storageId));
      for (const g of p.gallery ?? []) if (!kept.has(g.storageId)) await ctx.storage.delete(g.storageId);
      patch.gallery = items;
    }

    await ctx.db.patch(id, patch);
  }
}

export const setStatus = mutation({
  args: { storeId: v.id("stores"), id: v.id("products"), status: v.union(v.literal("draft"), v.literal("published")) },
  handler: async (ctx, { storeId, id, status }) => {
    await requireStore(ctx, storeId);
    const p = ownedBy(await ctx.db.get(id), storeId, "Produit");
    if (status === "published") {
      const missing: string[] = [];
      if (p.price < 200) missing.push("un prix (200 F CFA minimum)");
      if (p.files.length === 0) missing.push("au moins un fichier à livrer");
      if (missing.length) {
        throw new ConvexError(`Pour publier, ajoute ${missing.join(" et ")}.`);
      }
    }
    await ctx.db.patch(id, { status, updatedAt: Date.now() });
  },
});

export const duplicate = mutation({
  args: { storeId: v.id("stores"), id: v.id("products") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const p = ownedBy(await ctx.db.get(id), storeId, "Produit");
    const title = `${p.title} (copie)`;
    // Les fichiers sont partagés : on ne copie que la fiche, sans couverture ni fichiers
    return await ctx.db.insert("products", {
      storeId,
      title,
      slug: await uniqueSlug(ctx, storeId, title),
      tagline: p.tagline,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      status: "draft",
      files: [],
      salesCount: 0,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { storeId: v.id("stores"), id: v.id("products") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const p = ownedBy(await ctx.db.get(id), storeId, "Produit");
    const sale = await ctx.db
      .query("sales")
      .withIndex("by_product", (q) => q.eq("productId", id))
      .first();
    if (sale) {
      throw new ConvexError(
        "Ce produit a déjà des ventes : repasse-le en brouillon plutôt que de le supprimer, pour que tes clients gardent leur accès.",
      );
    }
    if (p.coverId) await ctx.storage.delete(p.coverId);
    for (const g of p.gallery ?? []) await ctx.storage.delete(g.storageId);
    for (const f of p.files) {
      await ctx.storage.delete(f.storageId);
      if (f.previewId) await ctx.storage.delete(f.previewId);
    }
    await ctx.db.delete(id);
  },
});

// ── Aperçus (appelé par previews.generate) ──────────────────────────────

export const setFilePreview = internalMutation({
  args: {
    productId: v.id("products"),
    storageId: v.id("_storage"),
    pages: v.optional(v.number()),
    previewId: v.optional(v.id("_storage")),
    status: v.union(v.literal("ready"), v.literal("none"), v.literal("failed")),
  },
  handler: async (ctx, { productId, storageId, pages, previewId, status }) => {
    const p = await ctx.db.get(productId);
    const f = p?.files.find((x) => x.storageId === storageId);
    // Fichier retiré ou réglage modifié pendant la génération : le résultat est jeté
    if (!p || !f || f.previewStatus !== "pending") {
      if (previewId) await ctx.storage.delete(previewId);
      return;
    }
    await ctx.db.patch(productId, {
      files: p.files.map((x) => (x.storageId === storageId ? { ...x, pages, previewId, previewStatus: status } : x)),
    });
  },
});
