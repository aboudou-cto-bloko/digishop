import { action, internalAction, internalMutation } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

// API Conversions Meta : complète le Pixel navigateur (bloqueurs de pub, iOS).
// Déduplication avec le Pixel grâce au même event_id des deux côtés.
const GRAPH_URL = "https://graph.facebook.com/v22.0";

export const purchaseEventId = (saleId: string) => `purchase_${saleId}`;

async function sha256(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined;
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function userData(sale: Doc<"sales">) {
  const [first, ...rest] = sale.customerName.trim().split(/\s+/);
  const [em, ph, fn, ln, country, external_id] = await Promise.all([
    sha256(sale.customerEmail),
    sha256(sale.customerPhone?.replace(/\D/g, "")),
    sha256(first),
    sha256(rest.join(" ") || undefined),
    sha256(sale.context.country),
    sha256(sale.customerId),
  ]);
  const out: Record<string, string> = {};
  const set = (k: string, val: string | undefined) => {
    if (val) out[k] = val;
  };
  set("em", em);
  set("ph", ph);
  set("fn", fn);
  set("ln", ln);
  set("country", country);
  set("external_id", external_id);
  set("client_ip_address", sale.context.ip);
  set("client_user_agent", sale.context.userAgent);
  set("fbp", sale.context.fbp);
  set("fbc", sale.context.fbc);
  return out;
}

export const claim = internalMutation({
  args: { eventId: v.string(), eventName: v.string(), saleId: v.optional(v.id("sales")), storeId: v.id("stores") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("metaEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .first();
    if (existing && existing.status === "sent") return false;
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("metaEvents", { ...args, status: "skipped" });
    return true;
  },
});

export const record = internalMutation({
  args: { eventId: v.string(), status: v.union(v.literal("sent"), v.literal("failed")), response: v.string() },
  handler: async (ctx, { eventId, status, response }) => {
    const row = await ctx.db
      .query("metaEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .first();
    if (row) await ctx.db.patch(row._id, { status, response: response.slice(0, 500) });
  },
});

async function send(
  ctx: ActionCtx,
  sale: Doc<"sales">,
  eventName: "Purchase" | "InitiateCheckout",
  eventId: string,
  eventTime: number,
) {
  // Pixel et jeton propres à la boutique de la vente
  const settings = await ctx.runQuery(internal.settings.internalSettings, { storeId: sale.storeId });
  if (!settings?.fbPixelId || !settings.fbAccessToken) return; // CAPI non configurée
  if (!(await ctx.runMutation(internal.meta.capi.claim, { eventId, eventName, saleId: sale._id, storeId: sale.storeId }))) return;

  const product = await ctx.runQuery(internal.products.internalGet, { id: sale.productId });
  const store = await ctx.runQuery(internal.stores.internalGet, { storeId: sale.storeId });
  const site = (store?.url ?? process.env.SITE_URL ?? "").replace(/\/$/, "");
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(eventTime / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url:
          eventName === "Purchase" ? `${site}/merci/${sale._id}` : `${site}/checkout/${product?.slug ?? ""}`,
        user_data: await userData(sale),
        custom_data: {
          currency: "XOF",
          value: sale.net,
          content_ids: [sale.productId],
          content_name: sale.productTitle,
          content_type: "product",
          num_items: 1,
          ...(eventName === "Purchase" ? { order_id: sale.number } : {}),
        },
      },
    ],
  };
  if (settings.fbTestEventCode) body.test_event_code = settings.fbTestEventCode;

  try {
    const res = await fetch(
      `${GRAPH_URL}/${settings.fbPixelId}/events?access_token=${encodeURIComponent(settings.fbAccessToken)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const text = await res.text();
    await ctx.runMutation(internal.meta.capi.record, { eventId, status: res.ok ? "sent" : "failed", response: text });
    if (!res.ok) console.error("[meta capi]", eventName, res.status, text.slice(0, 300));
  } catch (err) {
    await ctx.runMutation(internal.meta.capi.record, { eventId, status: "failed", response: String(err) });
  }
}

export const trackPurchase = internalAction({
  args: { saleId: v.id("sales") },
  handler: async (ctx, { saleId }) => {
    const sale = await ctx.runQuery(internal.sales.internalGet, { saleId });
    if (!sale || sale.status !== "paid") return;
    await send(ctx, sale, "Purchase", purchaseEventId(saleId), sale.paidAt ?? Date.now());
  },
});

export const trackInitiateCheckout = internalAction({
  args: { saleId: v.id("sales"), eventId: v.string() },
  handler: async (ctx, { saleId, eventId }) => {
    const sale = await ctx.runQuery(internal.sales.internalGet, { saleId });
    if (!sale) return;
    await send(ctx, sale, "InitiateCheckout", eventId.slice(0, 80), sale._creationTime);
  },
});

/**
 * Bouton « Tester la connexion » des réglages : lit le Pixel avec le jeton ENREGISTRÉ en base.
 * C'est la seule preuve fiable que le jeton est bien stocké ET accepté par Meta.
 */
export const testConnection = action({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }): Promise<{ ok: boolean; pixelName?: string; error?: string }> => {
    await ctx.runQuery(api.stores.get, { storeId }); // refuse si la boutique n'est pas à l'utilisateur connecté
    const settings = await ctx.runQuery(internal.settings.internalSettings, { storeId });
    if (!settings?.fbPixelId) return { ok: false, error: "Aucun ID Pixel enregistré." };
    if (!settings.fbAccessToken) return { ok: false, error: "Aucun jeton enregistré pour cette boutique." };
    try {
      const res = await fetch(`${GRAPH_URL}/${settings.fbPixelId}?fields=name&access_token=${encodeURIComponent(settings.fbAccessToken)}`);
      const body: unknown = await res.json().catch(() => null);
      const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      if (res.ok && typeof rec.name === "string") return { ok: true, pixelName: rec.name };
      const err = rec.error && typeof rec.error === "object" ? (rec.error as Record<string, unknown>) : {};
      return { ok: false, error: typeof err.message === "string" ? err.message : `Meta a répondu ${res.status}` };
    } catch (e) {
      throw new ConvexError(`Meta injoignable : ${e instanceof Error ? e.message : "erreur réseau"}`);
    }
  },
});
