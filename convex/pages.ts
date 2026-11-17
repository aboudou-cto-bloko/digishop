import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { ownedBy, requireStore } from "./lib/auth";
import { storeUrl } from "./lib/stores";
import { slugify } from "./lib/utils";
import { DEFAULT_PAGES, buildDefaultPage, type LegalKind } from "./lib/legal_templates";
import { loadSettings } from "./settings";

const MAX_CONTENT = 200_000;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function templateCtx(ctx: MutationCtx, storeId: Id<"stores">) {
  const s = await loadSettings(ctx, storeId);
  const store = await ctx.db.get(storeId);
  return {
    storeName: esc(s?.storeName ?? "Ma boutique"),
    ownerName: s?.ownerName ? esc(s.ownerName) : undefined,
    email: s?.supportEmail ? esc(s.supportEmail) : undefined,
    whatsapp: s?.whatsapp ? esc(s.whatsapp) : undefined,
    siteUrl: esc(store ? storeUrl(store).replace(/^https?:\/\//, "") : ""),
  };
}

// ── Public ──────────────────────────────────────────────────────────────

export const publicList = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const rows = await ctx.db
      .query("pages")
      .withIndex("by_store_order", (q) => q.eq("storeId", storeId))
      .collect();
    return rows.filter((p) => p.published).map((p) => ({ slug: p.slug, title: p.title, kind: p.kind }));
  },
});

export const publicBySlug = query({
  args: { storeId: v.id("stores"), slug: v.string() },
  handler: async (ctx, { storeId, slug }) => {
    const p = await ctx.db
      .query("pages")
      .withIndex("by_store_slug", (q) => q.eq("storeId", storeId).eq("slug", slug))
      .unique();
    if (!p || !p.published) return null;
    return { title: p.title, content: p.content, updatedAt: p.updatedAt, kind: p.kind };
  },
});

// ── Admin ───────────────────────────────────────────────────────────────

export const list = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const rows = await ctx.db
      .query("pages")
      .withIndex("by_store_order", (q) => q.eq("storeId", storeId))
      .collect();
    const missing = DEFAULT_PAGES.filter((d) => !rows.some((r) => r.kind === d.kind)).map((d) => ({ kind: d.kind, title: d.title }));
    return {
      pages: rows.map((p) => ({ ...p, todoCount: (p.content.match(/<mark>/g) ?? []).length })),
      missing,
    };
  },
});

export const get = query({
  args: { storeId: v.id("stores"), id: v.id("pages") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const p = await ctx.db.get(id);
    return p && p.storeId === storeId ? p : null;
  },
});

/** Crée les pages légales manquantes à partir des modèles (en brouillon). */
export const createDefaults = mutation({
  args: { storeId: v.id("stores"), kinds: v.optional(v.array(v.string())) },
  handler: async (ctx, { storeId, kinds }) => {
    await requireStore(ctx, storeId);
    const existing = await ctx.db
      .query("pages")
      .withIndex("by_store_order", (q) => q.eq("storeId", storeId))
      .collect();
    const tctx = await templateCtx(ctx, storeId);
    let created = 0;
    for (const d of DEFAULT_PAGES) {
      if (kinds && !kinds.includes(d.kind)) continue;
      if (existing.some((p) => p.kind === d.kind || p.slug === d.slug)) continue;
      const page = buildDefaultPage(d.kind, tctx);
      await ctx.db.insert("pages", {
        storeId,
        slug: page.slug,
        title: page.title,
        content: page.content,
        kind: d.kind,
        published: false,
        order: d.order,
        updatedAt: Date.now(),
      });
      created++;
    }
    return created;
  },
});

export const create = mutation({
  args: { storeId: v.id("stores"), title: v.string() },
  handler: async (ctx, { storeId, title }) => {
    await requireStore(ctx, storeId);
    const clean = title.trim() || "Nouvelle page";
    const all = await ctx.db
      .query("pages")
      .withIndex("by_store_order", (q) => q.eq("storeId", storeId))
      .collect();
    let slug = slugify(clean) || "page";
    for (let i = 2; all.some((p) => p.slug === slug); i++) slug = `${slugify(clean)}-${i}`;
    return await ctx.db.insert("pages", {
      storeId,
      slug,
      title: clean,
      content: "",
      kind: "custom",
      published: false,
      order: 100 + all.length,
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    storeId: v.id("stores"),
    id: v.id("pages"),
    title: v.optional(v.string()),
    slug: v.optional(v.string()),
    content: v.optional(v.string()),
    published: v.optional(v.boolean()),
  },
  handler: async (ctx, { storeId, id, ...args }) => {
    await requireStore(ctx, storeId);
    const page = ownedBy(await ctx.db.get(id), storeId, "Page");
    if (args.content !== undefined && args.content.length > MAX_CONTENT) throw new ConvexError("Contenu trop long.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim() || page.title;
    if (args.content !== undefined) patch.content = args.content;
    if (args.published !== undefined) patch.published = args.published;
    if (args.slug !== undefined && args.slug !== page.slug) {
      const slug = slugify(args.slug);
      if (!slug) throw new ConvexError("Adresse invalide.");
      const clash = await ctx.db
        .query("pages")
        .withIndex("by_store_slug", (q) => q.eq("storeId", storeId).eq("slug", slug))
        .unique();
      if (clash && clash._id !== id) throw new ConvexError("Une autre page utilise déjà cette adresse.");
      patch.slug = slug;
    }
    await ctx.db.patch(id, patch);
  },
});

/** Remet le modèle de départ (pages légales uniquement), avec les infos actuelles de la boutique. */
export const resetToTemplate = mutation({
  args: { storeId: v.id("stores"), id: v.id("pages") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const page = ownedBy(await ctx.db.get(id), storeId, "Page");
    if (page.kind === "custom") throw new ConvexError("Pas de modèle pour cette page.");
    const tpl = buildDefaultPage(page.kind as LegalKind, await templateCtx(ctx, storeId));
    await ctx.db.patch(id, { content: tpl.content, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { storeId: v.id("stores"), id: v.id("pages") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    ownedBy(await ctx.db.get(id), storeId, "Page");
    await ctx.db.delete(id);
  },
});
