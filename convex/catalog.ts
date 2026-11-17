import { action, internalAction, internalMutation, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireAdmin } from "./lib/auth";
import { fetchWithTimeout, readJson } from "./payments/moneroo_client";
import { SASPAY_NETWORKS } from "./payments/saspay_client";

// Endpoints publics (sans clé) — https://docs.moneroo.io/payments/available-methods
const CATALOG_URL = "https://api.moneroo.io/utils";
const FX_URL = "https://open.er-api.com/v6/latest/XOF";

type RawMethod = {
  short_code?: string;
  name?: string;
  icon_url?: string;
  is_enabled?: boolean;
  currency?: { code?: string } | string;
  countries?: { code?: string }[];
  fields?: { name?: string; label?: string; type?: string }[];
};

function normalize(m: RawMethod) {
  const currency = typeof m.currency === "string" ? m.currency : m.currency?.code;
  if (!m.short_code || !m.name || !currency) return null;
  return {
    code: m.short_code,
    name: m.name,
    iconUrl: m.icon_url,
    currency: currency.toUpperCase(),
    countries: (m.countries ?? []).map((c) => c.code?.toUpperCase()).filter((c): c is string => Boolean(c)),
    enabled: m.is_enabled !== false,
    fields: (m.fields ?? []).filter((f) => f.name).map((f) => ({ name: f.name!, label: f.label ?? f.name!, type: f.type ?? "string" })),
  };
}

export const replaceMethods = internalMutation({
  args: {
    kind: v.union(v.literal("payment"), v.literal("payout")),
    methods: v.array(
      v.object({
        code: v.string(),
        name: v.string(),
        iconUrl: v.optional(v.string()),
        currency: v.string(),
        countries: v.array(v.string()),
        enabled: v.boolean(),
        fields: v.array(v.object({ name: v.string(), label: v.string(), type: v.string() })),
      }),
    ),
  },
  handler: async (ctx, { kind, methods }) => {
    const existing = await ctx.db
      .query("monerooMethods")
      .withIndex("by_kind", (q) => q.eq("kind", kind))
      .collect();
    const byCode = new Map(existing.map((m) => [m.code, m]));
    for (const m of methods) {
      const prev = byCode.get(m.code);
      if (prev) {
        await ctx.db.patch(prev._id, m);
        byCode.delete(m.code);
      } else {
        await ctx.db.insert("monerooMethods", { kind, ...m });
      }
    }
    // Méthodes retirées par Moneroo : désactivées plutôt que supprimées (historique des ventes)
    for (const gone of byCode.values()) await ctx.db.patch(gone._id, { enabled: false });
  },
});

export const saveRates = internalMutation({
  args: { rates: v.record(v.string(), v.number()), source: v.string() },
  handler: async (ctx, { rates, source }) => {
    const row = await ctx.db.query("fxRates").first();
    const doc = { base: "XOF", rates, source, fetchedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, doc);
    else await ctx.db.insert("fxRates", doc);
  },
});

async function syncAllImpl(ctx: ActionCtx): Promise<string> {
  const report: string[] = [];
  for (const kind of ["payment", "payout"] as const) {
    try {
      const res = await fetchWithTimeout(`${CATALOG_URL}/${kind}/methods`, { method: "GET", headers: { Accept: "application/json" } });
      const body = (await readJson(res)) as { data?: RawMethod[] };
      const list = (Array.isArray(body.data) ? body.data : []).map(normalize).filter((m): m is NonNullable<ReturnType<typeof normalize>> => m !== null);
      if (!res.ok || list.length === 0) throw new Error(`HTTP ${res.status}`);
      await ctx.runMutation(internal.catalog.replaceMethods, { kind, methods: list });
      report.push(`${kind}: ${list.length}`);
    } catch (e) {
      console.error("[catalog]", kind, e);
      report.push(`${kind}: échec`);
    }
  }
  try {
    const res = await fetchWithTimeout(FX_URL, { method: "GET", headers: { Accept: "application/json" } });
    const body = (await readJson(res)) as { result?: string; rates?: Record<string, number> };
    if (body.result !== "success" || !body.rates) throw new Error("réponse invalide");
    await ctx.runMutation(internal.catalog.saveRates, { rates: body.rates, source: "open.er-api.com" });
    report.push(`fx: ${Object.keys(body.rates).length}`);
  } catch (e) {
    console.error("[fx]", e);
    report.push("fx: échec");
  }
  return report.join(" · ");
}

export const syncAll = internalAction({ args: {}, handler: async (ctx): Promise<string> => syncAllImpl(ctx) });

/** Bouton « Actualiser » des paramètres. */
export const refresh = action({
  args: {},
  handler: async (ctx): Promise<string> => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Non autorisé");
    return await syncAllImpl(ctx);
  },
});

// ── Lecture ─────────────────────────────────────────────────────────────

export const rates = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("fxRates").first();
    return row ? { rates: row.rates, fetchedAt: row.fetchedAt } : null;
  },
});

/** Méthodes de paiement actives pour un ensemble de pays (logos boutique + checkout). */
export const paymentMethods = query({
  args: { countries: v.optional(v.array(v.string())) },
  handler: async (ctx, { countries }) => {
    const all = await ctx.db
      .query("monerooMethods")
      .withIndex("by_kind", (q) => q.eq("kind", "payment"))
      .collect();
    const wanted = countries?.length ? new Set(countries.map((c) => c.toUpperCase())) : null;
    const moneroo = all
      .filter((m) => m.enabled && !m.code.includes("sandbox") && !m.code.startsWith("moneroo_"))
      .filter((m) => !wanted || m.countries.some((c) => wanted.has(c)))
      .map((m) => ({ code: m.code, name: m.name, iconUrl: m.iconUrl, currency: m.currency, countries: m.countries }));
    const cameroon = (!wanted || wanted.has("CM")
      ? Object.entries(SASPAY_NETWORKS).map(([code, net]) => ({ code, name: net.name, iconUrl: undefined, currency: net.currency, countries: [net.country] }))
      : []);
    return [...moneroo, ...cameroon];
  },
});

export const adminCatalog = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const all = await ctx.db.query("monerooMethods").collect();
    const fx = await ctx.db.query("fxRates").first();
    return {
      methods: all
        .filter((m) => !m.code.includes("sandbox"))
        .map((m) => ({ kind: m.kind, code: m.code, name: m.name, iconUrl: m.iconUrl, currency: m.currency, countries: m.countries, enabled: m.enabled })),
      fxFetchedAt: fx?.fetchedAt,
      currencies: fx ? Object.keys(fx.rates) : [],
    };
  },
});

/** Méthodes locales (Mobile Money, wallets…) : les méthodes globales (carte, crypto) couvrent 200+ pays. */
const isLocal = (m: { countries: string[] }) => m.countries.length > 0 && m.countries.length <= 10;

/**
 * Pays vendables, dérivés du catalogue Moneroo : pour chaque pays, sa devise d'encaissement
 * et ses moyens de paiement locaux. Sert au sélecteur de pays (boutique et produits).
 */
export const marketCountries = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query("monerooMethods")
      .withIndex("by_kind", (q) => q.eq("kind", "payment"))
      .collect();
    const methods = all.filter((m) => m.enabled && !m.code.includes("sandbox") && !m.code.startsWith("moneroo_"));
    const byCountry = new Map<string, { code: string; currencies: Set<string>; methods: { code: string; name: string; iconUrl?: string }[] }>();
    for (const m of methods.filter(isLocal)) {
      for (const c of m.countries) {
        const row = byCountry.get(c) ?? { code: c, currencies: new Set<string>(), methods: [] };
        row.currencies.add(m.currency);
        row.methods.push({ code: m.code, name: m.name, iconUrl: m.iconUrl });
        byCountry.set(c, row);
      }
    }
    // Pays couverts par le prestataire CEMAC (catalogue statique, hors Moneroo)
    for (const [code, net] of Object.entries(SASPAY_NETWORKS)) {
      const row = byCountry.get(net.country) ?? { code: net.country, currencies: new Set<string>(), methods: [] };
      row.currencies.add(net.currency);
      row.methods.push({ code, name: net.name });
      byCountry.set(net.country, row);
    }
    return {
      countries: [...byCountry.values()].map((r) => ({ code: r.code, currency: [...r.currencies][0], currencies: [...r.currencies], methods: r.methods })),
      // Paiement par carte disponible partout ?
      globalCard: methods.some((m) => !isLocal(m) && m.code.startsWith("card_")),
    };
  },
});
