import { action, internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { pushPayout } from "./push";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyCurrent } from "./account";
import { ConvexError, v } from "convex/values";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import type { Doc, Id } from "./_generated/dataModel";
import { requireStore } from "./lib/auth";
import { ensureSettings, loadSettings } from "./settings";
import { MONEROO_API_URL, buildAuthHeaders, describeFetchError, fetchWithTimeout, readJson, str } from "./payments/moneroo_client";
import {
  SASPAY_API_URL,
  buildAuthHeaders as cmAuthHeaders,
  describeFetchError as cmDescribeFetchError,
  fetchWithTimeout as cmFetch,
  readJson as cmReadJson,
  str as cmStr,
  SASPAY_NETWORKS,
  isSaspayMethod,
} from "./payments/saspay_client";

const MIN_XOF = 500;
const IN_FLIGHT = new Set(["initiated", "pending"]);

// ── Sécurité : chaque opération sensible redemande le mot de passe ───────

async function requirePassword(ctx: ActionCtx, password: string, storeId: Id<"stores">): Promise<string> {
  const store = await ctx.runQuery(internal.stores.internalGet, { storeId });
  if (!store) throw new ConvexError("Boutique introuvable");
  // Mot de passe vérifié sur l'email du compte connecté (il peut avoir été changé depuis « Mon compte »)
  const { email } = await verifyCurrent(ctx, password).catch((e: unknown) => {
    throw e instanceof ConvexError && String(e.data).includes("actuel") ? new ConvexError("Mot de passe incorrect.") : e;
  });
  return email;
}

// ── Solde estimé, par pays (Moneroo cloisonne les fonds par pays d'encaissement) ──

type MethodRow = Doc<"monerooMethods">;

/** Pays d'un moyen Moneroo (« mtn_bj » → BJ) ; null pour la carte / la crypto (multi-pays). */
export function countryOfMethod(code: string | undefined, methods: Map<string, MethodRow>): string | null {
  if (!code) return null;
  const m = methods.get(code);
  if (m?.countries.length === 1) return m.countries[0];
  const suffix = code.split("_").pop()?.toUpperCase() ?? "";
  if (/^[A-Z]{2}$/.test(suffix) && (!m || m.countries.includes(suffix))) return suffix;
  return null;
}

async function methodMaps(ctx: QueryCtx) {
  const rows = await ctx.db.query("monerooMethods").take(500);
  const payment = new Map<string, MethodRow>();
  const payout = new Map<string, MethodRow>();
  for (const r of rows) (r.kind === "payment" ? payment : payout).set(r.code, r);
  return { payment, payout };
}

export type Bucket = { currency: string; country: string | null; earned: number; paidOut: number; pending: number; available: number };

/**
 * Encaissé − frais − retraits, par devise ET par pays d'encaissement : un numéro MTN Bénin ne peut
 * recevoir que l'argent encaissé au Bénin. Carte / crypto : pays null (non retirable vers un numéro).
 */
export async function balances(ctx: QueryCtx, storeId: Id<"stores">): Promise<Bucket[]> {
  const { payment, payout } = await methodMaps(ctx);
  // Retraits attribués à chaque boutique : seules ses ventes et ses retraits comptent
  const paid = await ctx.db
    .query("sales")
    .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "paid"))
    .collect();
  const payouts = await ctx.db
    .query("payouts")
    .withIndex("by_store", (q) => q.eq("storeId", storeId))
    .collect();
  const by = new Map<string, Bucket>();
  const row = (currency: string, country: string | null) => {
    const k = `${currency}|${country ?? "-"}`;
    const r = by.get(k) ?? { currency, country, earned: 0, paidOut: 0, pending: 0, available: 0 };
    by.set(k, r);
    return r;
  };
  for (const s of paid) {
    const country = countryOfMethod(s.methodCode, payment) ?? (s.methodCode ? null : (s.context.country ?? null));
    if (s.charged) row(s.charged.currency, country).earned += s.charged.amount - (s.fees ?? 0) * s.charged.rate;
    else if (s.net > 0) row("XOF", country).earned += s.net - (s.fees ?? 0);
  }
  for (const p of payouts) {
    const r = row(p.currency ?? "XOF", p.country ?? countryOfMethod(p.method, payout));
    if (p.status === "success") r.paidOut += p.amount;
    else if (IN_FLIGHT.has(p.status)) r.pending += p.amount;
  }
  return [...by.values()]
    .map((r) => ({ ...r, available: Math.max(0, Math.floor((r.earned - r.paidOut - r.pending) * 100) / 100) }))
    .sort((a, b) => b.available - a.available);
}

/** Totaux par devise (le retrait se fait par devise ; le détail par pays reste informatif). */
export function currencyTotals(buckets: Bucket[]) {
  const by = new Map<string, { currency: string; earned: number; paidOut: number; pending: number; available: number; countries: { country: string | null; available: number }[] }>();
  for (const b of buckets) {
    const t = by.get(b.currency) ?? { currency: b.currency, earned: 0, paidOut: 0, pending: 0, available: 0, countries: [] };
    t.earned += b.earned;
    t.paidOut += b.paidOut;
    t.pending += b.pending;
    t.available = Math.max(0, Math.floor((t.earned - t.paidOut - t.pending) * 100) / 100);
    if (b.available > 0) t.countries.push({ country: b.country, available: b.available });
    by.set(b.currency, t);
  }
  return [...by.values()].sort((a, b) => b.available - a.available);
}

export const overview = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const settings = await loadSettings(ctx, storeId);
    const list = await ctx.db
      .query("payouts")
      .withIndex("by_store", (q) => q.eq("storeId", storeId))
      .order("desc")
      .take(100);
    const paid = await ctx.db
      .query("sales")
      .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "paid"))
      .collect();
    // Revenus par pays (en XOF, référence comptable de la boutique)
    const countries = new Map<string, { country: string; revenue: number; sales: number }>();
    for (const s of paid) {
      const c = s.context.country ?? "—";
      const r = countries.get(c) ?? { country: c, revenue: 0, sales: 0 };
      r.revenue += s.net;
      r.sales += 1;
      countries.set(c, r);
    }
    const methods = await ctx.db
      .query("monerooMethods")
      .withIndex("by_kind", (q) => q.eq("kind", "payout"))
      .collect();
    return {
      storeCount: (await ctx.db.query("stores").collect()).length,
      balances: currencyTotals(await balances(ctx, storeId)),
      // Détail retirable : un seau par pays (et devise)
      buckets: await balances(ctx, storeId),
      totalNet: paid.reduce((a, s) => a + s.net - (s.fees ?? 0), 0),
      totalFees: paid.reduce((a, s) => a + (s.fees ?? 0), 0),
      byCountry: [...countries.values()].sort((a, b) => b.revenue - a.revenue),
      destinations: settings?.payoutDestinations ?? [],
      payouts: list,
      // Méthodes de retrait utilisables : uniquement celles qui demandent un numéro (msisdn)
      payoutMethods: methods
        .filter((m) => m.enabled && !m.code.includes("sandbox") && !m.code.startsWith("moneroo_") && m.fields.every((f) => f.name === "msisdn"))
        .map((m) => ({ code: m.code, name: m.name, iconUrl: m.iconUrl, currency: m.currency, countries: m.countries, country: m.countries.length === 1 ? m.countries[0] : (m.code.split("_").pop()?.toUpperCase() ?? null) })),
    };
  },
});

// ── Numéros de retrait ──────────────────────────────────────────────────

export const writeDestinations = internalMutation({
  args: { storeId: v.id("stores"), destinations: v.array(v.object({ id: v.string(), label: v.string(), method: v.string(), msisdn: v.string() })) },
  handler: async (ctx, { storeId, destinations }) => {
    const s = await ensureSettings(ctx, storeId);
    await ctx.db.patch(s._id, { payoutDestinations: destinations });
  },
});

export const methodByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, { code }) =>
    await ctx.db
      .query("monerooMethods")
      .withIndex("by_kind_code", (q) => q.eq("kind", "payout").eq("code", code))
      .first(),
});

export const internalOverview = internalQuery({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const s = await loadSettings(ctx, storeId);
    return { destinations: s?.payoutDestinations ?? [], balances: currencyTotals(await balances(ctx, storeId)) };
  },
});

export const addDestination = action({
  args: { storeId: v.id("stores"), password: v.string(), label: v.string(), method: v.string(), phone: v.string() },
  handler: async (ctx, args) => {
    await requirePassword(ctx, args.password, args.storeId);
    // Deux catalogues de moyens de retrait : Moneroo (CEDEAO + autres) ou le réseau CEMAC statique ci-dessus
    const cmNetwork = SASPAY_NETWORKS[args.method];
    const method = cmNetwork
      ? { name: cmNetwork.name, code: args.method, countries: [cmNetwork.country] }
      : await ctx.runQuery(internal.payouts.methodByCode, { code: args.method });
    if (!method || ("enabled" in method && !method.enabled)) throw new ConvexError("Moyen de retrait indisponible.");
    const phone = parsePhoneNumberFromString(args.phone.trim().startsWith("+") ? args.phone : `+${args.phone.replace(/\D/g, "")}`);
    if (!phone?.isValid()) throw new ConvexError("Numéro invalide : saisis-le avec l'indicatif (ex. +229 01 00 00 00 00).");
    if (method.countries.length && phone.country && !method.countries.includes(phone.country)) {
      throw new ConvexError(`Ce numéro n'est pas un numéro ${method.name}.`);
    }
    const { destinations } = await ctx.runQuery(internal.payouts.internalOverview, { storeId: args.storeId });
    if (destinations.length >= 8) throw new ConvexError("8 numéros maximum : supprime-en un d'abord.");
    const msisdn = (phone.number as string).replace(/\D/g, "");
    if (destinations.some((d) => d.msisdn === msisdn && d.method === method.code)) throw new ConvexError("Ce numéro est déjà enregistré.");
    const id = Math.random().toString(36).slice(2, 10);
    await ctx.runMutation(internal.payouts.writeDestinations, {
      storeId: args.storeId,
      destinations: [...destinations, { id, label: args.label.trim() || method.name, method: method.code, msisdn }],
    });
  },
});

export const removeDestination = action({
  args: { storeId: v.id("stores"), password: v.string(), id: v.string() },
  handler: async (ctx, { storeId, password, id }) => {
    await requirePassword(ctx, password, storeId);
    const { destinations } = await ctx.runQuery(internal.payouts.internalOverview, { storeId });
    await ctx.runMutation(internal.payouts.writeDestinations, { storeId, destinations: destinations.filter((d) => d.id !== id) });
  },
});

// ── Demande de retrait ──────────────────────────────────────────────────

export const create = internalMutation({
  args: { storeId: v.id("stores"), destinationId: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, { storeId, destinationId, amount, currency }) => {
    const s = await loadSettings(ctx, storeId);
    const dest = s?.payoutDestinations?.find((d) => d.id === destinationId);
    if (!dest) throw new ConvexError("Numéro de retrait inconnu : seuls les numéros enregistrés sont autorisés.");
    const cmNetwork = SASPAY_NETWORKS[dest.method];
    const method = cmNetwork
      ? { name: cmNetwork.name, currency: cmNetwork.currency, code: dest.method }
      : await ctx.db
          .query("monerooMethods")
          .withIndex("by_kind_code", (q) => q.eq("kind", "payout").eq("code", dest.method))
          .first();
    if (!method || (!cmNetwork && !(method as Doc<"monerooMethods">).enabled)) throw new ConvexError("Ce moyen de retrait n'est plus disponible.");
    if (method.currency !== currency) throw new ConvexError(`${method.name} se retire en ${method.currency}.`);
    const { payout: payoutMethods } = await methodMaps(ctx);
    const country = cmNetwork?.country ?? countryOfMethod(method.code, payoutMethods);
    if (!country) throw new ConvexError(`${method.name} : pays du moyen de retrait introuvable.`);

    // Moneroo cloisonne les fonds PAR PAYS (vérifié en prod : un retrait MTN Bénin est refusé au-delà de l'argent encaissé au Bénin).
    // Un seul retrait en cours par pays, et jamais plus que ce qui a été encaissé dans ce pays.
    const inFlight = (
      await ctx.db
        .query("payouts")
        .withIndex("by_store", (q) => q.eq("storeId", storeId))
        .collect()
    ).some((p) => IN_FLIGHT.has(p.status) && (p.country ?? SASPAY_NETWORKS[p.method]?.country ?? countryOfMethod(p.method, payoutMethods)) === country);
    if (inFlight) throw new ConvexError(`Un retrait est déjà en cours pour ce pays : attends sa confirmation.`);
    const available = (await balances(ctx, storeId)).find((b) => b.currency === currency && b.country === country)?.available ?? 0;
    const fx = await ctx.db.query("fxRates").first();
    const min = currency === "XOF" ? MIN_XOF : Math.ceil(MIN_XOF * (fx?.rates[currency] ?? 0) * 100) / 100;
    if (amount < min) throw new ConvexError(`Montant minimum : ${min} ${currency}.`);
    if (amount > available) throw new ConvexError(`Montant supérieur à l'argent encaissé dans ce pays (${available} ${currency} disponibles) : Moneroo garde les fonds séparément par pays.`);
    if (currency === "XOF" && !Number.isInteger(amount)) throw new ConvexError("Montant en F CFA sans décimales.");

    return await ctx.db.insert("payouts", {
      storeId,
      amount,
      currency,
      method: dest.method,
      country,
      msisdn: dest.msisdn,
      label: dest.label,
      status: "initiated",
      provider: cmNetwork ? "saspay" : "moneroo",
    });
  },
});

export const patch = internalMutation({
  args: {
    id: v.id("payouts"),
    status: v.optional(v.union(v.literal("initiated"), v.literal("pending"), v.literal("success"), v.literal("failed"))),
    monerooPayoutId: v.optional(v.string()),
    saspayPayoutId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...p }) => {
    const row = await ctx.db.get(id);
    if (!row) return;
    // Un statut final ne revient jamais en arrière (idempotence webhook / vérifications)
    if (row.status === "success" || (row.status === "failed" && p.status !== "success")) return;
    await ctx.db.patch(id, {
      ...p,
      ...(p.status === "success" || p.status === "failed" ? { completedAt: Date.now() } : {}),
    });
    if (p.status === "success" || p.status === "failed") await pushPayout(ctx, { ...row, ...p }, p.status);
  },
});

export const get = internalQuery({ args: { id: v.id("payouts") }, handler: async (ctx, { id }) => await ctx.db.get(id) });

export const byMoneroo = internalQuery({
  args: { monerooId: v.string() },
  handler: async (ctx, { monerooId }) =>
    await ctx.db
      .query("payouts")
      .withIndex("by_moneroo", (q) => q.eq("monerooPayoutId", monerooId))
      .first(),
});

export const bySaspay = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) =>
    await ctx.db
      .query("payouts")
      .withIndex("by_saspay", (q) => q.eq("saspayPayoutId", id))
      .first(),
});

type PayoutItem = { destinationId: string; amount: number; currency: string };
type SendResult = { ok: true; id: Id<"payouts"> } | { ok: false; error: string };

/** Décaissement zone CEMAC. Même contrat que sendMonerooPayout. */
async function sendCameroonPayout(ctx: ActionCtx, id: Id<"payouts">, key: string): Promise<SendResult> {
  const payout = (await ctx.runQuery(internal.payouts.get, { id }))!;
  let res: Response;
  try {
    res = await cmFetch(`${SASPAY_API_URL}/payouts/initialize/`, {
      method: "POST",
      headers: { ...cmAuthHeaders(key), "Idempotency-Key": id },
      body: JSON.stringify({
        amount: payout.amount.toFixed(2),
        currency: payout.currency ?? "XAF",
        country: payout.country ?? "CM",
        method: payout.method,
        customer: { phone: `+${payout.msisdn}` },
        recipient: { msisdn: payout.msisdn },
        description: `Retrait boutique vers ${payout.label}`,
      }),
    });
  } catch (err) {
    await ctx.runMutation(internal.payouts.patch, { id, status: "failed", failureReason: cmDescribeFetchError(err, "retrait") });
    return { ok: false, error: "Le prestataire CEMAC ne répond pas. Aucun argent n'a été envoyé, réessaie dans un instant." };
  }
  const body = await cmReadJson(res);
  // L'id renvoyé à la création EST déjà l'id de transaction (contrairement au paiement entrant, connu plus tard).
  const txId = cmStr(body, ["id"]) ?? cmStr(body, ["data", "id"]);
  if (!res.ok || !txId) {
    const reason = cmStr(body, ["message"]) ?? cmStr(body, ["error", "message"]) ?? `HTTP ${res.status}`;
    await ctx.runMutation(internal.payouts.patch, { id, status: "failed", failureReason: reason });
    return { ok: false, error: `Retrait refusé : ${reason}` };
  }
  await ctx.runMutation(internal.payouts.patch, { id, status: "pending", saspayPayoutId: txId });
  for (const delay of [60_000, 5 * 60_000, 30 * 60_000]) await ctx.scheduler.runAfter(delay, internal.payouts.verify, { id });
  return { ok: true, id };
}

async function sendMonerooPayout(ctx: ActionCtx, id: Id<"payouts">, storeId: Id<"stores">, adminEmail: string, key: string): Promise<SendResult> {
  const payout = (await ctx.runQuery(internal.payouts.get, { id }))!;
  let res: Response;
  try {
    res = await fetchWithTimeout(`${MONEROO_API_URL}/payouts/initialize`, {
      method: "POST",
      headers: buildAuthHeaders(key),
      body: JSON.stringify({
        amount: payout.amount,
        currency: payout.currency ?? "XOF",
        description: `Retrait boutique vers ${payout.label}`,
        method: payout.method,
        customer: { email: adminEmail, first_name: "Retrait", last_name: "Boutique" },
        recipient: { msisdn: payout.msisdn },
        metadata: { payout_id: id, store_id: storeId },
      }),
    });
  } catch (err) {
    await ctx.runMutation(internal.payouts.patch, { id, status: "failed", failureReason: describeFetchError(err, "retrait") });
    return { ok: false, error: "Moneroo ne répond pas. Aucun argent n'a été envoyé, réessaie dans un instant." };
  }
  const body = await readJson(res);
  const monerooId = str(body, ["data", "id"]);
  if (!res.ok || !monerooId) {
    const reason = str(body, ["message"]) ?? `HTTP ${res.status}`;
    await ctx.runMutation(internal.payouts.patch, { id, status: "failed", failureReason: reason });
    const funds = /enough funds|insufficient/i.test(reason);
    return {
      ok: false,
      error: funds
        ? "Fonds insuffisants chez Moneroo pour ce pays : ses frais d'encaissement réduisent le solde réel. Réessaie avec un montant un peu plus bas."
        : `Retrait refusé par Moneroo : ${reason}`,
    };
  }
  await ctx.runMutation(internal.payouts.patch, { id, status: "pending", monerooPayoutId: monerooId });
  for (const delay of [60_000, 5 * 60_000, 30 * 60_000]) await ctx.scheduler.runAfter(delay, internal.payouts.verify, { id });
  return { ok: true, id };
}

function monerooKey() {
  const key = process.env.MONEROO_SECRET_KEY;
  if (!key) throw new ConvexError("Moneroo n'est pas configuré (clé API manquante).");
  return key;
}

function cameroonKey() {
  const key = process.env.SASPAY_SECRET_KEY;
  if (!key) throw new ConvexError("Le prestataire CEMAC n'est pas configuré (clé API manquante).");
  return key;
}

/** Crée le retrait puis l'envoie au bon prestataire selon le réseau de la destination. */
async function sendPayout(ctx: ActionCtx, storeId: Id<"stores">, item: PayoutItem, adminEmail: string): Promise<SendResult> {
  let id: Id<"payouts">;
  try {
    id = await ctx.runMutation(internal.payouts.create, { storeId, ...item });
  } catch (e) {
    return { ok: false, error: e instanceof ConvexError ? String(e.data) : "Retrait impossible." };
  }
  const payout = (await ctx.runQuery(internal.payouts.get, { id }))!;
  return isSaspayMethod(payout.method) ? sendCameroonPayout(ctx, id, cameroonKey()) : sendMonerooPayout(ctx, id, storeId, adminEmail, monerooKey());
}

export const request = action({
  args: { storeId: v.id("stores"), password: v.string(), destinationId: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, { storeId, password, ...item }): Promise<{ id: Id<"payouts"> }> => {
    const adminEmail = await requirePassword(ctx, password, storeId);
    const r = await sendPayout(ctx, storeId, item, adminEmail);
    if (!r.ok) throw new ConvexError(r.error);
    return { id: r.id };
  },
});

/**
 * Retrait groupé : un retrait par pays (chaque pays vers un numéro de ce pays), en une seule confirmation.
 * Les pays sont traités indépendamment : l'échec de l'un n'annule pas les autres.
 */
export const requestBatch = action({
  args: { storeId: v.id("stores"), password: v.string(), items: v.array(v.object({ destinationId: v.string(), amount: v.number(), currency: v.string() })) },
  handler: async (ctx, { storeId, password, items }): Promise<{ destinationId: string; ok: boolean; error?: string }[]> => {
    if (items.length === 0) throw new ConvexError("Aucun retrait sélectionné.");
    if (items.length > 12) throw new ConvexError("Trop de retraits à la fois.");
    const adminEmail = await requirePassword(ctx, password, storeId);
    const out = [];
    for (const item of items) {
      const r = await sendPayout(ctx, storeId, item, adminEmail);
      out.push({ destinationId: item.destinationId, ok: r.ok, error: r.ok ? undefined : r.error });
    }
    return out;
  },
});

/** Source de vérité Moneroo : GET /payouts/{id}/verify (vérifications planifiées et webhook). */
async function verifyMonerooPayout(ctx: ActionCtx, id: Id<"payouts">, monerooId: string) {
  const key = process.env.MONEROO_SECRET_KEY;
  if (!key) return;
  try {
    const res = await fetchWithTimeout(`${MONEROO_API_URL}/payouts/${monerooId}/verify`, { method: "GET", headers: buildAuthHeaders(key) });
    const body = await readJson(res);
    const status = str(body, ["data", "status"]);
    if (status === "success") await ctx.runMutation(internal.payouts.patch, { id, status: "success" });
    else if (status === "failed") {
      await ctx.runMutation(internal.payouts.patch, {
        id,
        status: "failed",
        failureReason: str(body, ["data", "disburse", "failure_message"]) ?? "Retrait échoué",
      });
    }
  } catch (err) {
    console.error("[payout verify]", describeFetchError(err, "vérification retrait"));
  }
}

/** Source de vérité CEMAC : GET /payouts/{id}/verify/. */
async function verifyCameroonPayout(ctx: ActionCtx, id: Id<"payouts">, txId: string) {
  const key = process.env.SASPAY_SECRET_KEY;
  if (!key) return;
  try {
    const res = await cmFetch(`${SASPAY_API_URL}/payouts/${txId}/verify/`, { method: "GET", headers: cmAuthHeaders(key) });
    const body = await cmReadJson(res);
    const status = cmStr(body, ["status"]) ?? cmStr(body, ["data", "status"]);
    if (status === "SUCCESS") await ctx.runMutation(internal.payouts.patch, { id, status: "success" });
    else if (status === "FAILED") await ctx.runMutation(internal.payouts.patch, { id, status: "failed", failureReason: "Retrait refusé" });
  } catch (err) {
    console.error("[cameroon payout verify]", cmDescribeFetchError(err, "vérification retrait"));
  }
}

/** Appelé par les vérifications planifiées et le webhook, pour l'un ou l'autre prestataire. */
export const verify = internalAction({
  args: { id: v.id("payouts") },
  handler: async (ctx, { id }) => {
    const p = await ctx.runQuery(internal.payouts.get, { id });
    if (!p || !IN_FLIGHT.has(p.status)) return;
    if (p.saspayPayoutId) await verifyCameroonPayout(ctx, id, p.saspayPayoutId);
    else if (p.monerooPayoutId) await verifyMonerooPayout(ctx, id, p.monerooPayoutId);
  },
});

export type PayoutRow = Doc<"payouts">;

/**
 * Rapprochement : enregistre un retrait fait directement sur le tableau de bord du prestataire
 * (hors de l'app), pour que le solde disponible ne soit pas retirable une seconde fois.
 */
export const recordExternal = internalMutation({
  args: { storeId: v.id("stores"), amount: v.number(), currency: v.string(), country: v.string(), label: v.string() },
  handler: async (ctx, { storeId, amount, currency, country, label }) => {
    if (!(amount > 0)) throw new Error("Montant invalide");
    return await ctx.db.insert("payouts", {
      storeId,
      amount,
      currency,
      method: "manual",
      country,
      msisdn: "—",
      label,
      status: "success",
      provider: "saspay",
      completedAt: Date.now(),
    });
  },
});
