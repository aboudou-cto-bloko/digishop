import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./lib/auth";

import { pushEventV as eventV } from "./lib/validators";
export type PushEvent = "sale" | "recovered" | "failed" | "payout";
const ALL_EVENTS: PushEvent[] = ["sale", "recovered", "failed", "payout"];

/** Clé publique VAPID (pas un secret) : le navigateur en a besoin pour s'abonner. */
export const config = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return { publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  },
});

export const mySubscriptions = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAdmin(ctx);
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_user", (q) => q.eq("userId", userId)).collect();
    return rows.map((r) => ({ _id: r._id, endpoint: r.endpoint, device: r.device, events: r.events, createdAt: r.createdAt, lastSuccessAt: r.lastSuccessAt }));
  },
});

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string(), device: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAdmin(ctx);
    if (!/^https:\/\//.test(args.endpoint)) throw new ConvexError("Abonnement invalide.");
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) {
      // L'appareil suit le compte actuellement connecté (un même navigateur peut changer de compte)
      await ctx.db.patch(existing._id, { p256dh: args.p256dh, auth: args.auth, device: args.device.slice(0, 80), userId });
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", { ...args, device: args.device.slice(0, 80), events: ALL_EVENTS, createdAt: Date.now(), userId });
  },
});

export const unsubscribe = mutation({
  args: { id: v.optional(v.id("pushSubscriptions")), endpoint: v.optional(v.string()) },
  handler: async (ctx, { id, endpoint }) => {
    const userId = await requireAdmin(ctx);
    const row = id
      ? await ctx.db.get(id)
      : endpoint
        ? await ctx.db
            .query("pushSubscriptions")
            .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
            .first()
        : null;
    if (row && row.userId === userId) await ctx.db.delete(row._id);
  },
});

export const setEvents = mutation({
  args: { id: v.id("pushSubscriptions"), events: v.array(eventV) },
  handler: async (ctx, { id, events }) => {
    const userId = await requireAdmin(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new ConvexError("Appareil introuvable.");
    await ctx.db.patch(id, { events: [...new Set(events)] });
  },
});

// ── Envoi (appelé depuis les mutations de vente / retrait) ────────────────

export const targets = internalQuery({
  args: { event: v.optional(eventV), id: v.optional(v.id("pushSubscriptions")), storeId: v.optional(v.id("stores")), userId: v.optional(v.id("users")) },
  handler: async (ctx, { event, id, storeId, userId }) => {
    if (id) {
      const r = await ctx.db.get(id);
      // Test : seulement un appareil du compte qui le demande
      return r && (!userId || r.userId === userId) ? [r] : [];
    }
    if (userId && !storeId) return (await ctx.db.query("pushSubscriptions").withIndex("by_user", (q) => q.eq("userId", userId)).collect());
    // Notification de boutique : uniquement les appareils du propriétaire (jamais ceux d'un autre locataire)
    const ownerId = storeId ? (await ctx.db.get(storeId))?.ownerId : undefined;
    if (!ownerId) return [];
    const rows = await ctx.db.query("pushSubscriptions").withIndex("by_user", (q) => q.eq("userId", ownerId)).collect();
    return rows.filter((r) => !event || r.events.includes(event));
  },
});

export const report = internalMutation({
  args: { ok: v.array(v.id("pushSubscriptions")), gone: v.array(v.id("pushSubscriptions")) },
  handler: async (ctx, { ok, gone }) => {
    const now = Date.now();
    for (const id of ok) if (await ctx.db.get(id)) await ctx.db.patch(id, { lastSuccessAt: now });
    // Abonnement expiré (404/410) : l'appareil s'est désabonné, on le retire
    for (const id of gone) if (await ctx.db.get(id)) await ctx.db.delete(id);
  },
});

const fmt = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} F`;

async function storeOf(ctx: MutationCtx, sale: Doc<"sales">) {
  const store = await ctx.db.get(sale.storeId);
  return { name: store?.name ?? "Boutique", slug: store?.slug ?? "" };
}

/** Notification d'une vente payée (ou récupérée par relance). */
export async function pushSalePaid(ctx: MutationCtx, sale: Doc<"sales">) {
  const store = await storeOf(ctx, sale);
  const recovered = Boolean(sale.recoveredFromSaleId);
  await ctx.scheduler.runAfter(0, internal.pushNode.notify, {
    storeId: sale.storeId,
    event: recovered ? "recovered" : "sale",
    title: recovered ? `♻️ Vente récupérée · +${fmt(sale.net)}` : sale.net > 0 ? `💰 Nouvelle vente · +${fmt(sale.net)}` : "🎁 Nouvelle commande offerte",
    body: `${sale.productTitle}${sale.bump ? " + offre complémentaire" : ""} · ${sale.customerName} · ${store.name}`,
    url: `/admin/ventes?boutique=${store.slug}&vente=${sale._id}`,
    tag: `sale-${sale._id}`,
  });
}

/** Notification d'un paiement échoué ou abandonné (à relancer). */
export async function pushSaleLost(ctx: MutationCtx, sale: Doc<"sales">, kind: "failed" | "abandoned") {
  const store = await storeOf(ctx, sale);
  await ctx.scheduler.runAfter(0, internal.pushNode.notify, {
    storeId: sale.storeId,
    event: "failed",
    title: kind === "failed" ? `⚠️ Paiement échoué · ${fmt(sale.net)}` : `🛒 Panier abandonné · ${fmt(sale.net)}`,
    body: `${sale.productTitle} · ${sale.customerName}${sale.customerPhone ? " · relance-le sur WhatsApp" : ""} · ${store.name}`,
    url: `/admin/ventes?boutique=${store.slug}&vente=${sale._id}`,
    tag: `sale-${sale._id}`,
  });
}

/** Notification d'un retrait terminé. */
export async function pushPayout(ctx: MutationCtx, row: Doc<"payouts">, status: "success" | "failed") {
  const store = await ctx.db.get(row.storeId);
  await ctx.scheduler.runAfter(0, internal.pushNode.notify, {
    storeId: row.storeId,
    event: "payout",
    title: status === "success" ? `✅ Retrait envoyé · ${row.amount} ${row.currency ?? "XOF"}` : `❌ Retrait échoué · ${row.amount} ${row.currency ?? "XOF"}`,
    body: `${store?.name ?? "Boutique"}${status === "failed" && row.failureReason ? ` · ${row.failureReason}` : ""}`,
    url: `/admin/revenus?boutique=${store?.slug ?? ""}`,
    tag: `payout-${row._id}`,
  });
}
