import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { saleStatus } from "./schema";
import { ownedBy, requireStore } from "./lib/auth";
import { loadSettings } from "./settings";
import { storeUrl } from "./lib/stores";
import { normalizeEmail, saleNumber } from "./lib/utils";
import { computeDiscount, resolveCoupon } from "./coupons";
import { effectivePrice } from "./lib/pricing";
import { convertFromXof } from "./lib/fx";
import { attributeRecovery } from "./recovery";
import { pushSaleLost, pushSalePaid } from "./push";
import { trackPurchase } from "./tracking";
import { emitSaleEvent } from "./odin";

function randomKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
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

// ── Cycle de vie d'une vente (appelé par checkout.ts / payments) ─────────

export const createPending = internalMutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    couponCode: v.optional(v.string()),
    withBump: v.optional(v.boolean()),
    currency: v.optional(v.string()),
    requestedMethod: v.optional(v.string()),
    whatsappConsent: v.optional(v.boolean()),
    context: contextV,
  },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.productId);
    if (!product || product.status !== "published") {
      throw new ConvexError("Ce produit n'est plus disponible.");
    }
    // La boutique vient TOUJOURS du produit, jamais du navigateur
    const storeId = product.storeId;
    const store = await ctx.db.get(storeId);
    if (!store || store.status !== "active") throw new ConvexError("Cette boutique est momentanément fermée.");
    if (product.stockLimit !== undefined && product.salesCount >= product.stockLimit) {
      throw new ConvexError("Épuisé : tous les exemplaires de ce produit ont été vendus.");
    }
    const settings = await loadSettings(ctx, storeId);

    // Pays couverts : ceux du produit, sinon ceux de la boutique ([] = partout)
    const coverage = product.countries?.length ? product.countries : (settings?.countries ?? []);
    const country = args.context.country?.toUpperCase();
    if (coverage.length && country && !coverage.includes(country)) {
      throw new ConvexError("Ce produit n'est pas encore disponible dans ton pays.");
    }

    // Le prix est toujours recalculé ici (promo programmée comprise), jamais repris du navigateur
    const { price: basePrice, promo } = effectivePrice(product, Date.now());
    let discount = 0;
    let coupon: Doc<"coupons"> | undefined;
    if (args.couponCode?.trim()) {
      const r = await resolveCoupon(ctx, storeId, args.couponCode, product._id);
      if (!r.ok) throw new ConvexError(r.error);
      coupon = r.coupon;
      discount = computeDiscount(coupon, basePrice);
    }

    // Offre complémentaire : prix fixé par le vendeur, hors code promo
    let bump: Doc<"sales">["bump"];
    if (args.withBump && product.orderBump) {
      const bp = await ctx.db.get(product.orderBump.productId);
      if (bp && bp.status === "published" && bp.storeId === storeId) bump = { productId: bp._id, title: bp.title, price: product.orderBump.price };
    }
    const net = basePrice - discount + (bump?.price ?? 0);
    if (net > 0 && net < 200) {
      throw new ConvexError("Le montant après réduction doit être d'au moins 200 F CFA.");
    }

    // Devise de paiement : uniquement une devise activée par le vendeur, convertie avec le taux du jour
    let charged: Doc<"sales">["charged"];
    const wanted = args.currency?.toUpperCase();
    if (wanted && wanted !== "XOF" && net > 0) {
      // XAF au Cameroun : imposé par le prestataire CEMAC, indépendant des devises optionnelles du vendeur
      const accepted = (settings?.currencies ?? []).includes(wanted) || (wanted === "XAF" && country === "CM");
      const fx = await ctx.db.query("fxRates").first();
      const conv = accepted && fx ? convertFromXof(net, wanted, fx.rates) : null;
      if (conv) charged = { currency: wanted, amount: conv.amount, rate: conv.rate };
    }

    const email = normalizeEmail(args.email);
    const name = args.name.trim();
    let customer = await ctx.db
      .query("customers")
      .withIndex("by_store_email", (q) => q.eq("storeId", storeId).eq("email", email))
      .unique();
    if (!customer) {
      const id = await ctx.db.insert("customers", {
        storeId,
        email,
        name,
        phone: args.phone,
        country: args.context.country,
        totalSpent: 0,
        salesCount: 0,
      });
      customer = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(customer._id, { name, phone: args.phone ?? customer.phone });
    }

    const saleId = await ctx.db.insert("sales", {
      storeId,
      number: saleNumber(),
      productId: product._id,
      customerId: customer._id,
      productTitle: product.title,
      customerName: name,
      customerEmail: email,
      customerPhone: args.phone,
      whatsappConsent: args.phone ? args.whatsappConsent ?? false : undefined,
      price: basePrice,
      discount,
      net,
      bump,
      charged,
      requestedMethod: args.requestedMethod,
      promoApplied: promo ? true : undefined,
      couponId: coupon?._id,
      couponCode: coupon?.code,
      status: "pending",
      accessKey: randomKey(),
      accessRevoked: false,
      downloads: 0,
      context: args.context,
    });
    const sale = (await ctx.db.get(saleId))!;
    return {
      saleId,
      storeId,
      baseUrl: storeUrl(store),
      net,
      amount: charged?.amount ?? net,
      currency: charged?.currency ?? "XOF",
      accessKey: sale.accessKey,
      number: sale.number,
      productTitle: product.title,
    };
  },
});

export const attachPayment = internalMutation({
  args: { saleId: v.id("sales"), paymentId: v.string() },
  handler: async (ctx, { saleId, paymentId }) => {
    await ctx.db.patch(saleId, { monerooPaymentId: paymentId, provider: "moneroo", status: "pending", failureReason: undefined });
  },
});

/** Idem attachPayment, pour le prestataire CEMAC (Cameroun) : la session de checkout créée à l'initialisation. */
export const attachSaspaySession = internalMutation({
  args: { saleId: v.id("sales"), sessionId: v.string() },
  handler: async (ctx, { saleId, sessionId }) => {
    await ctx.db.patch(saleId, { saspaySessionId: sessionId, provider: "saspay", status: "pending", failureReason: undefined });
  },
});

/**
 * Connue seulement une fois le paiement tenté sur la page hébergée (pas à la création de la
 * session) : relie le futur webhook de transaction à cette vente. Idempotent.
 */
export const attachSaspayTransaction = internalMutation({
  args: { saleId: v.id("sales"), transactionId: v.string() },
  handler: async (ctx, { saleId, transactionId }) => {
    const sale = await ctx.db.get(saleId);
    if (sale && sale.saspayTransactionId !== transactionId) {
      await ctx.db.patch(saleId, { saspayTransactionId: transactionId });
    }
  },
});

/** Id de paiement courant chez le prestataire actif de la vente (guard anti-vieux-paiement). */
function currentProviderPaymentId(sale: Doc<"sales">): string | undefined {
  return sale.provider === "saspay" ? sale.saspayTransactionId ?? sale.saspaySessionId : sale.monerooPaymentId;
}

/**
 * Passe une vente en "paid". IDEMPOTENT : appelé par le webhook ET la page de retour,
 * seul le premier appel incrémente les compteurs et déclenche emails + CAPI.
 */
export async function applyPaid(
  ctx: MutationCtx,
  sale: Doc<"sales">,
  info: { method?: string; methodCode?: string; fees?: number },
) {
  if (sale.status === "paid") return false;
  const now = Date.now();
  await ctx.db.patch(sale._id, {
    status: "paid",
    paidAt: now,
    method: info.method ?? sale.method,
    methodCode: info.methodCode ?? sale.methodCode,
    // Frais Moneroo dans la devise facturée → ramenés en XOF pour les revenus
    fees: info.fees !== undefined ? Math.round(sale.charged ? info.fees / sale.charged.rate : info.fees) : sale.fees,
    failureReason: undefined,
  });

  const product = await ctx.db.get(sale.productId);
  if (product) await ctx.db.patch(product._id, { salesCount: product.salesCount + 1 });
  if (sale.bump) {
    const bp = await ctx.db.get(sale.bump.productId);
    if (bp) await ctx.db.patch(bp._id, { salesCount: bp.salesCount + 1 });
  }

  const customer = await ctx.db.get(sale.customerId);
  if (customer) {
    await ctx.db.patch(customer._id, {
      totalSpent: customer.totalSpent + sale.net,
      salesCount: customer.salesCount + 1,
      lastPurchaseAt: now,
    });
  }
  if (sale.couponId) {
    const c = await ctx.db.get(sale.couponId);
    if (c) await ctx.db.patch(c._id, { uses: c.uses + 1 });
  }

  const fresh = await ctx.db.get(sale._id);
  if (fresh) await attributeRecovery(ctx, fresh);
  const final = await ctx.db.get(sale._id);
  if (final) {
    await pushSalePaid(ctx, final);
    await trackPurchase(ctx, final);
  }

  await ctx.scheduler.runAfter(0, internal.email.send.queue, { saleId: sale._id, template: "purchase" });
  await ctx.scheduler.runAfter(0, internal.email.send.queue, { saleId: sale._id, template: "seller_sale" });
  await ctx.scheduler.runAfter(0, internal.meta.capi.trackPurchase, { saleId: sale._id });
  await emitSaleEvent(ctx, sale._id, "sale.paid");
  return true;
}

export const markPaid = internalMutation({
  args: {
    saleId: v.id("sales"),
    paymentId: v.optional(v.string()),
    amount: v.optional(v.number()),
    currency: v.optional(v.string()),
    method: v.optional(v.string()),
    methodCode: v.optional(v.string()),
    fees: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sale = await ctx.db.get(args.saleId);
    if (!sale) return { applied: false };
    // Un ancien paiement (avant un "Réessayer") ne doit pas valider la vente
    const currentId = currentProviderPaymentId(sale);
    if (args.paymentId && currentId && args.paymentId !== currentId) {
      return { applied: false };
    }
    const expected = sale.charged ?? { amount: sale.net, currency: "XOF" };
    if (args.currency && args.currency.toUpperCase() !== expected.currency) {
      await ctx.db.patch(sale._id, { failureReason: `Devise reçue (${args.currency}) différente de la devise attendue (${expected.currency})` });
      return { applied: false };
    }
    if (args.amount !== undefined && args.amount + 1e-9 < expected.amount) {
      await ctx.db.patch(sale._id, { failureReason: `Montant reçu (${args.amount} ${expected.currency}) inférieur au prix (${expected.amount} ${expected.currency})` });
      return { applied: false };
    }
    return { applied: await applyPaid(ctx, sale, args) };
  },
});

export const markFailed = internalMutation({
  args: {
    saleId: v.id("sales"),
    paymentId: v.optional(v.string()),
    reason: v.string(),
    method: v.optional(v.string()),
  },
  handler: async (ctx, { saleId, paymentId, reason, method }) => {
    const sale = await ctx.db.get(saleId);
    if (!sale || sale.status === "paid") return;
    const currentId = currentProviderPaymentId(sale);
    if (paymentId && currentId && paymentId !== currentId) return;
    await ctx.db.patch(saleId, { status: "failed", failureReason: reason, method: method ?? sale.method });
    if (sale.status !== "failed") {
      await pushSaleLost(ctx, sale, "failed");
      await emitSaleEvent(ctx, saleId, "sale.failed");
    }
  },
});

/** Cron : une vente restée "pending" plus d'une heure est abandonnée (comme sur Chariow). */
export const abandonStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    // Seulement les ventes en attente depuis plus d'une heure (plage d'index), par lots
    const stale = await ctx.db
      .query("sales")
      .withIndex("by_status", (q) => q.eq("status", "pending").lt("_creationTime", cutoff))
      .take(100);
    for (const s of stale) {
      // Dernière vérification chez le prestataire avant d'abandonner : un webhook a pu se perdre
      if (s.provider === "saspay" && s.saspaySessionId) {
        await ctx.scheduler.runAfter(0, internal.payments.saspay.verifyInternal, { saleId: s._id, abandonIfPending: true });
      } else if (s.monerooPaymentId) {
        await ctx.scheduler.runAfter(0, internal.payments.moneroo.verifyInternal, { saleId: s._id, abandonIfPending: true });
      } else {
        await ctx.db.patch(s._id, { status: "abandoned" });
        await pushSaleLost(ctx, s, "abandoned");
        await emitSaleEvent(ctx, s._id, "sale.abandoned");
      }
    }
  },
});

export const markAbandonedIfPending = internalMutation({
  args: { saleId: v.id("sales") },
  handler: async (ctx, { saleId }) => {
    const s = await ctx.db.get(saleId);
    if (s?.status !== "pending") return;
    await ctx.db.patch(saleId, { status: "abandoned" });
    await pushSaleLost(ctx, s, "abandoned");
    await emitSaleEvent(ctx, saleId, "sale.abandoned");
  },
});

export const internalGet = internalQuery({
  args: { saleId: v.id("sales") },
  handler: async (ctx, { saleId }) => await ctx.db.get(saleId),
});

export const internalByPayment = internalQuery({
  args: { paymentId: v.string() },
  handler: async (ctx, { paymentId }) =>
    await ctx.db
      .query("sales")
      .withIndex("by_payment", (q) => q.eq("monerooPaymentId", paymentId))
      .first(),
});

export const internalBySaspayTransaction = internalQuery({
  args: { transactionId: v.string() },
  handler: async (ctx, { transactionId }) =>
    await ctx.db
      .query("sales")
      .withIndex("by_saspay_transaction", (q) => q.eq("saspayTransactionId", transactionId))
      .first(),
});

export const countDownload = internalMutation({
  args: { saleId: v.id("sales") },
  handler: async (ctx, { saleId }) => {
    const s = await ctx.db.get(saleId);
    if (s) await ctx.db.patch(saleId, { downloads: s.downloads + 1 });
  },
});

// ── Page "merci" (publique, protégée par accessKey) ─────────────────────

export const forThankYou = query({
  args: { saleId: v.string(), key: v.string() },
  handler: async (ctx, { saleId, key }) => {
    const id = ctx.db.normalizeId("sales", saleId);
    if (!id) return null;
    const sale = await ctx.db.get(id);
    if (!sale || sale.accessKey !== key) return null;
    const product = await ctx.db.get(sale.productId);
    const coverUrl = product?.coverId ? await ctx.storage.getUrl(product.coverId) : null;
    const canDownload = sale.status === "paid" && !sale.accessRevoked;
    return {
      _id: sale._id,
      number: sale.number,
      status: sale.status,
      accessRevoked: sale.accessRevoked,
      productTitle: sale.productTitle,
      productSlug: product?.slug,
      productId: sale.productId,
      coverUrl,
      price: sale.price,
      discount: sale.discount,
      net: sale.net,
      customerName: sale.customerName,
      customerEmail: sale.customerEmail,
      customerPhone: sale.customerPhone,
      provider: sale.provider,
      charged: sale.charged,
      failureReason: sale.failureReason,
      bumpTitle: sale.bump?.title,
      files: canDownload ? (await deliverableFiles(ctx, sale)).map((f) => ({ index: f.index, name: f.name, size: f.size, mime: f.mime })) : [],
    };
  },
});

/** Fichiers livrés : produit principal (index "0", "1"…) + offre complémentaire ("b0", "b1"…). */
export async function deliverableFiles(ctx: QueryCtx, sale: Doc<"sales">) {
  const product = await ctx.db.get(sale.productId);
  const out = (product?.files ?? []).map((f, i) => ({ index: String(i), name: f.name, size: f.size, mime: f.mime, storageId: f.storageId }));
  if (sale.bump) {
    const bp = await ctx.db.get(sale.bump.productId);
    for (const [i, f] of (bp?.files ?? []).entries()) out.push({ index: `b${i}`, name: f.name, size: f.size, mime: f.mime, storageId: f.storageId });
  }
  return out;
}

// ── Dashboard ───────────────────────────────────────────────────────────

async function coverFor(ctx: QueryCtx, productId: Id<"products">) {
  const p = await ctx.db.get(productId);
  return p?.coverId ? await ctx.storage.getUrl(p.coverId) : null;
}

export const list = query({
  args: {
    storeId: v.id("stores"),
    status: v.optional(saleStatus),
    search: v.optional(v.string()),
    country: v.optional(v.string()),
    currency: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { storeId, status, search, country, currency, limit }) => {
    await requireStore(ctx, storeId);
    const filtering = Boolean(search?.trim() || country || currency);
    // Sans statut : index by_store (trié par date) ; avec statut : by_store_status (date à statut égal)
    const take = filtering ? 3000 : (limit ?? 200);
    let rows = status
      ? await ctx.db
          .query("sales")
          .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", status))
          .order("desc")
          .take(take)
      : await ctx.db
          .query("sales")
          .withIndex("by_store", (q) => q.eq("storeId", storeId))
          .order("desc")
          .take(take);
    if (country) rows = rows.filter((r) => (r.context.country ?? "") === country);
    if (currency) rows = rows.filter((r) => (r.charged?.currency ?? "XOF") === currency);
    if (!search?.trim()) rows = rows.slice(0, limit ?? 200);
    if (search?.trim()) {
      const s = search.trim().toLowerCase();
      rows = rows
        .filter(
          (r) =>
            r.productTitle.toLowerCase().includes(s) ||
            r.customerName.toLowerCase().includes(s) ||
            r.customerEmail.includes(s) ||
            r.number.toLowerCase().includes(s) ||
            (r.customerPhone ?? "").includes(s),
        )
        .slice(0, limit ?? 200);
    }
    const covers = new Map<string, string | null>();
    return Promise.all(
      rows.map(async (r) => {
        if (!covers.has(r.productId)) covers.set(r.productId, await coverFor(ctx, r.productId));
        return {
          _id: r._id,
          _creationTime: r._creationTime,
          number: r.number,
          productTitle: r.productTitle,
          customerName: r.customerName,
          customerEmail: r.customerEmail,
          net: r.net,
          charged: r.charged,
          country: r.context.country,
          status: r.status,
          coverUrl: covers.get(r.productId) ?? null,
        };
      }),
    );
  },
});

/** Valeurs disponibles pour les filtres Pays / Devise de la liste des ventes. */
export const filterOptions = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    // Options des filtres : calculées sur les 5 000 ventes les plus récentes (borne de lecture Convex)
    const rows = await ctx.db
      .query("sales")
      .withIndex("by_store", (q) => q.eq("storeId", storeId))
      .order("desc")
      .take(5000);
    const countries = new Map<string, number>();
    const currencies = new Map<string, number>();
    for (const r of rows) {
      if (r.context.country) countries.set(r.context.country, (countries.get(r.context.country) ?? 0) + 1);
      const c = r.charged?.currency ?? "XOF";
      currencies.set(c, (currencies.get(c) ?? 0) + 1);
    }
    const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
    return { countries: sorted(countries), currencies: sorted(currencies) };
  },
});

export const detail = query({
  args: { storeId: v.id("stores"), id: v.id("sales") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const sale = await ctx.db.get(id);
    if (!sale || sale.storeId !== storeId) return null;
    const emails = await ctx.db
      .query("emailLog")
      .withIndex("by_sale", (q) => q.eq("saleId", id))
      .collect();
    return {
      ...sale,
      coverUrl: await coverFor(ctx, sale.productId),
      emails: emails.map((e) => ({
        _id: e._id,
        template: e.template,
        status: e.status,
        provider: e.provider,
        attempts: e.attempts,
        lastError: e.lastError,
        at: e._creationTime,
      })),
    };
  },
});

export const setAccess = mutation({
  args: { storeId: v.id("stores"), id: v.id("sales"), revoked: v.boolean() },
  handler: async (ctx, { storeId, id, revoked }) => {
    await requireStore(ctx, storeId);
    ownedBy(await ctx.db.get(id), storeId, "Vente");
    await ctx.db.patch(id, { accessRevoked: revoked });
  },
});

export const resendPurchaseEmail = mutation({
  args: { storeId: v.id("stores"), id: v.id("sales") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    const sale = ownedBy(await ctx.db.get(id), storeId, "Vente");
    if (sale.status !== "paid") throw new ConvexError("Seule une vente réglée peut être renvoyée.");
    if (sale.accessRevoked) throw new ConvexError("L'accès est révoqué : rétablis-le avant de renvoyer l'email.");
    await ctx.scheduler.runAfter(0, internal.email.send.queue, { saleId: id, template: "purchase" });
  },
});

/** Bouton "Vérifier chez Moneroo" dans le détail d'une vente en attente. */
export const recheck = mutation({
  args: { storeId: v.id("stores"), id: v.id("sales") },
  handler: async (ctx, { storeId, id }) => {
    await requireStore(ctx, storeId);
    ownedBy(await ctx.db.get(id), storeId, "Vente");
    await ctx.scheduler.runAfter(0, internal.payments.moneroo.verifyInternal, { saleId: id });
  },
});

/**
 * Numéro WhatsApp demandé APRÈS l'achat (facultatif au paiement) : rattaché à la vente et au client.
 * Protégé par la clé d'accès de la vente, comme la page « merci ».
 */
export const addPhone = mutation({
  args: { saleId: v.string(), key: v.string(), phone: v.string() },
  handler: async (ctx, { saleId, key, phone }) => {
    const id = ctx.db.normalizeId("sales", saleId);
    const sale = id ? await ctx.db.get(id) : null;
    if (!sale || sale.accessKey !== key || sale.status !== "paid") throw new ConvexError("Commande introuvable.");
    const parsed = parsePhoneNumberFromString(phone.trim().startsWith("+") ? phone.trim() : `+${phone.replace(/\D/g, "")}`);
    if (!parsed || !parsed.isValid()) throw new ConvexError("Numéro WhatsApp invalide : vérifie l'indicatif du pays (ex. +229…).");
    const e164 = parsed.number as string;
    await ctx.db.patch(sale._id, { customerPhone: e164 });
    const customer = await ctx.db.get(sale.customerId);
    if (customer) await ctx.db.patch(customer._id, { phone: e164 });
    return { phone: e164 };
  },
});
