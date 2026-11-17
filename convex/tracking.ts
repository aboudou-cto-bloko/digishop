import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireStore } from "./lib/auth";
import { trackEventV, type TrackEvent } from "./lib/validators";

const RETENTION_MS = 395 * 86_400_000; // 13 mois (annoncé dans la politique de confidentialité)
const LIVE_MS = 5 * 60_000;
// Convex limite une fonction à 16 384 documents lus : on reste en dessous (les plus récents d'abord)
const MAX_EVENTS = 11_000;
const MAX_SESSIONS = 4_000;

const propsV = v.optional(
  v.object({
    field: v.optional(v.string()),
    depth: v.optional(v.number()),
    seconds: v.optional(v.number()),
    file: v.optional(v.string()),
    on: v.optional(v.boolean()),
    ok: v.optional(v.boolean()),
    amount: v.optional(v.number()),
    // Code court de l'erreur vue par l'acheteur au paiement (jamais de donnée personnelle)
    error: v.optional(v.string()),
  }),
);

// ── Collecte (appelée par l'action HTTP /t/e) ─────────────────────────────

export const ingest = internalMutation({
  args: {
    storeId: v.string(),
    key: v.string(),
    visitorId: v.string(),
    isNew: v.boolean(),
    device: v.string(),
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    landing: v.string(),
    source: v.optional(v.string()),
    campaign: v.optional(v.string()),
    country: v.optional(v.string()),
    events: v.array(v.object({ type: trackEventV, path: v.string(), productId: v.optional(v.string()), props: propsV, at: v.number() })),
  },
  handler: async (ctx, a) => {
    const storeId = ctx.db.normalizeId("stores", a.storeId);
    if (!storeId || !(await ctx.db.get(storeId))) return;
    const now = Date.now();
    // Horodatage du navigateur borné : pas d'événement dans le futur ni vieux de plus d'une heure
    const events = a.events.map((e) => ({ ...e, at: Math.min(now, Math.max(now - 3_600_000, e.at)) })).filter((e) => e.type !== "purchase");
    if (!events.length) return;

    let session = await ctx.db
      .query("sessions")
      .withIndex("by_key", (q) => q.eq("key", a.key))
      .first();
    if (session && session.storeId !== storeId) return;
    const views = events.filter((e) => e.type === "page_view");
    const lastPath = views.length ? views[views.length - 1].path : events[events.length - 1].path;
    if (!session) {
      const id = await ctx.db.insert("sessions", {
        storeId,
        key: a.key,
        visitorId: a.visitorId,
        isNew: a.isNew,
        startedAt: events[0].at,
        lastSeenAt: now,
        pages: views.length,
        lastPath,
        landing: a.landing,
        device: a.device,
        browser: a.browser,
        os: a.os,
        country: a.country,
        source: a.source,
        campaign: a.campaign,
      });
      session = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(session._id, { lastSeenAt: now, pages: session.pages + views.length, lastPath, country: session.country ?? a.country });
    }
    for (const e of events) {
      const productId = e.productId ? ctx.db.normalizeId("products", e.productId) : null;
      await ctx.db.insert("events", {
        storeId,
        sessionId: session._id,
        visitorId: a.visitorId,
        type: e.type,
        path: e.path,
        productId: productId ?? undefined,
        props: e.props,
        at: e.at,
      });
    }
  },
});

/** Achat confirmé (côté serveur, jamais par le navigateur) : rattache la vente à la session d'origine. */
export async function trackPurchase(ctx: MutationCtx, sale: Doc<"sales">) {
  const key = sale.context.sessionKey;
  if (!key) return;
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (!session || session.storeId !== sale.storeId) return;
  await ctx.db.patch(session._id, { saleId: sale._id, lastSeenAt: Date.now() });
  await ctx.db.insert("events", {
    storeId: sale.storeId,
    sessionId: session._id,
    visitorId: session.visitorId,
    type: "purchase",
    path: "/merci",
    productId: sale.productId,
    props: { amount: sale.net },
    at: Date.now(),
  });
}

/** Cron quotidien : purge des données de plus de 13 mois (par lots). */
export const purge = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    const old = await ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(2000);
    for (const e of old) await ctx.db.delete(e._id);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_last", (q) => q.lt("lastSeenAt", cutoff))
      .take(1000);
    for (const s of sessions) await ctx.db.delete(s._id);
    return { events: old.length, sessions: sessions.length };
  },
});

// ── Emails de relance : ouverture + clic ─────────────────────────────────

export const emailOpened = internalMutation({
  args: { logId: v.string() },
  handler: async (ctx, { logId }) => {
    const id = ctx.db.normalizeId("emailLog", logId);
    const log = id ? await ctx.db.get(id) : null;
    if (!log) return;
    await ctx.db.patch(log._id, { opens: (log.opens ?? 0) + 1, openedAt: log.openedAt ?? Date.now() });
  },
});

export const emailClicked = internalMutation({
  args: { logId: v.string() },
  handler: async (ctx, { logId }) => {
    const id = ctx.db.normalizeId("emailLog", logId);
    const log = id ? await ctx.db.get(id) : null;
    if (!log) return;
    const now = Date.now();
    // Un clic implique une ouverture (images bloquées par la messagerie)
    await ctx.db.patch(log._id, { clicks: (log.clicks ?? 0) + 1, clickedAt: log.clickedAt ?? now, openedAt: log.openedAt ?? now, opens: Math.max(1, log.opens ?? 0) });
  },
});

// ── Dashboard ────────────────────────────────────────────────────────────

/** Visiteurs actifs (moins de 5 min), en temps réel. */
export const live = query({
  // `now` vient du navigateur (rafraîchi toutes les 15 s) : la fenêtre glisse même sans nouvelle donnée
  args: { storeId: v.id("stores"), now: v.number(), country: v.optional(v.string()) },
  handler: async (ctx, { storeId, now, country }) => {
    await requireStore(ctx, storeId);
    const since = Math.min(now, Date.now()) - LIVE_MS;
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_store_last", (q) => q.eq("storeId", storeId).gte("lastSeenAt", since))
        .collect()
    ).filter((s) => !country || s.country === country);
    const pages = new Map<string, number>();
    for (const s of sessions) pages.set(s.lastPath, (pages.get(s.lastPath) ?? 0) + 1);
    const productIds = [...new Set(sessions.map((s) => /^\/p\/([^/]+)/.exec(s.lastPath)?.[1]).filter((x): x is string => Boolean(x)))];
    const titles: Record<string, string> = {};
    for (const slug of productIds) {
      const p = await ctx.db
        .query("products")
        .withIndex("by_store_slug", (q) => q.eq("storeId", storeId).eq("slug", slug))
        .first();
      if (p) titles[`/p/${slug}`] = p.title;
    }
    return {
      count: sessions.length,
      inCheckout: sessions.filter((s) => s.lastPath.startsWith("/checkout")).length,
      pages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, n]) => ({ path, label: titles[path] ?? labelOf(path), n })),
      visitors: sessions
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
        .slice(0, 20)
        .map((s) => ({ id: s._id, country: s.country, device: s.device, source: s.source ?? "direct", path: s.lastPath, label: titles[s.lastPath] ?? labelOf(s.lastPath), pages: s.pages, since: s.startedAt, lastSeenAt: s.lastSeenAt, isNew: s.isNew })),
    };
  },
});

function labelOf(path: string) {
  if (path === "/") return "Accueil";
  if (path.startsWith("/checkout")) return "Paiement";
  if (path.startsWith("/merci")) return "Merci";
  if (path.startsWith("/pages/")) return "Page d'information";
  return path;
}

type Counter = Record<string, number>;
const bump = (c: Counter, k: string | undefined, n = 1) => {
  const key = k || "Inconnu";
  c[key] = (c[key] ?? 0) + n;
};
const top = (c: Counter, n = 6) =>
  Object.entries(c)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, value]) => ({ label, value }));

/** Comportement des visiteurs sur la période : appareils, engagement, aperçus, abandon par champ du paiement. */
export const behavior = query({
  args: { storeId: v.id("stores"), days: v.number(), country: v.optional(v.string()) },
  handler: async (ctx, { storeId, days, country }) => {
    await requireStore(ctx, storeId);
    const since = Date.now() - Math.min(days, 395) * 86_400_000;
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_store_started", (q) => q.eq("storeId", storeId).gte("startedAt", since))
        .order("desc")
        .take(MAX_SESSIONS)
    ).filter((s) => !country || s.country === country);
    const kept = new Set(sessions.map((s) => s._id));
    const rawEvents = await ctx.db
      .query("events")
      .withIndex("by_store_at", (q) => q.eq("storeId", storeId).gte("at", since))
      .order("desc")
      .take(MAX_EVENTS);
    const events = country ? rawEvents.filter((e) => kept.has(e.sessionId)) : rawEvents;

    const devices: Counter = {};
    const browsers: Counter = {};
    const oses: Counter = {};
    let fresh = 0;
    for (const s of sessions) {
      bump(devices, s.device);
      bump(browsers, s.browser);
      bump(oses, s.os);
      if (s.isNew) fresh++;
    }
    const bySession = new Map<Id<"sessions">, Doc<"events">[]>();
    for (const e of events) bySession.set(e.sessionId, [...(bySession.get(e.sessionId) ?? []), e]);

    // Profondeur de lecture et temps passé sur les fiches produit
    const productViews = events.filter((e) => e.type === "product_view").length;
    const reached = (d: number) => new Set(events.filter((e) => e.type === "scroll" && e.path.startsWith("/p/") && (e.props?.depth ?? 0) >= d).map((e) => `${e.sessionId}${e.path}`)).size;
    const times = events.filter((e) => e.type === "time_on_page" && e.path.startsWith("/p/")).map((e) => e.props?.seconds ?? 0);
    const avgTime = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

    // Abandon au paiement : dernier champ touché par les sessions qui ont ouvert le paiement sans payer
    const fieldDrop: Counter = {};
    let checkoutOpened = 0;
    let checkoutNoStart = 0;
    for (const evs of bySession.values()) {
      if (!evs.some((e) => e.type === "checkout_open")) continue;
      checkoutOpened++;
      if (evs.some((e) => e.type === "payment_start")) continue;
      checkoutNoStart++;
      const lastField = [...evs].reverse().find((e) => e.type === "checkout_field")?.props?.field;
      bump(fieldDrop, lastField ? FIELD_LABELS[lastField] ?? lastField : "Aucun champ rempli");
    }

    // Erreurs vues par les acheteurs au paiement : nombre de sessions touchées par type d'erreur
    const errorSessions = new Map<string, Set<string>>();
    for (const e of events) {
      if (e.type !== "checkout_error" || !e.props?.error) continue;
      const set = errorSessions.get(e.props.error) ?? new Set<string>();
      set.add(e.sessionId);
      errorSessions.set(e.props.error, set);
    }
    const checkoutErrors = [...errorSessions.entries()]
      .map(([k, set]) => ({ label: ERROR_LABELS[k] ?? k, value: set.size }))
      .sort((a, b) => b.value - a.value);

    // Délai entre la 1re visite et l'achat (sessions du même visiteur)
    const firstSeen = new Map<string, number>();
    for (const s of sessions) firstSeen.set(s.visitorId, Math.min(firstSeen.get(s.visitorId) ?? Infinity, s.startedAt));
    const delays = events.filter((e) => e.type === "purchase").map((e) => e.at - (firstSeen.get(e.visitorId) ?? e.at));
    const sortedDelays = [...delays].sort((a, b) => a - b);

    return {
      sessions: sessions.length,
      newVisitors: fresh,
      returning: sessions.length - fresh,
      pagesPerSession: sessions.length ? Math.round((sessions.reduce((a, s) => a + s.pages, 0) / sessions.length) * 10) / 10 : 0,
      devices: top(devices),
      browsers: top(browsers),
      os: top(oses),
      productViews,
      scroll50: reached(50),
      scroll90: reached(90),
      avgTimeOnProduct: avgTime,
      previewOpens: events.filter((e) => e.type === "preview_open").length,
      shares: events.filter((e) => e.type === "share").length,
      contacts: events.filter((e) => e.type === "contact").length,
      checkoutOpened,
      checkoutNoStart,
      fieldDrop: top(fieldDrop, 5),
      checkoutErrors,
      bumpChecked: events.filter((e) => e.type === "bump_toggle" && e.props?.on).length,
      couponTries: events.filter((e) => e.type === "coupon_apply").length,
      couponOk: events.filter((e) => e.type === "coupon_apply" && e.props?.ok).length,
      medianToPurchaseMs: sortedDelays.length ? sortedDelays[Math.floor(sortedDelays.length / 2)] : null,
      purchases: delays.length,
      truncated: rawEvents.length >= MAX_EVENTS || sessions.length >= MAX_SESSIONS,
    };
  },
});

const ERROR_LABELS: Record<string, string> = {
  invalid_name: "Nom invalide",
  invalid_email: "Email invalide",
  invalid_phone: "Numéro WhatsApp invalide",
  country_blocked: "Pays non couvert par le produit",
  store_closed: "Boutique fermée",
  out_of_stock: "Produit épuisé",
  server: "Erreur au paiement (serveur)",
};
const FIELD_LABELS: Record<string, string> = { name: "Nom", email: "Email", phone: "WhatsApp", promo: "Code promo", currency: "Devise" };

/** Entonnoir par produit : vues → aperçu → paiement ouvert → paiement lancé → achat (sessions uniques). */
export const productFunnels = query({
  args: { storeId: v.id("stores"), days: v.number(), country: v.optional(v.string()) },
  handler: async (ctx, { storeId, days, country }) => {
    await requireStore(ctx, storeId);
    const since = Date.now() - Math.min(days, 395) * 86_400_000;
    let events = await ctx.db
      .query("events")
      .withIndex("by_store_at", (q) => q.eq("storeId", storeId).gte("at", since))
      .order("desc")
      .take(MAX_EVENTS);
    if (country) {
      const kept = new Set(
        (
          await ctx.db
            .query("sessions")
            .withIndex("by_store_started", (q) => q.eq("storeId", storeId).gte("startedAt", since - 86_400_000))
            .order("desc")
            .take(MAX_SESSIONS)
        )
          .filter((s) => s.country === country)
          .map((s) => s._id),
      );
      events = events.filter((e) => kept.has(e.sessionId));
    }
    const steps: TrackEvent[] = ["product_view", "preview_open", "checkout_open", "payment_start", "purchase"];
    const per = new Map<Id<"products">, Record<string, Set<string>>>();
    for (const e of events) {
      if (!e.productId || !steps.includes(e.type)) continue;
      const row = per.get(e.productId) ?? Object.fromEntries(steps.map((s) => [s, new Set<string>()]));
      row[e.type].add(e.sessionId);
      per.set(e.productId, row);
    }
    const out = [];
    for (const [productId, row] of per) {
      const p = await ctx.db.get(productId);
      if (!p) continue;
      out.push({
        productId,
        title: p.title,
        views: row.product_view.size,
        previews: row.preview_open.size,
        checkouts: row.checkout_open.size,
        payments: row.payment_start.size,
        purchases: row.purchase.size,
      });
    }
    return out.sort((a, b) => b.views - a.views).slice(0, 12);
  },
});

/** Parcours d'un acheteur avant la vente : sessions du même visiteur, de la 1re visite à l'achat. */
export const journey = query({
  args: { storeId: v.id("stores"), saleId: v.id("sales") },
  handler: async (ctx, { storeId, saleId }) => {
    await requireStore(ctx, storeId);
    const sale = await ctx.db.get(saleId);
    if (!sale || sale.storeId !== storeId || !sale.context.sessionKey) return null;
    const key = sale.context.sessionKey;
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (!session) return null;
    const until = (sale.paidAt ?? sale._creationTime) + 10 * 60_000;
    const sessions = (
      await ctx.db
        .query("sessions")
        .withIndex("by_visitor", (q) => q.eq("visitorId", session.visitorId).lte("startedAt", until))
        .collect()
    )
      .filter((s) => s.storeId === storeId)
      .slice(-5);
    const steps = [];
    for (const s of sessions) {
      const evs = await ctx.db
        .query("events")
        .withIndex("by_session", (q) => q.eq("sessionId", s._id))
        .take(200);
      steps.push({
        sessionId: s._id,
        startedAt: s.startedAt,
        source: s.source ?? "direct",
        campaign: s.campaign,
        device: s.device,
        browser: s.browser,
        country: s.country,
        events: evs
          .filter((e) => e.type !== "scroll" && e.type !== "time_on_page" && e.type !== "checkout_field")
          .map((e) => ({ type: e.type, path: e.path, at: e.at, props: e.props })),
        maxScroll: Math.max(0, ...evs.filter((e) => e.type === "scroll").map((e) => e.props?.depth ?? 0)),
        seconds: evs.filter((e) => e.type === "time_on_page").reduce((a, e) => a + (e.props?.seconds ?? 0), 0),
      });
    }
    return { firstVisit: sessions[0]?.startedAt ?? session.startedAt, visits: sessions.length, sessions: steps };
  },
});
