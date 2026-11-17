import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { ownedBy, requireStore } from "./lib/auth";
import { ensureSettings, loadSettings } from "./settings";
import { recoveryV } from "./lib/validators";

// ── Configuration (entièrement réglable par le vendeur) ─────────────────

export type RecoveryConfig = NonNullable<Doc<"settings">["recovery"]>;
type Step = RecoveryConfig["steps"][number];

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 } as const;
export const stepDelayMs = (s: Pick<Step, "delay" | "unit">) => s.delay * UNIT_MS[s.unit];

export const DEFAULT_RECOVERY: RecoveryConfig = {
  enabled: false,
  maxAgeDays: 7,
  steps: [
    {
      id: "s1",
      enabled: true,
      delay: 1,
      unit: "hours",
      subject: "{prénom}, ton guide t'attend",
      message: "Tu étais à deux doigts de recevoir « {produit} ». Ton panier est toujours là : il te suffit de finaliser le paiement, ça prend une minute.",
      promo: { kind: "none" },
    },
    {
      id: "s2",
      enabled: true,
      delay: 24,
      unit: "hours",
      subject: "-10 % sur « {produit} », rien que pour toi",
      message: "Un souci au moment de payer ? Pour t'aider à te lancer, voici le code {code} : -10 % sur ta commande, valable jusqu'au {expiration}.",
      promo: { kind: "unique", type: "percent", value: 10, validHours: 48 },
    },
    {
      id: "s3",
      enabled: true,
      delay: 3,
      unit: "days",
      subject: "Dernier rappel : ton code expire bientôt",
      message: "C'est le dernier rappel pour « {produit} ». Si tu as une question avant d'acheter, réponds simplement à cet email : on te répond vite.",
      promo: { kind: "none" },
    },
  ],
};

export async function loadRecovery(ctx: QueryCtx, storeId: Id<"stores">): Promise<RecoveryConfig> {
  const s = await loadSettings(ctx, storeId);
  return s?.recovery ?? DEFAULT_RECOVERY;
}

export const getConfig = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    return await loadRecovery(ctx, storeId);
  },
});

export const saveConfig = mutation({
  args: { storeId: v.id("stores"), config: recoveryV },
  handler: async (ctx, { storeId, config }) => {
    await requireStore(ctx, storeId);
    if (config.steps.length < 1 || config.steps.length > 5) throw new ConvexError("Entre 1 et 5 étapes.");
    if (config.maxAgeDays < 1 || config.maxAgeDays > 30) throw new ConvexError("La fenêtre de relance doit être entre 1 et 30 jours.");
    let prev = 0;
    for (const [i, s] of config.steps.entries()) {
      const ms = stepDelayMs(s);
      if (!Number.isFinite(ms) || s.delay <= 0) throw new ConvexError(`Étape ${i + 1} : délai invalide.`);
      if (ms < 15 * 60_000) throw new ConvexError(`Étape ${i + 1} : le délai minimum est de 15 minutes.`);
      if (ms <= prev) throw new ConvexError(`Étape ${i + 1} : chaque relance doit partir après la précédente.`);
      if (ms > config.maxAgeDays * UNIT_MS.days) throw new ConvexError(`Étape ${i + 1} : délai au-delà de la fenêtre de ${config.maxAgeDays} jours.`);
      if (!s.subject.trim() || !s.message.trim()) throw new ConvexError(`Étape ${i + 1} : objet et message obligatoires.`);
      if (s.promo.kind === "unique") {
        if (!Number.isInteger(s.promo.value) || s.promo.value <= 0) throw new ConvexError(`Étape ${i + 1} : valeur de réduction invalide.`);
        if (s.promo.type === "percent" && s.promo.value > 90) throw new ConvexError(`Étape ${i + 1} : 90 % de réduction maximum.`);
        if (s.promo.validHours < 1 || s.promo.validHours > 24 * 30) throw new ConvexError(`Étape ${i + 1} : validité du code entre 1 h et 30 jours.`);
      }
      if (s.promo.kind === "existing") {
        const c = await ctx.db.get(s.promo.couponId);
        if (!c || c.storeId !== storeId) throw new ConvexError(`Étape ${i + 1} : code promo introuvable dans cette boutique.`);
      }
      prev = ms;
    }
    const s = await ensureSettings(ctx, storeId);
    await ctx.db.patch(s._id, { recovery: config });
  },
});

// ── Éligibilité ─────────────────────────────────────────────────────────

export const RECOVERABLE = new Set(["pending", "failed", "abandoned"]);

/** Une vente réglée existe-t-elle pour ce client et ce produit après cette tentative ? */
export async function hasPaidAfter(ctx: QueryCtx, sale: Doc<"sales">) {
  const siblings = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q) => q.eq("customerId", sale.customerId))
    .collect();
  return siblings.some((s) => s.productId === sale.productId && s.status === "paid" && s._creationTime >= sale._creationTime - 60_000);
}

/** Dernière tentative non réglée par client + produit, dans la fenêtre de relance. */
async function candidates(ctx: QueryCtx, storeId: Id<"stores">, cfg: RecoveryConfig, now: number) {
  const since = now - cfg.maxAgeDays * UNIT_MS.days;
  const rows = await ctx.db
    .query("sales")
    .withIndex("by_store", (q) => q.eq("storeId", storeId).gte("_creationTime", since))
    .order("desc")
    .collect();
  const seen = new Set<string>();
  const out: Doc<"sales">[] = [];
  for (const s of rows) {
    const key = `${s.customerId}:${s.productId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!RECOVERABLE.has(s.status)) continue;
    if (s.net === 0) continue;
    out.push(s);
  }
  return out;
}

// ── Moteur (cron toutes les 10 minutes) ─────────────────────────────────

export const tick = internalMutation({
  // `now` : uniquement pour les tests (simuler l'écoulement du temps), le cron ne le passe jamais
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    let sent = 0;
    // Chaque boutique a sa propre séquence ; les boutiques en pause ne relancent pas
    for (const store of await ctx.db.query("stores").collect()) {
      if (store.status !== "active") continue;
      sent += await tickStore(ctx, store._id, now);
    }
    return { sent };
  },
});

async function tickStore(ctx: MutationCtx, storeId: Id<"stores">, now: number): Promise<number> {
    const cfg = await loadRecovery(ctx, storeId);
    if (!cfg.enabled) return 0;
    const steps = cfg.steps.filter((s) => s.enabled);
    let sent = 0;
    for (const sale of await candidates(ctx, storeId, cfg, now)) {
      const customer = await ctx.db.get(sale.customerId);
      if (!customer || customer.marketingOptOut) continue;
      if (await hasPaidAfter(ctx, sale)) continue;
      const product = await ctx.db.get(sale.productId);
      if (!product || product.status !== "published") continue;

      const already = new Set(sale.recovery?.stepsSent ?? []);
      const due = steps.filter((s) => !already.has(s.id) && sale._creationTime + stepDelayMs(s) <= now);
      // Un client relancé il y a moins d'une heure n'est pas relancé de nouveau
      if (due.length === 0) continue;
      // Pas de rattrapage en rafale : seule l'étape échue la plus avancée part, les précédentes sont sautées
      const step = due[due.length - 1];
      // Au moins 1 h entre deux relances du même client
      if (sale.recovery && now - sale.recovery.lastSentAt < 60 * 60_000) continue;

      let couponCode: string | undefined;
      let expiresAt: number | undefined;
      if (step.promo.kind === "unique") {
        expiresAt = now + step.promo.validHours * 3_600_000;
        couponCode = await uniqueCode(ctx, storeId);
        await ctx.db.insert("coupons", {
          storeId,
          code: couponCode,
          type: step.promo.type,
          value: step.promo.value,
          maxUses: 1,
          uses: 0,
          expiresAt,
          productId: sale.productId,
          active: true,
          saleId: sale._id,
        });
      } else if (step.promo.kind === "existing") {
        const c = await ctx.db.get(step.promo.couponId);
        if (c?.active && (!c.expiresAt || c.expiresAt > now)) {
          couponCode = c.code;
          expiresAt = c.expiresAt;
        }
      }

      await ctx.db.patch(sale._id, {
        recovery: {
          stepsSent: [...already, ...due.map((s) => s.id)],
          lastSentAt: now,
          whatsappDoneAt: sale.recovery?.whatsappDoneAt,
        },
      });
      await ctx.scheduler.runAfter(0, internal.email.send.queueRecovery, { saleId: sale._id, stepId: step.id, couponCode, expiresAt });
      sent++;
    }
    return sent;
}

async function uniqueCode(ctx: MutationCtx, storeId: Id<"stores">) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const code = `RELANCE-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
    const hit = await ctx.db
      .query("coupons")
      .withIndex("by_store_code", (q) => q.eq("storeId", storeId).eq("code", code))
      .first();
    if (!hit) return code;
  }
}

/** À appeler quand une vente est réglée : relie la vente à la relance qui l'a déclenchée. */
export async function attributeRecovery(ctx: MutationCtx, paid: Doc<"sales">) {
  const siblings = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q) => q.eq("customerId", paid.customerId))
    .collect();
  const source = siblings
    .filter((s) => s._id !== paid._id && s.productId === paid.productId && s.recovery?.stepsSent.length && !s.recoveredBySaleId && s.status !== "paid")
    .sort((a, b) => b._creationTime - a._creationTime)[0];
  // La même vente relancée et finalement payée (reprise via le lien) compte aussi
  const self = paid.recovery?.stepsSent.length ? paid : null;
  if (source) {
    await ctx.db.patch(source._id, { recoveredBySaleId: paid._id });
    await ctx.db.patch(paid._id, { recoveredFromSaleId: source._id });
  } else if (self) {
    await ctx.db.patch(paid._id, { recoveredFromSaleId: paid._id, recoveredBySaleId: paid._id });
  }
}

// ── Données pour l'email ─────────────────────────────────────────────────

/** Modèles d'envoi manuel depuis le dashboard (indépendants de la séquence automatique du vendeur). */
export const MANUAL_TEMPLATES = {
  failed: {
    id: "manual-failed",
    label: "Paiement échoué",
    subject: "{prénom}, ton paiement n'a pas abouti",
    message:
      "Ton paiement pour « {produit} » n'a pas pu aller jusqu'au bout. Aucun montant n'a été débité.\n\nÇa arrive souvent avec le mobile money : réseau saturé, code secret non validé à temps. Il suffit de réessayer : tes informations sont déjà remplies.\n\nSi ça bloque encore, réponds simplement à cet email : on t'aide à finir ton achat.",
  },
  cart: {
    id: "manual-cart",
    label: "Rappel de commande",
    subject: "{prénom}, ta commande t'attend",
    message: "Tu avais commencé à commander « {produit} » et ta commande est toujours là. Finalise-la en une minute avec le bouton ci-dessous.\n\nUne question avant de payer ? Réponds à cet email.",
  },
} as const;
export type ManualTemplate = keyof typeof MANUAL_TEMPLATES;
export const manualTemplateV = v.union(v.literal("failed"), v.literal("cart"));

export const stepFor = internalQuery({
  args: { storeId: v.id("stores"), stepId: v.string() },
  handler: async (ctx, { storeId, stepId }) => {
    const manual = Object.values(MANUAL_TEMPLATES).find((t) => t.id === stepId);
    if (manual) return { id: manual.id, enabled: true, delay: 0, unit: "minutes" as const, subject: manual.subject, message: manual.message, promo: { kind: "none" as const } };
    return (await loadRecovery(ctx, storeId)).steps.find((s) => s.id === stepId) ?? null;
  },
});

// ── Désabonnement (lien dans chaque relance) ────────────────────────────

async function hmac(value: string) {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.JWT_PRIVATE_KEY ?? "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`unsub:${value}`));
  return Array.from(new Uint8Array(sig).slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const unsubscribeToken = internalQuery({
  args: { customerId: v.id("customers") },
  handler: async (_ctx, { customerId }) => await hmac(customerId),
});

export const unsubscribe = mutation({
  args: { c: v.string(), t: v.string() },
  handler: async (ctx, { c, t }) => {
    const id = ctx.db.normalizeId("customers", c);
    if (!id || (await hmac(id)) !== t) return { ok: false };
    await ctx.db.patch(id, { marketingOptOut: true });
    return { ok: true };
  },
});

// ── Dashboard ───────────────────────────────────────────────────────────

export const stats = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const since = Date.now() - 30 * 86_400_000;
    const logs = (
      await ctx.db
        .query("emailLog")
        .withIndex("by_store_template", (q) => q.eq("storeId", storeId).eq("template", "recovery").gte("_creationTime", since))
        .take(8000)
    );
    const recentSales = await ctx.db
      .query("sales")
      .withIndex("by_store", (q) => q.eq("storeId", storeId).gte("_creationTime", since))
      .take(6000);
    const recovered = recentSales.filter((s) => s.status === "paid" && s.recoveredFromSaleId);
    return {
      sent: logs.filter((l) => l.status === "sent").length,
      failed: logs.filter((l) => l.status === "failed").length,
      opened: logs.filter((l) => l.status === "sent" && l.openedAt).length,
      clicked: logs.filter((l) => l.status === "sent" && l.clickedAt).length,
      recoveredCount: recovered.length,
      recoveredRevenue: recovered.reduce((a, s) => a + s.net, 0),
    };
  },
});

/** À relancer à la main sur WhatsApp : tentatives récentes non réglées, avec numéro. */
export const whatsappQueue = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const cfg = await loadRecovery(ctx, storeId);
    const out = [];
    for (const s of await candidates(ctx, storeId, cfg, Date.now())) {
      if (!s.customerPhone || s.recovery?.whatsappDoneAt) continue;
      if (Date.now() - s._creationTime < 15 * 60_000) continue; // laisse le temps de finir le paiement
      if (await hasPaidAfter(ctx, s)) continue;
      const product = await ctx.db.get(s.productId);
      out.push({
        _id: s._id as Id<"sales">,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        productTitle: s.productTitle,
        productSlug: product?.slug,
        accessKey: s.accessKey,
        net: s.net,
        status: s.status,
        at: s._creationTime,
        emailsSent: s.recovery?.stepsSent.length ?? 0,
      });
      if (out.length >= 30) break;
    }
    return out;
  },
});

export const markWhatsappDone = mutation({
  args: { storeId: v.id("stores"), saleId: v.id("sales") },
  handler: async (ctx, { storeId, saleId }) => {
    await requireStore(ctx, storeId);
    const s = ownedBy(await ctx.db.get(saleId), storeId, "Vente");
    await ctx.db.patch(saleId, {
      recovery: { stepsSent: s.recovery?.stepsSent ?? [], lastSentAt: s.recovery?.lastSentAt ?? 0, whatsappDoneAt: Date.now() },
    });
  },
});

// ── Envoi manuel depuis le dashboard ─────────────────────────────────────

type ManualResult = { ok: true } | { ok: false; reason: string };

/** Contrôles communs à l'envoi unitaire et groupé : jamais un client déjà servi, désabonné ou relancé il y a moins d'1 h. */
async function sendManual(ctx: MutationCtx, storeId: Id<"stores">, saleId: Id<"sales">, template: ManualTemplate, now: number): Promise<ManualResult> {
  const sale = await ctx.db.get(saleId);
  if (!sale || sale.storeId !== storeId) return { ok: false, reason: "Vente introuvable." };
  if (!RECOVERABLE.has(sale.status)) return { ok: false, reason: "Cette vente est déjà réglée." };
  if (sale.net === 0) return { ok: false, reason: "Produit offert : rien à relancer." };
  if (sale.status === "pending" && now - sale._creationTime < 15 * 60_000) return { ok: false, reason: "Paiement en cours : attends 15 minutes." };
  const customer = await ctx.db.get(sale.customerId);
  if (!customer) return { ok: false, reason: "Client introuvable." };
  if (customer.marketingOptOut) return { ok: false, reason: "Ce client s'est désabonné des relances." };
  if (await hasPaidAfter(ctx, sale)) return { ok: false, reason: "Ce client a payé depuis." };
  const product = await ctx.db.get(sale.productId);
  if (!product || product.status !== "published") return { ok: false, reason: "Produit indisponible." };
  if (sale.recovery && now - sale.recovery.lastSentAt < 60 * 60_000) return { ok: false, reason: "Relancé il y a moins d'une heure." };

  const stepId = MANUAL_TEMPLATES[template].id;
  const already = sale.recovery?.stepsSent ?? [];
  await ctx.db.patch(saleId, {
    recovery: { stepsSent: [...already, stepId], lastSentAt: now, whatsappDoneAt: sale.recovery?.whatsappDoneAt },
  });
  await ctx.scheduler.runAfter(0, internal.email.send.queueRecovery, { saleId, stepId });
  return { ok: true };
}

/** Bouton « Relancer par email » du détail d'une vente. */
export const sendNow = mutation({
  args: { storeId: v.id("stores"), saleId: v.id("sales"), template: manualTemplateV },
  handler: async (ctx, { storeId, saleId, template }) => {
    await requireStore(ctx, storeId);
    const r = await sendManual(ctx, storeId, saleId, template, Date.now());
    if (!r.ok) throw new ConvexError(r.reason);
  },
});

/** Envoi groupé (max 50) : chaque vente est contrôlée une par une, le résultat dit combien sont parties. */
export const sendBulk = mutation({
  args: { storeId: v.id("stores"), saleIds: v.array(v.id("sales")), template: manualTemplateV },
  handler: async (ctx, { storeId, saleIds, template }) => {
    await requireStore(ctx, storeId);
    if (saleIds.length === 0) throw new ConvexError("Sélectionne au moins une vente.");
    if (saleIds.length > 50) throw new ConvexError("50 relances maximum à la fois.");
    const now = Date.now();
    let sent = 0;
    const skipped: { saleId: Id<"sales">; reason: string }[] = [];
    for (const id of new Set(saleIds)) {
      const r = await sendManual(ctx, storeId, id, template, now);
      if (r.ok) sent++;
      else skipped.push({ saleId: id, reason: r.reason });
    }
    return { sent, skipped };
  },
});

/** Ventes non réglées relançables par email (échec, abandon, attente > 15 min), pour l'envoi groupé. */
export const failedQueue = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const cfg = await loadRecovery(ctx, storeId);
    const now = Date.now();
    const out = [];
    for (const s of await candidates(ctx, storeId, cfg, now)) {
      if (s.status === "pending" && now - s._creationTime < 15 * 60_000) continue;
      const customer = await ctx.db.get(s.customerId);
      if (!customer || customer.marketingOptOut) continue;
      if (await hasPaidAfter(ctx, s)) continue;
      const product = await ctx.db.get(s.productId);
      if (!product || product.status !== "published") continue;
      out.push({
        _id: s._id as Id<"sales">,
        customerName: s.customerName,
        customerEmail: s.customerEmail,
        productTitle: s.productTitle,
        status: s.status,
        reason: s.failureReason,
        at: s._creationTime,
        emailsSent: s.recovery?.stepsSent.length ?? 0,
        waitingUntil: s.recovery && now - s.recovery.lastSentAt < 60 * 60_000 ? s.recovery.lastSentAt + 60 * 60_000 : null,
      });
      if (out.length >= 100) break;
    }
    return out;
  },
});

/** Modèles proposés dans le dashboard. */
export const manualTemplates = query({
  args: {},
  handler: async () => Object.entries(MANUAL_TEMPLATES).map(([key, t]) => ({ key: key as ManualTemplate, label: t.label, subject: t.subject, message: t.message })),
});
