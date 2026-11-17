import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { monerooWebhook, cameroonPayinWebhook } from "./payments/webhooks";
import { z } from "zod";
import { UAParser } from "ua-parser-js";
import { isbot } from "isbot";
import { TRACK_EVENTS } from "./lib/validators";
import { sameSig, sign } from "./lib/sign";

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

export default http;
