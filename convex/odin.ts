/**
 * Liaison OdiN (outil de vente automatique) : clés d'API, webhooks sortants signés, remboursements.
 *
 * - Clé d'API : `chw_…`, montrée une seule fois ; seul son hachage SHA-256 est stocké.
 * - Webhooks : POST JSON signé HMAC-SHA256 (`X-Chairow-Signature: sha256=<hex>` sur `<timestamp>.<corps>`),
 *   rejoué jusqu'à 6 fois avec attente croissante si l'adresse ne répond pas 2xx.
 * - Remboursement : l'argent est rendu par le vendeur (Mobile Money / Moneroo) ; Chairow note le remboursement,
 *   coupe l'accès aux fichiers, le retire des revenus et prévient OdiN.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin, requireStore } from "./lib/auth";
import { storeUrl } from "./lib/stores";

export const WEBHOOK_EVENTS = ["sale.paid", "sale.failed", "sale.abandoned", "sale.refunded"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function sha256Hex(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacHex(secret: string, value: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}

// ── Clés d'API (dashboard) ───────────────────────────────────────────────

export const listKeys = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireAdmin(ctx);
    const keys = await ctx.db.query("apiKeys").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({ _id: k._id, label: k.label, prefix: k.prefix, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt ?? null }));
  },
});

/** Crée une clé et la renvoie UNE seule fois (elle n'est plus lisible ensuite). */
export const createKey = action({
  args: { label: v.string() },
  handler: async (ctx, { label }): Promise<{ key: string }> => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new ConvexError("Non autorisé");
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const key = `chw_${b64url(bytes)}`;
    await ctx.runMutation(internal.odin.insertKey, {
      ownerId,
      label: label.trim().slice(0, 60) || "OdiN",
      hash: await sha256Hex(key),
      prefix: key.slice(0, 10),
    });
    return { key };
  },
});

export const insertKey = internalMutation({
  args: { ownerId: v.id("users"), label: v.string(), hash: v.string(), prefix: v.string() },
  handler: async (ctx, args) => {
    const active = (await ctx.db.query("apiKeys").withIndex("by_owner", (q) => q.eq("ownerId", args.ownerId)).collect()).filter((k) => !k.revokedAt);
    if (active.length >= 10) throw new ConvexError("10 clés actives maximum : révoque une ancienne clé.");
    await ctx.db.insert("apiKeys", { ...args, createdAt: Date.now() });
  },
});

export const revokeKey = mutation({
  args: { id: v.id("apiKeys") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireAdmin(ctx);
    const k = await ctx.db.get(id);
    if (!k || k.ownerId !== ownerId) throw new ConvexError("Clé introuvable.");
    await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

/** Utilisé par l'API HTTP : propriétaire de la clé, ou null. */
export const authenticate = internalMutation({
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const k = await ctx.db.query("apiKeys").withIndex("by_hash", (q) => q.eq("hash", hash)).unique();
    if (!k || k.revokedAt) return null;
    // Date de dernière utilisation, au plus une écriture par minute
    if (!k.lastUsedAt || Date.now() - k.lastUsedAt > 60_000) await ctx.db.patch(k._id, { lastUsedAt: Date.now() });
    return k.ownerId;
  },
});

// ── Webhooks (dashboard) ─────────────────────────────────────────────────

const MAX_WEBHOOKS = 5;

function makeSecret() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return `whsec_${b64url(b)}`;
}

async function ownWebhook(ctx: MutationCtx, ownerId: Id<"users">, id: Id<"webhooks">) {
  const w = await ctx.db.get(id);
  if (!w || w.ownerId !== ownerId) throw new ConvexError("Webhook introuvable.");
  return w;
}

/** Tous les webhooks du compte (OdiN, connexA…). Le secret est visible par le propriétaire pour le coller dans l'outil. */
export const listWebhooks = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireAdmin(ctx);
    const rows = await ctx.db.query("webhooks").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return rows.map((w) => ({
      _id: w._id,
      url: w.url,
      secret: w.secret,
      events: w.events,
      active: w.active,
      lastAt: w.lastAt ?? null,
      lastStatus: w.lastStatus ?? null,
    }));
  },
});

export const saveWebhook = mutation({
  args: { id: v.optional(v.id("webhooks")), url: v.string(), events: v.array(v.string()), active: v.boolean(), newSecret: v.optional(v.boolean()) },
  handler: async (ctx, { id, url, events, active, newSecret }) => {
    const ownerId = await requireAdmin(ctx);
    const clean = url.trim();
    let parsed: URL;
    try {
      parsed = new URL(clean);
    } catch {
      throw new ConvexError("Adresse du webhook invalide.");
    }
    if (parsed.protocol !== "https:") throw new ConvexError("Le webhook doit commencer par https://");
    const ev = events.filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e));
    if (!ev.length) throw new ConvexError("Choisis au moins un évènement.");
    if (id) {
      const w = await ownWebhook(ctx, ownerId, id);
      await ctx.db.patch(w._id, { url: clean, events: ev, active, failures: 0, ...(newSecret ? { secret: makeSecret() } : {}) });
      return w._id;
    }
    const count = (await ctx.db.query("webhooks").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect()).length;
    if (count >= MAX_WEBHOOKS) throw new ConvexError(`${MAX_WEBHOOKS} webhooks maximum.`);
    return await ctx.db.insert("webhooks", { ownerId, url: clean, events: ev, active, secret: makeSecret(), createdAt: Date.now() });
  },
});

export const removeWebhook = mutation({
  args: { id: v.id("webhooks") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireAdmin(ctx);
    await ownWebhook(ctx, ownerId, id);
    await ctx.db.delete(id);
  },
});

/** Bouton « Envoyer un test » : un faux évènement, pour vérifier que l'outil reçoit et valide la signature. */
export const testWebhook = mutation({
  args: { id: v.id("webhooks") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireAdmin(ctx);
    const w = await ownWebhook(ctx, ownerId, id);
    const body = JSON.stringify({ id: `test_${Date.now()}`, event: "test", created: Date.now(), data: { message: "Webhook Chairow OK" } });
    await ctx.scheduler.runAfter(0, internal.odin.deliver, { webhookId: w._id, event: "test", body, attempt: 1 });
  },
});

// ── Émission des évènements de vente ─────────────────────────────────────

export function salePayload(sale: Doc<"sales">, store: Doc<"stores"> | null) {
  return {
    id: sale._id,
    number: sale.number,
    status: sale.refund ? "refunded" : sale.status,
    store_id: sale.storeId,
    store_url: store ? storeUrl(store) : null,
    product_id: sale.productId,
    product_title: sale.productTitle,
    currency: "XOF",
    price: sale.price,
    discount: sale.discount,
    amount: sale.net,
    charged: sale.charged ?? null,
    fees: sale.fees ?? null,
    method: sale.method ?? null,
    failure_reason: sale.failureReason ?? null,
    customer: {
      name: sale.customerName,
      email: sale.customerEmail,
      phone: sale.customerPhone ?? null,
    },
    country: sale.context.country ?? null,
    // Pour l'API Conversions (connexA) : mêmes identifiants que le navigateur de l'acheteur
    fbp: sale.context.fbp ?? null,
    fbc: sale.context.fbc ?? null,
    ip: sale.context.ip ?? null,
    user_agent: sale.context.userAgent ?? null,
    // Même event_id que le pixel et l'API Conversions de Chairow : Meta dédoublonne
    purchase_event_id: `purchase_${sale._id}`,
    utm_source: sale.context.utmSource ?? null,
    utm_campaign: sale.context.utmCampaign ?? null,
    created_at: sale._creationTime,
    paid_at: sale.paidAt ?? null,
    refund: sale.refund ?? null,
    recovered: Boolean(sale.recoveredFromSaleId),
  };
}

/** À appeler après chaque changement d'état d'une vente : planifie l'envoi aux webhooks du propriétaire. */
export async function emitSaleEvent(ctx: MutationCtx, saleId: Id<"sales">, event: WebhookEvent) {
  const sale = await ctx.db.get(saleId);
  if (!sale) return;
  const store = await ctx.db.get(sale.storeId);
  if (!store?.ownerId) return;
  const ownerId = store.ownerId;
  const hooks = await ctx.db.query("webhooks").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
  const body = JSON.stringify({ id: `${event}_${sale._id}`, event, created: Date.now(), data: salePayload(sale, store) });
  for (const w of hooks) {
    if (!w.active || !w.events.includes(event)) continue;
    await ctx.scheduler.runAfter(0, internal.odin.deliver, { webhookId: w._id, event, body, attempt: 1 });
  }
}

const RETRY_MS = [0, 30_000, 2 * 60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export const webhookForDelivery = internalQuery({
  args: { webhookId: v.id("webhooks") },
  handler: async (ctx, { webhookId }) => await ctx.db.get(webhookId),
});

export const recordDelivery = internalMutation({
  args: { webhookId: v.id("webhooks"), ok: v.boolean(), status: v.string() },
  handler: async (ctx, { webhookId, ok, status }) => {
    const w = await ctx.db.get(webhookId);
    if (!w) return;
    await ctx.db.patch(webhookId, { lastAt: Date.now(), lastStatus: status.slice(0, 120), failures: ok ? 0 : (w.failures ?? 0) + 1 });
  },
});

export const deliver = internalAction({
  args: { webhookId: v.id("webhooks"), event: v.string(), body: v.string(), attempt: v.number() },
  handler: async (ctx, { webhookId, event, body, attempt }) => {
    const w = await ctx.runQuery(internal.odin.webhookForDelivery, { webhookId });
    if (!w || !w.active) return;
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = await hmacHex(w.secret, `${ts}.${body}`);
    let ok = false;
    let status = "";
    try {
      const res = await fetch(w.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Chairow-Webhooks/1",
          "X-Chairow-Event": event,
          "X-Chairow-Timestamp": ts,
          "X-Chairow-Signature": `sha256=${signature}`,
        },
        body,
      });
      ok = res.ok;
      status = `${res.status}${res.ok ? "" : ` (essai ${attempt})`}`;
    } catch (err) {
      status = `erreur réseau (essai ${attempt}) : ${String(err).slice(0, 60)}`;
    }
    await ctx.runMutation(internal.odin.recordDelivery, { webhookId, ok, status });
    if (!ok && attempt < RETRY_MS.length) {
      await ctx.scheduler.runAfter(RETRY_MS[attempt], internal.odin.deliver, { webhookId, event, body, attempt: attempt + 1 });
    }
  },
});

// ── Remboursement ────────────────────────────────────────────────────────

export async function applyRefund(ctx: MutationCtx, sale: Doc<"sales">, args: { amount?: number; reason?: string; by: string }) {
  if (sale.status !== "paid") throw new ConvexError("Seule une vente réglée peut être remboursée.");
  if (sale.refund) throw new ConvexError("Cette vente est déjà remboursée.");
  const amount = args.amount ?? sale.net;
  if (!Number.isFinite(amount) || amount <= 0 || amount > sale.net) throw new ConvexError("Montant du remboursement invalide.");
  await ctx.db.patch(sale._id, {
    refund: { at: Date.now(), amount: Math.round(amount), by: args.by, ...(args.reason?.trim() ? { reason: args.reason.trim().slice(0, 300) } : {}) },
    accessRevoked: true,
  });
  const customer = await ctx.db.get(sale.customerId);
  if (customer) await ctx.db.patch(customer._id, { totalSpent: Math.max(0, customer.totalSpent - Math.round(amount)) });
  await emitSaleEvent(ctx, sale._id, "sale.refunded");
}

export const refund = mutation({
  args: { storeId: v.id("stores"), saleId: v.id("sales"), amount: v.optional(v.number()), reason: v.optional(v.string()) },
  handler: async (ctx, { storeId, saleId, amount, reason }) => {
    await requireStore(ctx, storeId);
    const sale = await ctx.db.get(saleId);
    if (!sale || sale.storeId !== storeId) throw new ConvexError("Vente introuvable dans cette boutique.");
    await applyRefund(ctx, sale, { amount, reason, by: "dashboard" });
  },
});

// ── API HTTP (/api/v1/…) : opérations internes, toujours limitées aux boutiques du propriétaire de la clé ──

async function ownedStore(ctx: MutationCtx, ownerId: Id<"users">, storeId: string) {
  const id = ctx.db.normalizeId("stores", storeId);
  const store = id ? await ctx.db.get(id) : null;
  if (!store || store.ownerId !== ownerId) throw new ConvexError("Boutique introuvable.");
  return store;
}

async function ownedProduct(ctx: MutationCtx, ownerId: Id<"users">, productId: string) {
  const id = ctx.db.normalizeId("products", productId);
  const p = id ? await ctx.db.get(id) : null;
  const store = p ? await ctx.db.get(p.storeId) : null;
  if (!p || !store || store.ownerId !== ownerId) throw new ConvexError("Produit introuvable.");
  return { p, store };
}

function productOut(p: Doc<"products">, store: Doc<"stores">) {
  const base = storeUrl(store).replace(/\/$/, "");
  return {
    id: p._id,
    store_id: p.storeId,
    title: p.title,
    slug: p.slug,
    status: p.status,
    url: `${base}/p/${p.slug}`,
    checkout_url: `${base}/checkout/${p.slug}`,
    price: p.price,
    compare_at_price: p.compareAtPrice ?? null,
    sales_count: p.salesCount,
    files: p.files.map((f) => ({ name: f.name, size: f.size, mime: f.mime })),
    has_cover: Boolean(p.coverId),
    gallery_count: p.gallery?.length ?? 0,
    updated_at: p.updatedAt,
  };
}

export const apiMe = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx, { ownerId }) => {
    const stores = await ctx.db.query("stores").withIndex("by_owner", (q) => q.eq("ownerId", ownerId)).collect();
    return { stores: stores.map((s) => ({ id: s._id, name: s.name, slug: s.slug, status: s.status, url: storeUrl(s) })) };
  },
});

export const apiUploadUrl = internalMutation({
  args: { ownerId: v.id("users") },
  handler: async (ctx) => ({ upload_url: await ctx.storage.generateUploadUrl() }),
});

export const apiGetProduct = internalMutation({
  args: { ownerId: v.id("users"), productId: v.string() },
  handler: async (ctx, { ownerId, productId }) => {
    const { p, store } = await ownedProduct(ctx, ownerId, productId);
    return productOut(p, store);
  },
});

export const apiCreateProduct = internalMutation({
  args: { ownerId: v.id("users"), storeId: v.string(), title: v.string() },
  handler: async (ctx, { ownerId, storeId, title }) => {
    const store = await ownedStore(ctx, ownerId, storeId);
    const clean = title.trim().slice(0, 120) || "Nouveau produit";
    let slug = clean
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "produit";
    const root = slug;
    for (let i = 2; await ctx.db.query("products").withIndex("by_store_slug", (q) => q.eq("storeId", store._id).eq("slug", slug)).unique(); i++) slug = `${root}-${i}`;
    const id = await ctx.db.insert("products", {
      storeId: store._id,
      title: clean,
      slug,
      description: "",
      price: 0,
      status: "draft",
      files: [],
      salesCount: 0,
      updatedAt: Date.now(),
      source: "odin",
    });
    return { id, store_id: store._id };
  },
});

export const apiSetStatus = internalMutation({
  args: { ownerId: v.id("users"), productId: v.string(), status: v.union(v.literal("draft"), v.literal("published")) },
  handler: async (ctx, { ownerId, productId, status }) => {
    const { p, store } = await ownedProduct(ctx, ownerId, productId);
    if (status === "published") {
      if (p.price < 200) throw new ConvexError("Pour publier, mets un prix (200 F CFA minimum).");
      if (p.files.length === 0) throw new ConvexError("Pour publier, ajoute au moins un fichier à livrer.");
    }
    await ctx.db.patch(p._id, { status, updatedAt: Date.now() });
    // Premier produit publié : la boutique en pause s'ouvre (elle ne pouvait pas avant).
    const storeActivated = status === "published" && store.status === "paused";
    if (storeActivated) await ctx.db.patch(store._id, { status: "active" });
    const fresh = await ctx.db.get(p._id);
    return fresh ? { ...productOut(fresh, store), store_status: storeActivated ? "active" : store.status, store_activated: storeActivated } : null;
  },
});

export const apiSetStoreStatus = internalMutation({
  args: { ownerId: v.id("users"), storeId: v.string(), status: v.union(v.literal("active"), v.literal("paused")) },
  handler: async (ctx, { ownerId, storeId, status }) => {
    const store = await ownedStore(ctx, ownerId, storeId);
    if (status === "active") {
      const published = await ctx.db
        .query("products")
        .withIndex("by_store_status", (q) => q.eq("storeId", store._id).eq("status", "published"))
        .first();
      if (!published) throw new ConvexError("Publie au moins un produit avant d'ouvrir la boutique.");
    }
    await ctx.db.patch(store._id, { status });
    return { id: store._id, status, url: storeUrl(store) };
  },
});

export const apiListSales = internalMutation({
  args: { ownerId: v.id("users"), storeId: v.string(), since: v.optional(v.number()), status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { ownerId, storeId, since, status, limit }) => {
    const store = await ownedStore(ctx, ownerId, storeId);
    const n = Math.max(1, Math.min(500, Math.round(limit ?? 100)));
    const from = since ?? 0;
    const rows = await ctx.db
      .query("sales")
      .withIndex("by_store", (q) => q.eq("storeId", store._id).gte("_creationTime", from))
      .order("desc")
      .take(n * 3);
    return rows
      .filter((s) => !status || (status === "refunded" ? Boolean(s.refund) : s.status === status))
      .slice(0, n)
      .map((s) => salePayload(s, store));
  },
});

export const apiRefund = internalMutation({
  args: { ownerId: v.id("users"), saleId: v.string(), amount: v.optional(v.number()), reason: v.optional(v.string()) },
  handler: async (ctx, { ownerId, saleId, amount, reason }) => {
    const id = ctx.db.normalizeId("sales", saleId);
    const sale = id ? await ctx.db.get(id) : null;
    const store = sale ? await ctx.db.get(sale.storeId) : null;
    if (!sale || !store || store.ownerId !== ownerId) throw new ConvexError("Vente introuvable.");
    await applyRefund(ctx, sale, { amount, reason, by: "api" });
    const fresh = await ctx.db.get(sale._id);
    return fresh ? salePayload(fresh, store) : null;
  },
});
