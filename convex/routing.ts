import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAdmin } from "./lib/auth";
import { saspayApiUrl, buildAuthHeaders, fetchWithTimeout, readJson } from "./payments/saspay_client";

/**
 * Routage des paiements : pour un pays (et un moyen de paiement choisi par l'acheteur), quel prestataire utiliser ?
 *
 *  - Catalogue SasPay : synchronisé depuis son API (pays + réseaux), jamais saisi à la main.
 *  - Catalogue Moneroo : table monerooMethods (catalogue GÉNÉRAL de Moneroo — pas forcément activé sur notre compte).
 *  - « Mémoire » : quand Moneroo refuse un moyen à l'initialisation (« not enabled »), on le note quelques heures (providerProbes)
 *    pour ne plus le proposer ni l'essayer, et on bascule sur SasPay.
 *  - Santé : si un moyen enchaîne les erreurs de passerelle sans aucun succès, il est mis de côté au profit de l'autre prestataire.
 *
 * Ordre de préférence : Moneroo d'abord (frais plus bas pour l'acheteur), SasPay en repli.
 */

export type Provider = "moneroo" | "saspay";

const PROBE_TTL_MS = 6 * 3_600_000;
const HEALTH_WINDOW_MS = 48 * 3_600_000;
const HEALTH_MIN_FAILS = 3;
/** Erreurs de PASSERELLE (pas un refus de l'acheteur) : réseau indisponible, erreur interne, délai dépassé… */
const GATEWAY_ERROR = /unavailable|internal error|gateway|timed? ?out|ne répond pas|temporar|not (enabled|compatible)|502|503|504/i;
export const isGatewayError = (message: string | undefined) => GATEWAY_ERROR.test(message ?? "");

// ── Synchronisation du catalogue SasPay ─────────────────────────────────

export const replaceSaspayNetworks = internalMutation({
  args: {
    networks: v.array(v.object({ code: v.string(), name: v.string(), country: v.string(), currency: v.string(), active: v.boolean() })),
  },
  handler: async (ctx, { networks }) => {
    const now = Date.now();
    const existing = new Map((await ctx.db.query("saspayNetworks").collect()).map((n) => [n.code, n]));
    for (const n of networks) {
      const prev = existing.get(n.code);
      if (prev) {
        await ctx.db.patch(prev._id, { ...n, updatedAt: now });
        existing.delete(n.code);
      } else {
        await ctx.db.insert("saspayNetworks", { ...n, updatedAt: now });
      }
    }
    // Réseaux retirés par SasPay : désactivés (on garde l'historique)
    for (const gone of existing.values()) await ctx.db.patch(gone._id, { active: false, updatedAt: now });
  },
});

type Raw = { id?: string; iso_code?: string; default_currency?: string; code?: string; name?: string; country?: string; is_active?: boolean };

function listOf(body: unknown): Raw[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return data as Raw[];
  const results = (data as { results?: unknown } | undefined)?.results;
  return Array.isArray(results) ? (results as Raw[]) : [];
}

export const syncSaspay = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const key = process.env.SASPAY_SECRET_KEY;
    if (!key) return "SasPay non configuré";
    try {
      const get = async (path: string) => {
        const res = await fetchWithTimeout(`${saspayApiUrl()}/${path}`, { method: "GET", headers: buildAuthHeaders(key) });
        if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
        return await readJson(res);
      };
      const countries = new Map(listOf(await get("countries/?page_size=500")).map((c) => [c.id, c]));
      const networks = listOf(await get("networks/?page_size=500"))
        .map((n) => {
          const c = countries.get(n.country);
          if (!n.code || !n.name || !c?.iso_code || !c.default_currency || n.code === "internal_adjustment") return null;
          return { code: n.code, name: n.name, country: c.iso_code.toUpperCase(), currency: c.default_currency.toUpperCase(), active: n.is_active !== false && c.id !== undefined };
        })
        .filter((n): n is NonNullable<typeof n> => n !== null);
      if (networks.length === 0) throw new Error("catalogue vide");
      await ctx.runMutation(internal.routing.replaceSaspayNetworks, { networks });
      return `saspay: ${networks.length} réseaux`;
    } catch (e) {
      console.error("[routing] sync SasPay", e);
      return "saspay: échec";
    }
  },
});

// ── Mémoire des refus ────────────────────────────────────────────────────

export const noteProbe = internalMutation({
  args: { provider: v.union(v.literal("moneroo"), v.literal("saspay")), code: v.string(), enabled: v.boolean(), reason: v.optional(v.string()) },
  handler: async (ctx, { provider, code, enabled, reason }) => {
    const row = await ctx.db.query("providerProbes").withIndex("by_provider_code", (q) => q.eq("provider", provider).eq("code", code)).first();
    const doc = { provider, code, enabled, checkedAt: Date.now(), reason: reason?.slice(0, 200) };
    if (row) await ctx.db.patch(row._id, doc);
    else await ctx.db.insert("providerProbes", doc);
  },
});

/** Un refus « moyen non activé » reconnu dans la réponse d'initialisation de Moneroo. */
export const isNotEnabledError = (message: string) => /not (enabled|compatible)|incompatible methods/i.test(message);

// ── Lecture : disponibilité et santé ─────────────────────────────────────

async function probeDisabled(ctx: QueryCtx, provider: Provider, code: string, now: number) {
  const row = await ctx.db.query("providerProbes").withIndex("by_provider_code", (q) => q.eq("provider", provider).eq("code", code)).first();
  return Boolean(row && !row.enabled && now - row.checkedAt < PROBE_TTL_MS);
}

/** Vrai si ce moyen enchaîne les erreurs de passerelle chez ce prestataire sans aucun succès récent. */
async function degraded(ctx: QueryCtx, provider: Provider, code: string, now: number) {
  const since = now - HEALTH_WINDOW_MS;
  const recent = await ctx.db.query("sales").withIndex("by_status", (q) => q.eq("status", "failed").gte("_creationTime", since)).order("desc").take(300);
  const paid = await ctx.db.query("sales").withIndex("by_status", (q) => q.eq("status", "paid").gte("_creationTime", since)).order("desc").take(300);
  const same = (s: Doc<"sales">) => (s.provider ?? "moneroo") === provider && (s.requestedMethod === code || s.methodCode === code);
  const fails = recent.filter((s) => same(s) && isGatewayError(s.failureReason));
  if (fails.length < HEALTH_MIN_FAILS) return false;
  const lastFail = Math.max(...fails.map((s) => s._creationTime));
  return !paid.some((s) => same(s) && s._creationTime > lastFail - HEALTH_WINDOW_MS / 4);
}

type Candidate = { provider: Provider; healthy: boolean };

/** Prestataires qui savent encaisser ce moyen dans ce pays, du plus au moins recommandé. */
async function providersFor(ctx: QueryCtx, country: string | undefined, code: string | undefined, now: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const methods = await ctx.db.query("monerooMethods").withIndex("by_kind", (q) => q.eq("kind", "payment")).collect();
  const m = code ? methods.find((x) => x.code === code && x.enabled) : undefined;
  const monerooKnows = code ? Boolean(m && (!country || m.countries.length === 0 || m.countries.includes(country))) : true;
  if (monerooKnows && !(code && (await probeDisabled(ctx, "moneroo", code, now)))) {
    out.push({ provider: "moneroo", healthy: !code || !(await degraded(ctx, "moneroo", code, now)) });
  }
  const nets = country ? await ctx.db.query("saspayNetworks").withIndex("by_country", (q) => q.eq("country", country)).collect() : [];
  const net = nets.find((n) => n.active && (!code || n.code === code));
  if (net && !(code && (await probeDisabled(ctx, "saspay", code, now)))) {
    out.push({ provider: "saspay", healthy: !code || !(await degraded(ctx, "saspay", code, now)) });
  }
  // Un prestataire en bonne santé passe devant ; à santé égale, l'ordre d'origine (Moneroo, puis SasPay) est conservé
  return out.sort((a, b) => Number(b.healthy) - Number(a.healthy));
}

/** Ordre d'essai pour une vente : appelé par checkout.start / retry. `exclude` = prestataire déjà tenté. */
export const plan = internalQuery({
  args: { country: v.optional(v.string()), method: v.optional(v.string()), exclude: v.optional(v.union(v.literal("moneroo"), v.literal("saspay"))) },
  handler: async (ctx, { country, method, exclude }): Promise<Provider[]> => {
    const list = await providersFor(ctx, country?.toUpperCase(), method, Date.now());
    const order = list.map((c) => c.provider).filter((p) => p !== exclude);
    // Aucun prestataire ne connaît ce pays/moyen : on tente Moneroo (comportement historique) plutôt que de bloquer l'achat
    return order.length ? order : exclude === "moneroo" ? [] : ["moneroo"];
  },
});

/** Moyens proposés à l'acheteur d'un pays : union des deux prestataires, sans les moyens que personne ne peut encaisser. */
export const methodsForCountry = query({
  args: { country: v.optional(v.string()) },
  handler: async (ctx, { country }) => {
    const c = country?.toUpperCase();
    if (!c) return [];
    const now = Date.now();
    const catalog = (await ctx.db.query("monerooMethods").withIndex("by_kind", (q) => q.eq("kind", "payment")).collect()).filter(
      (m) => m.enabled && !m.code.includes("sandbox") && !m.code.startsWith("moneroo_") && m.countries.includes(c),
    );
    const nets = (await ctx.db.query("saspayNetworks").withIndex("by_country", (q) => q.eq("country", c)).collect()).filter((n) => n.active);
    const codes = new Map<string, { code: string; name: string; iconUrl?: string; currency: string }>();
    for (const m of catalog) codes.set(m.code, { code: m.code, name: m.name, iconUrl: m.iconUrl, currency: m.currency });
    for (const n of nets) if (!codes.has(n.code)) codes.set(n.code, { code: n.code, name: n.name, currency: n.currency });
    const out = [];
    for (const m of codes.values()) {
      const providers = await providersFor(ctx, c, m.code, now);
      if (providers.length === 0) continue;
      out.push({ ...m, provider: providers[0]!.provider, healthy: providers[0]!.healthy });
    }
    // Mobile Money local d'abord, puis carte et crypto (moyens globaux)
    const rank = (code: string) => (code.startsWith("card") ? 2 : code.startsWith("crypto") ? 3 : 1);
    return out.sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name, "fr"));
  },
});

/** Pour le dashboard / le diagnostic : état du routage par moyen. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const probes = await ctx.db.query("providerProbes").collect();
    const nets = await ctx.db.query("saspayNetworks").collect();
    return { probes: probes.map((p) => ({ provider: p.provider, code: p.code, enabled: p.enabled, checkedAt: p.checkedAt, reason: p.reason })), saspayNetworks: nets.filter((n) => n.active).length };
  },
});
