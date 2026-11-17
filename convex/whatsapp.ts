import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireStore } from "./lib/auth";
import { storeUrl } from "./lib/stores";
import { RECOVERABLE, hasPaidAfter } from "./recovery";

/**
 * Relance WhatsApp automatique — toutes les règles anti-bannissement sont appliquées ICI (une seule source de vérité),
 * jamais dans le worker : même un worker buggé ne peut pas dépasser les plafonds.
 *
 *  - Seulement des clients qui ont eux-mêmes saisi leur numéro au paiement.
 *  - 1er message SANS lien, qui demande de répondre OUI : le lien n'est envoyé qu'à ceux qui répondent (conversation
 *    ouverte par le client = signal le plus sûr pour WhatsApp). Pas de lien = pas de signalement « spam ».
 *  - Montée en charge progressive (échauffement) + plafonds par heure et par jour.
 *  - Écart aléatoire de 90 à 240 s entre deux envois, fenêtre 8 h – 20 h (heure du Bénin).
 *  - 1 relance à froid par client tous les 3 jours, 2 au maximum à vie.
 *  - STOP / refus → désabonnement immédiat, confirmation envoyée une seule fois.
 *  - Messages variés (jamais deux textes identiques à la suite).
 */

const MIN_GAP_MS = 90_000;
const MAX_GAP_MS = 240_000;
const HOURLY_CAP = 6;
const COLD_COOLDOWN_MS = 72 * 3_600_000;
const COLD_LIFETIME_MAX = 2;
const REPLY_WINDOW_MS = 72 * 3_600_000;
const OPEN_HOUR = 8; // heure du Bénin (UTC+1, pas d'heure d'été)
const CLOSE_HOUR = 20;

const COLD = new Set<Doc<"whatsappQueue">["kind"]>(["failed", "cart"]);
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Plafond de messages à froid par jour selon l'ancienneté du numéro en service (échauffement). */
function dailyCap(now: number, warmupStartedAt?: number) {
  if (!warmupStartedAt) return 5;
  const day = Math.floor((now - warmupStartedAt) / 86_400_000);
  if (day < 3) return 5;
  if (day < 7) return 10;
  if (day < 14) return 20;
  if (day < 30) return 35;
  return 50;
}

const isQuietHours = (now: number) => {
  const h = new Date(now + 3_600_000).getUTCHours();
  return h < OPEN_HOUR || h >= CLOSE_HOUR;
};

async function getState(ctx: MutationCtx) {
  const row = await ctx.db.query("whatsappState").withIndex("by_key", (q) => q.eq("key", "main")).first();
  if (row) return row;
  const id = await ctx.db.insert("whatsappState", { key: "main", paused: false, nextAllowedAt: 0, connected: false });
  return (await ctx.db.get(id))!;
}

const digits = (s: string) => s.replace(/\D/g, "");

// ── Textes ───────────────────────────────────────────────────────────────

function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || "";
}

function coldText(kind: "failed" | "cart", name: string, product: string, store: string) {
  const hi = pick([`Bonjour ${name}`, `Salut ${name}`]);
  const stop = pick(["Pour ne plus recevoir de messages, réponds STOP.", "Réponds STOP si tu ne veux plus être contacté.", "(STOP pour ne plus recevoir de messages)"]);
  if (kind === "failed") {
    return pick([
      `${hi} 👋 C'est ${store}. Ton paiement pour « ${product} » n'est pas allé au bout, et rien n'a été débité. Tu veux que je t'envoie le lien pour réessayer ? Réponds OUI. ${stop}`,
      `${hi}, ${store} ici. Il y a eu un souci avec ton paiement de « ${product} » (aucun montant débité). Je peux te renvoyer le lien pour finir ta commande : réponds OUI. ${stop}`,
      `${hi} ! Ton paiement pour « ${product} » a échoué chez nous, sans aucun débit. Réponds OUI et je t'envoie le lien pour réessayer. ${stop}`,
    ]);
  }
  return pick([
    `${hi} 👋 C'est ${store}. Tu avais commencé à commander « ${product} ». Tu veux que je t'envoie le lien pour la finaliser ? Réponds OUI. ${stop}`,
    `${hi}, ${store} ici. Ta commande « ${product} » est toujours en attente. Réponds OUI et je te renvoie le lien. ${stop}`,
  ]);
}

const linkText = (product: string, url: string) =>
  pick([
    `Voici ton lien pour finaliser « ${product} » : ${url}\nTes informations sont déjà remplies. Si ça bloque, écris-moi ici et je t'aide.`,
    `Parfait 🙌 Le lien pour « ${product} » : ${url}\nTout est pré-rempli. Un souci pour payer ? Réponds-moi directement.`,
  ]);

const ackText = () => pick(["C'est noté, tu ne recevras plus de messages de notre part. Bonne continuation !", "Bien reçu, on ne te contactera plus. Bonne continuation !"]);

// ── Éligibilité (partagée par l'ajout à la file et le contrôle au moment d'envoyer) ─────────

type Verdict = { ok: true; sale: Doc<"sales">; customer: Doc<"customers"> } | { ok: false; reason: string };

async function coldQuota(ctx: QueryCtx, to: string, now: number, excludeId?: Id<"whatsappQueue">) {
  const rows = (await ctx.db.query("whatsappQueue").withIndex("by_to", (q) => q.eq("to", to)).collect()).filter(
    (r) => COLD.has(r.kind) && r._id !== excludeId && (r.status === "sent" || r.status === "queued" || r.status === "sending"),
  );
  const recent = rows.some((r) => now - (r.sentAt ?? r.scheduledFor) < COLD_COOLDOWN_MS);
  return { recent, lifetime: rows.length };
}

async function judge(ctx: QueryCtx, saleId: Id<"sales">, now: number, opts: { cold: boolean; excludeId?: Id<"whatsappQueue"> }): Promise<Verdict> {
  const sale = await ctx.db.get(saleId);
  if (!sale) return { ok: false, reason: "Vente introuvable." };
  if (!RECOVERABLE.has(sale.status)) return { ok: false, reason: "Cette vente est déjà réglée." };
  if (sale.net === 0) return { ok: false, reason: "Produit offert : rien à relancer." };
  const customer = await ctx.db.get(sale.customerId);
  if (!customer) return { ok: false, reason: "Client introuvable." };
  if (customer.marketingOptOut) return { ok: false, reason: "Ce client s'est désabonné." };
  if (await hasPaidAfter(ctx, sale)) return { ok: false, reason: "Ce client a payé depuis." };
  const product = await ctx.db.get(sale.productId);
  if (!product || product.status !== "published") return { ok: false, reason: "Produit indisponible." };
  if (opts.cold) {
    const to = digits(sale.customerPhone ?? "");
    if (to.length < 8) return { ok: false, reason: "Pas de numéro WhatsApp valide." };
    const q = await coldQuota(ctx, to, now, opts.excludeId);
    if (q.recent) return { ok: false, reason: "Déjà contacté sur WhatsApp ces 3 derniers jours." };
    if (q.lifetime >= COLD_LIFETIME_MAX) return { ok: false, reason: "Déjà relancé 2 fois sur WhatsApp : on s'arrête là." };
  }
  return { ok: true, sale, customer };
}

// ── Ajout à la file (dashboard) ──────────────────────────────────────────

const coldKindV = v.union(v.literal("failed"), v.literal("cart"));

async function enqueueOne(ctx: MutationCtx, storeId: Id<"stores">, saleId: Id<"sales">, kind: "failed" | "cart", now: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sale = await ctx.db.get(saleId);
  if (!sale || sale.storeId !== storeId) return { ok: false, reason: "Vente introuvable." };
  if (sale.status === "pending" && now - sale._creationTime < 15 * 60_000) return { ok: false, reason: "Paiement en cours : attends 15 minutes." };
  const open = (await ctx.db.query("whatsappQueue").withIndex("by_sale", (q) => q.eq("saleId", saleId)).collect()).find((r) => COLD.has(r.kind) && (r.status === "queued" || r.status === "sending"));
  if (open) return { ok: false, reason: "Déjà dans la file d'envoi." };
  const verdict = await judge(ctx, saleId, now, { cold: true });
  if (!verdict.ok) return verdict;
  await ctx.db.insert("whatsappQueue", {
    storeId,
    saleId,
    customerId: verdict.customer._id,
    to: digits(verdict.sale.customerPhone ?? ""),
    kind,
    status: "queued",
    scheduledFor: now + rand(0, 10 * 60_000), // étale les envois
    attempts: 0,
  });
  return { ok: true };
}

export const enqueue = mutation({
  args: { storeId: v.id("stores"), saleId: v.id("sales"), kind: coldKindV },
  handler: async (ctx, { storeId, saleId, kind }) => {
    await requireStore(ctx, storeId);
    const r = await enqueueOne(ctx, storeId, saleId, kind, Date.now());
    if (!r.ok) throw new ConvexError(r.reason);
  },
});

export const enqueueBulk = mutation({
  args: { storeId: v.id("stores"), saleIds: v.array(v.id("sales")), kind: coldKindV },
  handler: async (ctx, { storeId, saleIds, kind }) => {
    await requireStore(ctx, storeId);
    if (saleIds.length === 0) throw new ConvexError("Sélectionne au moins une vente.");
    if (saleIds.length > 30) throw new ConvexError("30 relances WhatsApp maximum à la fois (elles partent au compte-gouttes).");
    const now = Date.now();
    let queued = 0;
    const skipped: string[] = [];
    for (const id of new Set(saleIds)) {
      const r = await enqueueOne(ctx, storeId, id, kind, now);
      if (r.ok) queued++;
      else skipped.push(r.reason);
    }
    return { queued, skipped };
  },
});

export const normalizeId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => ctx.db.normalizeId("whatsappQueue", id),
});

// ── Worker (appelé uniquement par les routes HTTP /wa/*, authentifiées par secret) ─────────

/** Prochain message à envoyer, ou null. C'est ici que tous les plafonds sont appliqués. */
export const claim = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const state = await getState(ctx);
    if (state.paused) return { item: null, reason: "paused" as const };
    if (now < state.nextAllowedAt) return { item: null, reason: "gap" as const };

    const quiet = isQuietHours(now);
    const due = await ctx.db.query("whatsappQueue").withIndex("by_status_time", (q) => q.eq("status", "queued").lte("scheduledFor", now)).take(25);
    if (due.length === 0) return { item: null, reason: "empty" as const };

    // Envois à froid des dernières 24 h / dernière heure (réservés inclus)
    const sinceDay = now - 86_400_000;
    const sent = (await ctx.db.query("whatsappQueue").withIndex("by_sent", (q) => q.eq("status", "sent").gte("sentAt", sinceDay)).collect()).filter((r) => COLD.has(r.kind));
    const inFlight = (await ctx.db.query("whatsappQueue").withIndex("by_status_time", (q) => q.eq("status", "sending")).collect()).filter((r) => COLD.has(r.kind));
    const coldDay = sent.length + inFlight.length;
    const coldHour = sent.filter((r) => (r.sentAt ?? 0) >= now - 3_600_000).length + inFlight.length;
    const capReached = coldDay >= dailyCap(now, state.warmupStartedAt) || coldHour >= HOURLY_CAP;

    for (const item of due) {
      const reply = !COLD.has(item.kind);
      if (!reply && (quiet || capReached)) continue; // reste en file : part au prochain créneau autorisé

      let text: string | null = null;
      if (item.kind === "ack") {
        text = ackText();
      } else {
        const verdict = await judge(ctx, item.saleId, now, { cold: !reply, excludeId: item._id });
        if (!verdict.ok) {
          await ctx.db.patch(item._id, { status: "skipped", error: verdict.reason });
          continue;
        }
        const product = await ctx.db.get(verdict.sale.productId);
        const store = await ctx.db.get(verdict.sale.storeId);
        if (!product || !store) {
          await ctx.db.patch(item._id, { status: "skipped", error: "Boutique ou produit introuvable." });
          continue;
        }
        if (item.kind === "link") {
          const url = `${storeUrl(store)}/checkout/${product.slug}?reprise=${verdict.sale._id}&k=${verdict.sale.accessKey}`;
          text = linkText(verdict.sale.productTitle, url);
        } else {
          text = coldText(item.kind, firstName(verdict.sale.customerName), verdict.sale.productTitle, store.name);
        }
      }

      await ctx.db.patch(item._id, { status: "sending", attempts: item.attempts + 1 });
      await ctx.db.patch(state._id, {
        nextAllowedAt: now + rand(MIN_GAP_MS, MAX_GAP_MS),
        warmupStartedAt: state.warmupStartedAt ?? now,
      });
      return { item: { id: item._id, to: item.to, text, kind: item.kind }, reason: "ok" as const };
    }
    return { item: null, reason: "waiting" as const };
  },
});

export const result = internalMutation({
  args: { id: v.id("whatsappQueue"), outcome: v.union(v.literal("sent"), v.literal("failed"), v.literal("not_on_whatsapp")), error: v.optional(v.string()) },
  handler: async (ctx, { id, outcome, error }) => {
    const item = await ctx.db.get(id);
    if (!item || item.status !== "sending") return;
    if (outcome === "sent") return void (await ctx.db.patch(id, { status: "sent", sentAt: Date.now(), error: undefined }));
    if (outcome === "not_on_whatsapp") return void (await ctx.db.patch(id, { status: "skipped", error: "Ce numéro n'a pas WhatsApp." }));
    // Échec technique : 2 nouvelles tentatives espacées, puis abandon (jamais d'insistance)
    if (item.attempts < 3) await ctx.db.patch(id, { status: "queued", scheduledFor: Date.now() + item.attempts * 20 * 60_000, error });
    else await ctx.db.patch(id, { status: "failed", error });
  },
});

export const heartbeat = internalMutation({
  args: { connected: v.boolean(), phone: v.optional(v.string()), pauseReason: v.optional(v.string()) },
  handler: async (ctx, { connected, phone, pauseReason }) => {
    const state = await getState(ctx);
    const patch: Partial<Doc<"whatsappState">> = { connected, lastHeartbeatAt: Date.now(), phone: phone ?? state.phone };
    // Numéro déconnecté de force (session révoquée, restriction) : on arrête tout, un humain reprend la main
    if (pauseReason && !state.paused) {
      patch.paused = true;
      patch.pauseReason = pauseReason;
    }
    await ctx.db.patch(state._id, patch);
  },
});

const STOP_RE = /^\W*(stop|arret|arrêt|desabonn|désabonn|unsub|ne plus|non merci|pas interess|pas intéress|non\b|no\b)/i;

/** Message reçu d'un client : STOP → désabonnement + confirmation ; toute autre réponse → on envoie le lien (une seule fois). */
export const inbound = internalMutation({
  args: { from: v.string(), text: v.string() },
  handler: async (ctx, { from, text }) => {
    const now = Date.now();
    const to = digits(from);
    const last = (await ctx.db.query("whatsappQueue").withIndex("by_to", (q) => q.eq("to", to)).order("desc").collect()).find((r) => COLD.has(r.kind) && r.status === "sent");
    if (!last || !last.sentAt) return { handled: false };

    if (STOP_RE.test(text.trim())) {
      await ctx.db.patch(last.customerId, { marketingOptOut: true });
      const acked = (await ctx.db.query("whatsappQueue").withIndex("by_to", (q) => q.eq("to", to)).collect()).some((r) => r.kind === "ack" && now - r.scheduledFor < 86_400_000);
      if (!acked) {
        await ctx.db.insert("whatsappQueue", { storeId: last.storeId, saleId: last.saleId, customerId: last.customerId, to, kind: "ack", status: "queued", scheduledFor: now + rand(15_000, 45_000), attempts: 0 });
      }
      return { handled: true, optedOut: true };
    }

    if (last.repliedAt || now - last.sentAt > REPLY_WINDOW_MS) return { handled: false };
    await ctx.db.patch(last._id, { repliedAt: now });
    await ctx.db.insert("whatsappQueue", { storeId: last.storeId, saleId: last.saleId, customerId: last.customerId, to, kind: "link", status: "queued", scheduledFor: now + rand(20_000, 70_000), attempts: 0 });
    return { handled: true, optedOut: false };
  },
});

// ── Dashboard ────────────────────────────────────────────────────────────

export const status = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const now = Date.now();
    const state = await ctx.db.query("whatsappState").withIndex("by_key", (q) => q.eq("key", "main")).first();
    const sent24 = (await ctx.db.query("whatsappQueue").withIndex("by_sent", (q) => q.eq("status", "sent").gte("sentAt", now - 86_400_000)).collect()).filter((r) => COLD.has(r.kind)).length;
    const mine = await ctx.db.query("whatsappQueue").withIndex("by_store", (q) => q.eq("storeId", storeId)).order("desc").take(25);
    const userId = await getAuthUserId(ctx);
    const me = userId ? await ctx.db.get(userId) : null;
    const admin = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
    return {
      configured: Boolean(process.env.WA_WORKER_SECRET),
      connected: Boolean(state?.connected && state.lastHeartbeatAt && now - state.lastHeartbeatAt < 3 * 60_000),
      phone: state?.phone ?? null,
      paused: state?.paused ?? false,
      pauseReason: state?.pauseReason ?? null,
      canControl: Boolean(me?.email && me.email.toLowerCase() === admin),
      warmupDay: state?.warmupStartedAt ? Math.floor((now - state.warmupStartedAt) / 86_400_000) + 1 : 0,
      dailyCap: dailyCap(now, state?.warmupStartedAt),
      sent24,
      quietHours: isQuietHours(now),
      queued: mine.filter((r) => r.status === "queued" || r.status === "sending").length,
      recent: mine.map((r) => ({ _id: r._id, kind: r.kind, status: r.status, to: `…${r.to.slice(-4)}`, at: r.sentAt ?? r.scheduledFor, error: r.error ?? null, replied: Boolean(r.repliedAt) })),
    };
  },
});

/** Pause / reprise d'urgence de TOUS les envois (le numéro est partagé) : réservé au compte administrateur de la plateforme. */
export const setPaused = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, { paused }) => {
    const userId = await getAuthUserId(ctx);
    const me = userId ? await ctx.db.get(userId) : null;
    if (!me?.email || me.email.toLowerCase() !== (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase()) throw new ConvexError("Réservé à l'administrateur de la plateforme.");
    const state = await getState(ctx);
    await ctx.db.patch(state._id, { paused, pauseReason: paused ? "Mis en pause depuis le dashboard" : undefined });
  },
});
