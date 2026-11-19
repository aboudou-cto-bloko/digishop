import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireStore } from "./lib/auth";
import { dayKey, localHour } from "./lib/utils";
import { centroid } from "./lib/centroids";

// ── Collecte (appelée depuis la boutique publique) ──────────────────────

const short = (s: string | undefined, n: number) => (s ? s.slice(0, n) : undefined);
const iso = (c: string | undefined) => (c && /^[A-Z]{2}$/.test(c.toUpperCase()) ? c.toUpperCase() : undefined);

export const trackView = mutation({
  args: {
    storeId: v.id("stores"),
    path: v.string(),
    productId: v.optional(v.id("products")),
    visitorId: v.string(),
    source: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const country = iso(args.country);
    if (args.visitorId.length < 8 || args.visitorId.length > 64) return;
    if (!(await ctx.db.get(args.storeId))) return;
    if (args.productId) {
      const p = await ctx.db.get(args.productId);
      if (!p || p.storeId !== args.storeId) return;
    }
    const day = dayKey();
    const path = args.path.slice(0, 200);
    const existing = await ctx.db
      .query("pageviews")
      .withIndex("by_visitor_day_path", (q) =>
        q.eq("visitorId", args.visitorId).eq("day", day).eq("path", path),
      )
      .filter((q) => q.eq(q.field("storeId"), args.storeId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { count: existing.count + 1, ...(country && !existing.country ? { country } : {}) });
    } else {
      await ctx.db.insert("pageviews", {
        storeId: args.storeId,
        day,
        path,
        productId: args.productId,
        visitorId: args.visitorId,
        source: short(args.source, 40),
        country,
        count: 1,
      });
    }
  },
});

export const trackCheckoutStart = mutation({
  args: { productId: v.id("products"), visitorId: v.string(), country: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.visitorId.length < 8 || args.visitorId.length > 64) return;
    const product = await ctx.db.get(args.productId);
    if (!product) return;
    const day = dayKey();
    const dup = await ctx.db
      .query("checkoutStarts")
      .withIndex("by_store_day", (q) => q.eq("storeId", product.storeId).eq("day", day))
      .filter((q) => q.and(q.eq(q.field("visitorId"), args.visitorId), q.eq(q.field("productId"), args.productId)))
      .first();
    if (!dup) await ctx.db.insert("checkoutStarts", { productId: args.productId, visitorId: args.visitorId, country: iso(args.country), storeId: product.storeId, day });
  },
});

// ── Lecture (dashboard) ─────────────────────────────────────────────────

/** Source lisible : utm_source d'abord, sinon le domaine du referrer. */
export function sourceOf(ctx: Doc<"sales">["context"]): string {
  const raw = (ctx.utmSource ?? ctx.referrer ?? "").toLowerCase();
  if (!raw) return "Direct";
  if (/(facebook|fb\.|fbclid|instagram|ig$|meta)/.test(raw)) return raw.includes("insta") || raw === "ig" ? "Instagram" : "Facebook";
  if (raw.includes("tiktok")) return "TikTok";
  if (raw.includes("whatsapp") || raw.includes("wa.me")) return "WhatsApp";
  if (raw.includes("google")) return "Google";
  if (raw.includes("youtube")) return "YouTube";
  if (raw.includes("t.co") || raw.includes("twitter") || raw.includes("x.com")) return "X";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
  } catch {
    return raw.slice(0, 30);
  }
}

function normalizeSource(s: string | undefined): string {
  return sourceOf({ utmSource: s } as Doc<"sales">["context"]);
}

// Bornes de lecture (limite Convex : 16 384 documents par fonction, ventes comprises)
const MAX_VIEWS = 5000;

async function salesBetween(ctx: QueryCtx, storeId: Id<"stores">, from: number, to: number) {
  return await ctx.db
    .query("sales")
    .withIndex("by_store", (q) => q.eq("storeId", storeId).gte("_creationTime", from).lt("_creationTime", to))
    .take(2500);
}

function days(from: number, to: number): string[] {
  const out: string[] = [];
  for (let t = from; t < to; t += 86_400_000) out.push(dayKey(t));
  const last = dayKey(to - 1);
  if (out[out.length - 1] !== last) out.push(last);
  return [...new Set(out)];
}

function summarize(sales: Doc<"sales">[]) {
  const paid = sales.filter((s) => s.status === "paid" && !s.refund);
  const revenue = paid.reduce((a, s) => a + s.net, 0);
  const failed = sales.filter((s) => s.status === "failed");
  const abandoned = sales.filter((s) => s.status === "abandoned");
  const attempts = paid.length + failed.length + abandoned.length;
  return {
    revenue,
    paidCount: paid.length,
    avgBasket: paid.length ? Math.round(revenue / paid.length) : 0,
    totalSales: sales.length,
    failedCount: failed.length,
    abandonedCount: abandoned.length,
    lostRevenue: [...failed, ...abandoned].reduce((a, s) => a + s.net, 0),
    paymentSuccessRate: attempts ? paid.length / attempts : 0,
  };
}

export const overview = query({
  args: { storeId: v.id("stores"), from: v.number(), to: v.number(), country: v.optional(v.string()) },
  handler: async (ctx, { storeId, from, to, country: rawCountry }) => {
    await requireStore(ctx, storeId);
    const country = iso(rawCountry);
    const span = to - from;
    const [allSales, allPrevSales] = await Promise.all([
      salesBetween(ctx, storeId, from, to),
      salesBetween(ctx, storeId, from - span, from),
    ]);
    // Filtre pays : ventes par pays de l'acheteur, visites par pays du visiteur
    const inCountry = <T extends { country?: string }>(x: T) => !country || x.country === country;
    const sales = allSales.filter((s) => inCountry(s.context));
    const prevSales = allPrevSales.filter((s) => inCountry(s.context));
    const dayList = days(from, to);
    const prevDayList = days(from - span, from);

    const allViews = await ctx.db
      .query("pageviews")
      .withIndex("by_store_day", (q) => q.eq("storeId", storeId).gte("day", dayList[0]).lte("day", dayList[dayList.length - 1]))
      .take(MAX_VIEWS);
    const views = allViews.filter(inCountry);
    const prevViews = (
      await ctx.db
        .query("pageviews")
        .withIndex("by_store_day", (q) => q.eq("storeId", storeId).gte("day", prevDayList[0]).lte("day", prevDayList[prevDayList.length - 1]))
        .take(MAX_VIEWS)
    ).filter(inCountry);
    const starts = (
      await ctx.db
        .query("checkoutStarts")
        .withIndex("by_store_day", (q) => q.eq("storeId", storeId).gte("day", dayList[0]).lte("day", dayList[dayList.length - 1]))
        .take(2000)
    ).filter(inCountry);

    // Pays (toujours sur l'ensemble de la période, pour le globe et le sélecteur)
    const countryMap = new Map<string, { code: string; visitors: Set<string>; sales: number; revenue: number }>();
    const crow = (code: string) => {
      const r = countryMap.get(code) ?? { code, visitors: new Set<string>(), sales: 0, revenue: 0 };
      countryMap.set(code, r);
      return r;
    };
    for (const x of allViews) if (x.country) crow(x.country).visitors.add(x.visitorId);
    for (const s of allSales) {
      if (s.status !== "paid" || !s.context.country) continue;
      const r = crow(s.context.country);
      r.sales += 1;
      r.revenue += s.net;
    }
    const countries = [...countryMap.values()]
      .map((r) => ({ code: r.code, visitors: r.visitors.size, sales: r.sales, revenue: r.revenue, latlng: centroid(r.code) }))
      .sort((a, b) => b.revenue - a.revenue || b.visitors - a.visitors);
    const unknownVisitors = new Set(allViews.filter((x) => !x.country).map((x) => x.visitorId)).size;

    const cur = summarize(sales);
    const prev = summarize(prevSales);
    const visitors = new Set(views.map((x) => x.visitorId)).size;
    const prevVisitors = new Set(prevViews.map((x) => x.visitorId)).size;
    const pageviews = views.reduce((a, x) => a + x.count, 0);
    const checkoutVisitors = new Set(starts.map((x) => x.visitorId)).size;

    const paid = sales.filter((s) => s.status === "paid" && !s.refund);

    // Série journalière
    const byDay = new Map(dayList.map((d) => [d, { day: d, revenue: 0, sales: 0, visitors: new Set<string>() }]));
    for (const s of paid) {
      const row = byDay.get(dayKey(s.paidAt ?? s._creationTime)) ?? byDay.get(dayKey(s._creationTime));
      if (row) {
        row.revenue += s.net;
        row.sales += 1;
      }
    }
    for (const x of views) byDay.get(x.day)?.visitors.add(x.visitorId);
    const series = [...byDay.values()].map((r) => ({
      day: r.day,
      revenue: r.revenue,
      sales: r.sales,
      visitors: r.visitors.size,
    }));

    // Produits
    const productMap = new Map<string, { productId: string; title: string; revenue: number; sales: number; visitors: number }>();
    for (const s of paid) {
      const row = productMap.get(s.productId) ?? { productId: s.productId, title: s.productTitle, revenue: 0, sales: 0, visitors: 0 };
      row.revenue += s.net;
      row.sales += 1;
      productMap.set(s.productId, row);
    }
    const productVisitors = new Map<string, Set<string>>();
    for (const x of views) {
      if (!x.productId) continue;
      const set = productVisitors.get(x.productId) ?? new Set<string>();
      set.add(x.visitorId);
      productVisitors.set(x.productId, set);
    }
    for (const [pid, set] of productVisitors) {
      const row = productMap.get(pid);
      if (row) row.visitors = set.size;
      else {
        const p = await ctx.db.get(pid as Doc<"products">["_id"]);
        if (p) productMap.set(pid, { productId: pid, title: p.title, revenue: 0, sales: 0, visitors: set.size });
      }
    }
    const products = [...productMap.values()]
      .map((p) => ({ ...p, conversion: p.visitors ? Math.min(1, p.sales / p.visitors) : 0 }))
      .sort((a, b) => b.revenue - a.revenue || b.visitors - a.visitors)
      .slice(0, 8);

    // Sources : visiteurs (pageviews) + ventes réglées (contexte de la vente)
    const sourceMap = new Map<string, { source: string; visitors: Set<string>; sales: number; revenue: number }>();
    const src = (k: string) => {
      const row = sourceMap.get(k) ?? { source: k, visitors: new Set<string>(), sales: 0, revenue: 0 };
      sourceMap.set(k, row);
      return row;
    };
    for (const x of views) src(normalizeSource(x.source)).visitors.add(x.visitorId);
    for (const s of paid) {
      const row = src(sourceOf(s.context));
      row.sales += 1;
      row.revenue += s.net;
    }
    const sources = [...sourceMap.values()]
      .map((r) => ({ source: r.source, visitors: r.visitors.size, sales: r.sales, revenue: r.revenue }))
      .sort((a, b) => b.revenue - a.revenue || b.visitors - a.visitors)
      .slice(0, 6);

    // Moyens de paiement
    const methodMap = new Map<string, number>();
    for (const s of paid) methodMap.set(s.method ?? "Autre", (methodMap.get(s.method ?? "Autre") ?? 0) + 1);
    const methods = [...methodMap.entries()].map(([method, count]) => ({ method, count })).sort((a, b) => b.count - a.count);

    // Heures de vente (heure du Bénin)
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: h, sales: 0 }));
    for (const s of paid) hours[localHour(s.paidAt ?? s._creationTime)].sales += 1;

    // Pas de variation affichable quand la période précédente est vide (éviterait un « +100 % » trompeur)
    const pct = (a: number, b: number): number | null => (b ? (a - b) / b : null);

    return {
      kpis: {
        ...cur,
        visitors,
        pageviews,
        checkoutVisitors,
        conversion: visitors ? Math.min(1, cur.paidCount / visitors) : 0,
        newCustomers: new Set(paid.map((s) => s.customerId)).size,
      },
      deltas: {
        revenue: pct(cur.revenue, prev.revenue),
        paidCount: pct(cur.paidCount, prev.paidCount),
        avgBasket: pct(cur.avgBasket, prev.avgBasket),
        visitors: pct(visitors, prevVisitors),
        conversion: pct(visitors ? cur.paidCount / visitors : 0, prevVisitors ? prev.paidCount / prevVisitors : 0),
      },
      funnel: [
        { step: "Visiteurs", value: visitors },
        { step: "Checkout ouvert", value: checkoutVisitors },
        { step: "Paiement lancé", value: cur.totalSales },
        { step: "Ventes réglées", value: cur.paidCount },
      ],
      series,
      products,
      sources,
      methods,
      hours,
      countries,
      unknownVisitors,
      country: country ?? null,
    };
  },
});

/** Accueil du dashboard : chiffres « toujours vrais » + 7 derniers jours. */
export const home = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const paid = await ctx.db
      .query("sales")
      .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "paid"))
      .collect()
      .then((rows) => rows.filter((x) => !x.refund));
    const weekAgo = Date.now() - 7 * 86_400_000;
    const twoWeeksAgo = Date.now() - 14 * 86_400_000;
    const lastWeek = paid.filter((s) => (s.paidAt ?? s._creationTime) >= weekAgo);
    const weekBefore = paid.filter((s) => {
      const t = s.paidAt ?? s._creationTime;
      return t >= twoWeeksAgo && t < weekAgo;
    });
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_store_email", (q) => q.eq("storeId", storeId))
      .collect();
    const today = dayKey();
    const todayRevenue = paid.filter((s) => dayKey(s.paidAt ?? s._creationTime) === today).reduce((a, s) => a + s.net, 0);

    // Relances : échecs/abandons récents sans achat réussi derrière (même client, même produit)
    const recentLost = (
      await ctx.db
        .query("sales")
        .withIndex("by_store", (q) => q.eq("storeId", storeId).gte("_creationTime", weekAgo))
        .order("desc")
        .collect()
    ).filter((s) => s.status === "failed" || s.status === "abandoned");
    const paidKeys = new Set(paid.map((s) => `${s.customerId}:${s.productId}`));
    const seen = new Set<string>();
    const toFollowUp = recentLost
      .filter((s) => {
        const k = `${s.customerId}:${s.productId}`;
        if (paidKeys.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 5)
      .map((s) => ({
        _id: s._id,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        productTitle: s.productTitle,
        net: s.net,
        status: s.status,
        at: s._creationTime,
      }));

    return {
      totalRevenue: paid.reduce((a, s) => a + s.net, 0),
      todayRevenue,
      weekRevenue: lastWeek.reduce((a, s) => a + s.net, 0),
      weekRevenuePrev: weekBefore.reduce((a, s) => a + s.net, 0),
      weekSales: lastWeek.length,
      customers: customers.length,
      productsCount: (
        await ctx.db
          .query("products")
          .withIndex("by_store_status", (q) => q.eq("storeId", storeId))
          .collect()
      ).length,
      toFollowUp,
    };
  },
});

/** Page Revenus : brut, frais Moneroo, net, et détail par mois. */
export const revenue = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const paid = await ctx.db
      .query("sales")
      .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "paid"))
      .collect()
      .then((rows) => rows.filter((x) => !x.refund));
    const gross = paid.reduce((a, s) => a + s.net, 0);
    const fees = paid.reduce((a, s) => a + (s.fees ?? 0), 0);
    const months = new Map<string, { month: string; sales: number; gross: number; fees: number }>();
    for (const s of paid) {
      const m = dayKey(s.paidAt ?? s._creationTime).slice(0, 7);
      const row = months.get(m) ?? { month: m, sales: 0, gross: 0, fees: 0 };
      row.sales += 1;
      row.gross += s.net;
      row.fees += s.fees ?? 0;
      months.set(m, row);
    }
    return {
      gross,
      fees,
      net: gross - fees,
      count: paid.length,
      months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)),
    };
  },
});
