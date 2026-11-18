import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ConvexError } from "convex/values";
import { auth } from "./auth";
import { monerooWebhook, cameroonPayinWebhook } from "./payments/webhooks";
import { z } from "zod";
import { UAParser } from "ua-parser-js";
import { isbot } from "isbot";
import { TRACK_EVENTS } from "./lib/validators";
import { sameSig, sign } from "./lib/sign";
import { sha256Hex } from "./odin";

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({ path: "/webhooks/moneroo", method: "POST", handler: monerooWebhook });
http.route({ path: "/webhooks/cameroon-payin", method: "POST", handler: cameroonPayinWebhook });

/**
 * Téléchargement d'un fichier acheté : /download?s=<saleId>&k=<accessKey>&f=<index>
 * Vérifie la clé et la révocation à chaque clic, puis redirige vers l'URL de stockage.
 */
http.route({
  path: "/download",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const fallback = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    const r = await ctx.runQuery(internal.access.resolveDownload, {
      saleId: url.searchParams.get("s") ?? "",
      key: url.searchParams.get("k") ?? "",
      index: url.searchParams.get("f") ?? "0",
    });
    if (!r.ok) {
      return Response.redirect(`${r.baseUrl ?? fallback}/acces-indisponible?raison=${r.reason}`, 302);
    }
    await ctx.runMutation(internal.sales.countDownload, { saleId: r.saleId });
    const fileUrl = await ctx.storage.getUrl(r.storageId);
    if (!fileUrl) return Response.redirect(`${r.baseUrl || fallback}/acces-indisponible?raison=fichier`, 302);
    return Response.redirect(fileUrl, 302);
  }),
});

// ── Tracking maison ──────────────────────────────────────────────────────

const short = (n: number) => z.string().trim().max(n);
const batchSchema = z.object({
  storeId: short(40),
  key: z.string().regex(/^[a-z0-9]{12,40}$/),
  visitorId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  isNew: z.boolean(),
  landing: short(200),
  referrer: short(300).optional(),
  source: short(60).optional(),
  campaign: short(80).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  events: z
    .array(
      z.object({
        type: z.enum(TRACK_EVENTS),
        path: short(200),
        productId: short(40).optional(),
        at: z.number().int(),
        props: z
          .object({
            field: z.enum(["name", "email", "phone", "promo", "currency"]).optional(),
            depth: z.number().int().min(0).max(100).optional(),
            seconds: z.number().int().min(0).max(3600).optional(),
            file: short(120).optional(),
            on: z.boolean().optional(),
            ok: z.boolean().optional(),
            error: z.enum(["invalid_name", "invalid_email", "invalid_phone", "country_blocked", "store_closed", "out_of_stock", "server"]).optional(),
          })
          .optional(),
      }),
    )
    .min(1)
    .max(50),
});

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

function sourceOf(b: z.infer<typeof batchSchema>, host: string | null) {
  if (b.source) return b.source.toLowerCase();
  if (!b.referrer) return undefined;
  try {
    const h = new URL(b.referrer).hostname.replace(/^www\./, "").replace(/^(m|l|lm)\./, "");
    if (host && h === host.replace(/^www\./, "")) return undefined; // navigation interne
    return h;
  } catch {
    return undefined;
  }
}

/** Lot d'événements envoyé par navigator.sendBeacon (texte JSON, pas de pré-vol CORS). */
http.route({
  path: "/t/e",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const ua = request.headers.get("user-agent") ?? "";
    if (!ua || isbot(ua)) return new Response(null, { status: 204, headers: cors });
    const raw = await request.text();
    if (raw.length > 20_000) return new Response(null, { status: 413, headers: cors });
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return new Response(null, { status: 400, headers: cors });
    }
    const parsed = batchSchema.safeParse(json);
    if (!parsed.success) return new Response(null, { status: 400, headers: cors });
    const b = parsed.data;
    const r = new UAParser(ua).getResult();
    const device = r.device.type === "mobile" ? "Mobile" : r.device.type === "tablet" ? "Tablette" : "Ordinateur";
    let origin: string | null = null;
    try {
      origin = new URL(request.headers.get("origin") ?? request.headers.get("referer") ?? "").hostname;
    } catch {}
    await ctx.runMutation(internal.tracking.ingest, {
      storeId: b.storeId,
      key: b.key,
      visitorId: b.visitorId,
      isNew: b.isNew,
      device,
      browser: r.browser.name,
      os: r.os.name,
      landing: b.landing,
      source: sourceOf(b, origin),
      campaign: b.campaign,
      country: b.country,
      events: b.events,
    });
    return new Response(null, { status: 204, headers: cors });
  }),
});
http.route({ path: "/t/e", method: "OPTIONS", handler: httpAction(async () => new Response(null, { status: 204, headers: cors })) });

const GIF = Uint8Array.from(atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"), (c) => c.charCodeAt(0));

/** Pixel d'ouverture des emails de relance : /t/o?l=<logId>&s=<signature> */
http.route({
  path: "/t/o",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const l = url.searchParams.get("l") ?? "";
    if (l && sameSig(url.searchParams.get("s") ?? "", await sign("open", l))) await ctx.runMutation(internal.tracking.emailOpened, { logId: l });
    return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
  }),
});

/** Clic dans un email de relance : /t/c?l=<logId>&u=<url>&s=<signature> → redirection vérifiée (pas de redirection ouverte). */
http.route({
  path: "/t/c",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const l = url.searchParams.get("l") ?? "";
    const u = url.searchParams.get("u") ?? "";
    const fallback = (process.env.SITE_URL ?? "/").replace(/\/$/, "") || "/";
    if (!l || !/^https?:\/\//.test(u) || !sameSig(url.searchParams.get("s") ?? "", await sign("click", `${l}|${u}`))) {
      return Response.redirect(fallback, 302);
    }
    await ctx.runMutation(internal.tracking.emailClicked, { logId: l });
    return Response.redirect(u, 302);
  }),
});

// ── Worker WhatsApp (service séparé) ─────────────────────────────────────
// Authentifié par un secret partagé (WA_WORKER_SECRET). Toute la logique anti-bannissement est dans convex/whatsapp.ts.

function waAuthorized(request: Request) {
  const secret = process.env.WA_WORKER_SECRET;
  const given = request.headers.get("x-wa-secret") ?? "";
  return Boolean(secret) && secret!.length >= 24 && sameSig(given, secret!);
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const waResultSchema = z.object({ id: z.string().min(1), outcome: z.enum(["sent", "failed", "not_on_whatsapp"]), error: z.string().max(300).optional() });
const waHeartbeatSchema = z.object({ connected: z.boolean(), phone: z.string().max(30).optional(), pauseReason: z.string().max(200).optional() });
const waInboundSchema = z.object({ from: z.string().regex(/^\d{8,18}$/), text: z.string().max(1000) });

for (const route of ["claim", "result", "heartbeat", "inbound"] as const) {
  http.route({
    path: `/wa/${route}`,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      if (!waAuthorized(request)) return json({ error: "unauthorized" }, 401);
      let body: unknown = {};
      try {
        body = await request.json();
      } catch {
        if (route !== "claim") return json({ error: "invalid json" }, 400);
      }
      if (route === "claim") return json(await ctx.runMutation(internal.whatsapp.claim, {}));
      if (route === "result") {
        const p = waResultSchema.safeParse(body);
        if (!p.success) return json({ error: "invalid" }, 400);
        const id = await ctx.runQuery(internal.whatsapp.normalizeId, { id: p.data.id });
        if (!id) return json({ error: "unknown id" }, 400);
        await ctx.runMutation(internal.whatsapp.result, { id, outcome: p.data.outcome, error: p.data.error });
        return json({ ok: true });
      }
      if (route === "heartbeat") {
        const p = waHeartbeatSchema.safeParse(body);
        if (!p.success) return json({ error: "invalid" }, 400);
        await ctx.runMutation(internal.whatsapp.heartbeat, p.data);
        return json({ ok: true });
      }
      const p = waInboundSchema.safeParse(body);
      if (!p.success) return json({ error: "invalid" }, 400);
      return json(await ctx.runMutation(internal.whatsapp.inbound, p.data));
    }),
  });
}

// ── API OdiN : /api/v1/… avec « Authorization: Bearer chw_… » (clé créée dans Paramètres → OdiN) ──
// GET  /api/v1/me                      → boutiques du propriétaire de la clé
// POST /api/v1/upload-url              → adresse d'envoi d'un fichier (POST du fichier brut → { storageId })
// GET  /api/v1/files/<storageId>       → { url } lien public d'un fichier envoyé (images à placer dans la description)
// POST /api/v1/products                → { store_id, title, ...champs } crée une fiche (brouillon)
// GET  /api/v1/products/<id>           → fiche, lien public, nombre de ventes
// POST /api/v1/products/<id>           → { ...champs } met à jour (titre, description HTML, prix, galerie, fichiers, FAQ…)
// POST /api/v1/products/<id>/publish   → publie ; /unpublish → repasse en brouillon
//      (publier le premier produit ouvre aussi la boutique si elle est en pause)
// POST /api/v1/stores/<id>/activate    → ouvre la boutique ; /pause → la met en pause
// GET  /api/v1/sales?store_id=&since=&status=&limit=
// POST /api/v1/sales/<id>/refund       → { amount?, reason? }
const apiCors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const apiJson = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...apiCors } });

/** Champs de fiche acceptés par l'API (noms en snake_case côté OdiN → noms internes). */
function productFields(body: Record<string, unknown>) {
  const map: Record<string, string> = {
    title: "title", tagline: "tagline", description: "description", price: "price", compare_at_price: "compareAtPrice",
    cover_storage_id: "coverId", gallery: "gallery", files: "files", testimonials: "testimonials", faq: "faq", guarantee: "guarantee",
    promo: "promo", show_sales_count: "showSalesCount", countries: "countries", seo_title: "seoTitle", seo_description: "seoDescription",
    preview_pages: "previewPages", stock_limit: "stockLimit", cta: "cta", slug: "slug",
  };
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(body)) if (map[k] && val !== undefined) out[map[k]] = val;
  return out;
}

const apiHandler = httpAction(async (ctx, request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: apiCors });
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!/^chw_[A-Za-z0-9_-]{20,}$/.test(token)) return apiJson({ error: "Clé d'API manquante ou invalide." }, 401);
  
  const ownerId = await ctx.runMutation(internal.odin.authenticate, { hash: await sha256Hex(token) });
  if (!ownerId) return apiJson({ error: "Clé d'API inconnue ou révoquée." }, 401);

  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/v1\/?/, "").split("/").filter(Boolean);
  let body: Record<string, unknown> = {};
  if (request.method === "POST") {
    try {
      const raw: unknown = await request.json();
      if (raw && typeof raw === "object" && !Array.isArray(raw)) body = raw as Record<string, unknown>;
    } catch {
      /* corps vide accepté */
    }
  }
  try {
    const [a, id, sub] = parts;
    if (request.method === "GET" && a === "me") return apiJson(await ctx.runMutation(internal.odin.apiMe, { ownerId }));
    if (request.method === "POST" && a === "upload-url") return apiJson(await ctx.runMutation(internal.odin.apiUploadUrl, { ownerId }));
    if (request.method === "GET" && a === "files" && id) {
      let fileUrl: string | null = null;
      try {
        fileUrl = await ctx.storage.getUrl(id as Id<"_storage">);
      } catch {
        fileUrl = null;
      }
      if (!fileUrl) return apiJson({ error: "Fichier introuvable." }, 404);
      return apiJson({ url: fileUrl });
    }
    if (a === "products") {
      if (request.method === "POST" && !id) {
        const created = await ctx.runMutation(internal.odin.apiCreateProduct, { ownerId, storeId: String(body.store_id ?? ""), title: String(body.title ?? "") });
        const fields = productFields(body);
        delete fields.title;
        if (Object.keys(fields).length) await ctx.runMutation(internal.odinApiUpdate.run, { ownerId, productId: created.id, fields: fields as never });
        return apiJson(await ctx.runMutation(internal.odin.apiGetProduct, { ownerId, productId: created.id }), 201);
      }
      if (id && request.method === "GET" && !sub) return apiJson(await ctx.runMutation(internal.odin.apiGetProduct, { ownerId, productId: id }));
      if (id && request.method === "POST" && !sub) {
        await ctx.runMutation(internal.odinApiUpdate.run, { ownerId, productId: id, fields: productFields(body) as never });
        return apiJson(await ctx.runMutation(internal.odin.apiGetProduct, { ownerId, productId: id }));
      }
      if (id && request.method === "POST" && (sub === "publish" || sub === "unpublish")) {
        return apiJson(await ctx.runMutation(internal.odin.apiSetStatus, { ownerId, productId: id, status: sub === "publish" ? "published" : "draft" }));
      }
    }
    if (a === "stores" && id && request.method === "POST" && (sub === "activate" || sub === "pause")) {
      return apiJson(await ctx.runMutation(internal.odin.apiSetStoreStatus, { ownerId, storeId: id, status: sub === "activate" ? "active" : "paused" }));
    }
    if (a === "sales") {
      if (request.method === "GET" && !id) {
        const since = Number(url.searchParams.get("since") ?? "");
        const limit = Number(url.searchParams.get("limit") ?? "");
        return apiJson({
          data: await ctx.runMutation(internal.odin.apiListSales, {
            ownerId,
            storeId: url.searchParams.get("store_id") ?? "",
            since: Number.isFinite(since) && since > 0 ? since : undefined,
            status: url.searchParams.get("status") ?? undefined,
            limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
          }),
        });
      }
      if (id && sub === "refund" && request.method === "POST") {
        const amount = typeof body.amount === "number" ? body.amount : undefined;
        const reason = typeof body.reason === "string" ? body.reason : undefined;
        return apiJson(await ctx.runMutation(internal.odin.apiRefund, { ownerId, saleId: id, amount, reason }));
      }
    }
    return apiJson({ error: "Route inconnue." }, 404);
  } catch (err) {
    const msg = err instanceof ConvexError ? String(err.data) : "Requête refusée (champs invalides ?).";
    if (!(err instanceof ConvexError)) console.error("[api odin]", err);
    return apiJson({ error: msg }, 400);
  }
});
for (const method of ["GET", "POST", "OPTIONS"] as const) http.route({ pathPrefix: "/api/v1/", method, handler: apiHandler });

export default http;
