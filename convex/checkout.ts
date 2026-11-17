import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { z } from "zod";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tryInitialize as tryMoneroo } from "./payments/moneroo";
import { tryInitialize as trySaspay } from "./payments/saspay";
import { thankYouUrl } from "./payments/shared";
import { isGatewayError } from "./routing";

/** Cameroun (CEMAC) : seul pays dont la devise de paiement est imposée (XAF). Partout ailleurs : XOF ou devise activée par le vendeur. */
const CAMEROON_PAYIN_COUNTRIES = new Set(["CM"]);

type PaySale = { saleId: Id<"sales">; storeId: Id<"stores">; baseUrl: string; amount: number; currency: string; accessKey: string; number: string; productTitle: string };

/**
 * Orchestrateur de paiement : essaie les prestataires dans l'ordre du routage (convex/routing.ts) et bascule au suivant
 * si l'un refuse ou ne répond pas. La vente n'est marquée « échec » que si TOUS ont échoué.
 */
async function initWithFallback(
  ctx: ActionCtx,
  sale: PaySale,
  customer: { name: string; email: string; phone?: string },
  opts: { country?: string; method?: string; exclude?: "moneroo" | "saspay" },
): Promise<string> {
  const order = await ctx.runQuery(internal.routing.plan, { country: opts.country, method: opts.method, exclude: opts.exclude });
  const reasons: string[] = [];
  for (const provider of order) {
    const r = provider === "saspay" ? await trySaspay(ctx, { ...sale, country: opts.country }, customer) : await tryMoneroo(ctx, { ...sale, country: opts.country }, customer, opts.method);
    if (r.ok) return r.url;
    reasons.push(r.reason);
    // Moyen refusé par le prestataire (« not enabled ») : on s'en souvient quelques heures, il n'est plus proposé ni ré-essayé
    if (r.notEnabled && opts.method) await ctx.runMutation(internal.routing.noteProbe, { provider, code: opts.method, enabled: false, reason: r.reason });
  }
  await ctx.runMutation(internal.sales.markFailed, { saleId: sale.saleId, reason: reasons.join(" | ").slice(0, 300) || "Aucun prestataire de paiement disponible" });
  throw new ConvexError("Impossible de lancer le paiement pour le moment. Réessaie dans un instant ou choisis un autre moyen de paiement.");
}

const contextV = v.object({
  country: v.optional(v.string()),
  lang: v.optional(v.string()),
  device: v.optional(v.string()),
  referrer: v.optional(v.string()),
  utmSource: v.optional(v.string()),
  utmCampaign: v.optional(v.string()),
  ip: v.optional(v.string()),
  userAgent: v.optional(v.string()),
  fbp: v.optional(v.string()),
  fbc: v.optional(v.string()),
  sessionKey: v.optional(v.string()),
});

const buyerSchema = z.object({
  name: z.string().trim().min(2, "Indique ton nom complet.").max(80),
  email: z.email("Adresse email invalide.").max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,18}$/, "Numéro WhatsApp invalide.")
    .optional(),
  couponCode: z.string().trim().max(30).optional(),
});

type StartResult = { redirectUrl: string; saleId: string };

export const start = action({
  args: {
    productId: v.id("products"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    withBump: v.optional(v.boolean()),
    currency: v.optional(v.string()),
    context: contextV,
    initiateEventId: v.optional(v.string()),
    method: v.optional(v.string()), // moyen choisi dans notre formulaire (code court, ex. mtn_bj)
    whatsappConsent: v.optional(v.boolean()), // case « J'accepte d'être contacté sur WhatsApp »
  },
  handler: async (ctx, args): Promise<StartResult> => {
    const parsed = buyerSchema.safeParse({
      name: args.name,
      email: args.email,
      phone: args.phone || undefined,
      couponCode: args.couponCode || undefined,
    });
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "Formulaire invalide.");
    const buyer = parsed.data;
    const country = args.context.country?.toUpperCase();
    const isCm = !!country && CAMEROON_PAYIN_COUNTRIES.has(country);
    // XAF uniquement pour le Cameroun : un acheteur d'un autre pays (Bénin, Côte d'Ivoire…) qui se retrouvait en XAF
    // était aiguillé vers le prestataire CEMAC ou refusé par Moneroo (aucun moyen XAF) → il paie en XOF.
    const currency = isCm ? "XAF" : args.currency === "XAF" ? undefined : args.currency;
    const method = args.method && /^[a-z0-9_]{2,40}$/.test(args.method) ? args.method : undefined;

    const sale = await ctx.runMutation(internal.sales.createPending, {
      productId: args.productId,
      name: buyer.name,
      email: buyer.email,
      phone: buyer.phone?.replace(/\s/g, ""),
      couponCode: buyer.couponCode,
      withBump: args.withBump,
      currency,
      requestedMethod: method,
      whatsappConsent: args.whatsappConsent,
      context: args.context,
    });

    if (args.initiateEventId) {
      await ctx.scheduler.runAfter(0, internal.meta.capi.trackInitiateCheckout, {
        saleId: sale.saleId,
        eventId: args.initiateEventId,
      });
    }

    // Produit offert (coupon 100 %) : pas de passage par Moneroo
    if (sale.net === 0) {
      await ctx.runMutation(internal.sales.markPaid, { saleId: sale.saleId, method: "Offert" });
      return { redirectUrl: thankYouUrl(sale.baseUrl, sale.saleId, sale.accessKey), saleId: sale.saleId };
    }

    const checkoutUrl = await initWithFallback(ctx, sale, buyer, { country, method });
    return { redirectUrl: checkoutUrl, saleId: sale.saleId };
  },
});

/** "Réessayer le paiement" depuis la page merci : même vente, nouvelle session chez le même prestataire. */
export const retry = action({
  args: { saleId: v.string(), key: v.string() },
  handler: async (ctx, { saleId, key }): Promise<StartResult> => {
    const sale = await ctx.runQuery(internal.payments.lookup.byIdAndKey, { saleId, key });
    if (!sale) throw new ConvexError("Commande introuvable.");
    const store = await ctx.runQuery(internal.stores.internalGet, { storeId: sale.storeId });
    if (!store || store.status !== "active") throw new ConvexError("Cette boutique est momentanément fermée.");
    if (sale.status === "paid") return { redirectUrl: thankYouUrl(store.url, sale._id, sale.accessKey), saleId };
    const product = await ctx.runQuery(internal.products.internalGet, { id: sale.productId });
    if (!product || product.status !== "published") throw new ConvexError("Ce produit n'est plus disponible.");
    // Échec dû à la passerelle (et pas à un refus de l'acheteur) : on réessaie chez l'AUTRE prestataire
    const exclude = isGatewayError(sale.failureReason) ? sale.provider : undefined;
    const checkoutUrl = await initWithFallback(
      ctx,
      {
        saleId: sale._id,
        storeId: sale.storeId,
        baseUrl: store.url,
        amount: sale.charged?.amount ?? sale.net,
        currency: sale.charged?.currency ?? "XOF",
        accessKey: sale.accessKey,
        number: sale.number,
        productTitle: sale.productTitle,
      },
      { name: sale.customerName, email: sale.customerEmail, phone: sale.customerPhone },
      { country: sale.context.country?.toUpperCase(), method: sale.requestedMethod, exclude },
    );
    return { redirectUrl: checkoutUrl, saleId };
  },
});

/** Petite query utilitaire pour la page checkout (produit + boutique). */
export const page = query({
  args: { storeId: v.id("stores"), slug: v.string() },
  handler: async (ctx, { storeId, slug }) => {
    const p = await ctx.db
      .query("products")
      .withIndex("by_store_slug", (q) => q.eq("storeId", storeId).eq("slug", slug))
      .unique();
    if (!p || p.status !== "published") return null;
    let bump = null;
    if (p.orderBump) {
      const bp = await ctx.db.get(p.orderBump.productId);
      if (bp && bp.status === "published" && bp.storeId === storeId) {
        bump = {
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
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      promo: p.promo ?? null,
      coverUrl: p.coverId ? await ctx.storage.getUrl(p.coverId) : null,
      fileCount: p.files.length,
      soldOut: p.stockLimit !== undefined && p.salesCount >= p.stockLimit,
      bump,
      countries: p.countries ?? [],
    };
  },
});
