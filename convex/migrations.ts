import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { TableNames } from "./_generated/dataModel";
import { slugify } from "./lib/utils";
import { v } from "convex/values";

// Tables propres à une boutique (cf. plan Lot 3)
export const STORE_TABLES = [
  "products",
  "customers",
  "sales",
  "coupons",
  "pageviews",
  "checkoutStarts",
  "emailLog",
  "metaEvents",
  "pages",
  "settings",
  "payouts",
] as const satisfies readonly TableNames[];

/**
 * Passage multi-boutiques : crée la boutique d'origine (à partir des réglages existants)
 * puis rattache tous les documents sans storeId. Idempotent : peut être relancé sans effet.
 */
export const assignDefaultStore = internalMutation({
  args: {},
  handler: async (ctx) => {
    let store = await ctx.db.query("stores").first();
    if (!store) {
      const s = await ctx.db.query("settings").first();
      const name = s?.storeName ?? "Ma boutique";
      const id = await ctx.db.insert("stores", { name, slug: slugify(name) || "boutique", status: "active", createdAt: Date.now() });
      store = (await ctx.db.get(id))!;
    }
    const report: Record<string, number> = {};
    for (const table of STORE_TABLES) {
      let n = 0;
      for (const doc of await ctx.db.query(table).collect()) {
        if (!("storeId" in doc) || !doc.storeId) {
          await ctx.db.patch(doc._id, { storeId: store._id } as never);
          n++;
        }
      }
      report[table] = n;
    }
    return { store: store.slug, migrated: report };
  },
});

/** Vérification : documents sans boutique, par table (doit être 0 partout). */
export const check = internalQuery({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, { total: number; missing: number }> = {};
    for (const table of STORE_TABLES) {
      const docs = await ctx.db.query(table).collect();
      out[table] = { total: docs.length, missing: docs.filter((d) => !("storeId" in d) || !d.storeId).length };
    }
    return out;
  },
});

/** Lot 4 : met en file la génération d'aperçu des PDF déjà en ligne. */
export const backfillPreviews = internalMutation({
  args: {},
  handler: async (ctx) => {
    let n = 0;
    for (const p of await ctx.db.query("products").collect()) {
      if (!p.files.some((f) => f.previewStatus === undefined)) continue;
      const files = p.files.map((f) =>
        f.previewStatus !== undefined ? f : { ...f, previewStatus: (f.mime === "application/pdf" || /\.pdf$/i.test(f.name)) && p.previewPages !== 0 ? ("pending" as const) : ("none" as const) },
      );
      await ctx.db.patch(p._id, { files });
      if (files.some((f) => f.previewStatus === "pending")) await ctx.scheduler.runAfter(0, internal.previews.generate, { productId: p._id });
      n++;
    }
    return n;
  },
});

/** Adresses produit / boutique contenant des caractères hors a-z0-9- (ex. police « gras » Unicode) : réécrites. */
export const fixSlugs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const bad = /[^a-z0-9-]/;
    const fixed: string[] = [];
    for (const p of await ctx.db.query("products").collect()) {
      if (!bad.test(p.slug)) continue;
      const root = slugify(p.title) || "produit";
      let slug = root;
      for (let i = 2; ; i++) {
        const hit = await ctx.db
          .query("products")
          .withIndex("by_store_slug", (q) => q.eq("storeId", p.storeId).eq("slug", slug))
          .first();
        if (!hit || hit._id === p._id) break;
        slug = `${root}-${i}`;
      }
      await ctx.db.patch(p._id, { slug });
      fixed.push(`${p.slug} → ${slug}`);
    }
    for (const st of await ctx.db.query("stores").collect()) {
      if (!bad.test(st.slug)) continue;
      const slug = slugify(st.name) || `boutique-${st._id.slice(-6)}`;
      await ctx.db.patch(st._id, { slug });
      fixed.push(`boutique ${st.slug} → ${slug}`);
    }
    return fixed;
  },
});

/**
 * Passage multi-propriétaires : rattache chaque boutique à un compte (par email) et assigne les
 * appareils push existants (sans propriétaire) au compte `pushEmail`. Idempotent. À lancer une fois :
 *   npx convex run migrations:assignOwners '{"owners":[{"slug":"x","email":"a@b.c"}],"pushEmail":"a@b.c"}' --prod
 */
export const assignOwners = internalMutation({
  args: {
    owners: v.array(v.object({ slug: v.string(), email: v.string() })),
    pushEmail: v.optional(v.string()),
  },
  handler: async (ctx, { owners, pushEmail }) => {
    const userByEmail = async (email: string) => {
      const e = email.trim().toLowerCase();
      const user = (await ctx.db.query("users").collect()).find((u) => u.email?.toLowerCase() === e);
      if (!user) throw new Error(`Compte introuvable : ${email}`);
      return user;
    };
    const report: string[] = [];
    // Tout est validé avant la première écriture : une erreur ne laisse pas de migration à moitié faite
    const plan = [];
    for (const o of owners) {
      const store = await ctx.db.query("stores").withIndex("by_slug", (q) => q.eq("slug", o.slug)).first();
      if (!store) throw new Error(`Boutique introuvable : ${o.slug}`);
      plan.push({ store, user: await userByEmail(o.email) });
    }
    const pushUser = pushEmail ? await userByEmail(pushEmail) : null;
    for (const { store, user } of plan) {
      await ctx.db.patch(store._id, { ownerId: user._id });
      report.push(`${store.slug} → ${user.email}`);
    }
    if (pushUser) {
      let n = 0;
      for (const sub of await ctx.db.query("pushSubscriptions").collect()) {
        if (!sub.userId) {
          await ctx.db.patch(sub._id, { userId: pushUser._id });
          n++;
        }
      }
      report.push(`${n} appareil(s) push → ${pushUser.email}`);
    }
    return report;
  },
});
