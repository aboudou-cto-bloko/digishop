"use node";

import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import webpush from "web-push";
import type { Id } from "./_generated/dataModel";
import { pushEventV as eventV } from "./lib/validators";

type Payload = { title: string; body: string; url: string; tag: string };

function configure() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? `mailto:${process.env.ADMIN_EMAIL ?? "admin@example.com"}`, pub, priv);
  return true;
}

async function deliver(
  subs: { _id: Id<"pushSubscriptions">; endpoint: string; p256dh: string; auth: string }[],
  payload: Payload,
) {
  const ok: Id<"pushSubscriptions">[] = [];
  const gone: Id<"pushSubscriptions">[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86_400, urgency: "high" });
        ok.push(s._id);
      } catch (e) {
        const code = typeof e === "object" && e && "statusCode" in e ? Number((e as { statusCode: unknown }).statusCode) : 0;
        if (code === 404 || code === 410) gone.push(s._id);
        else console.warn("push:", code, e instanceof Error ? e.message : e);
      }
    }),
  );
  return { ok, gone };
}

/** Envoie une notification à tous les appareils abonnés à cet événement. */
export const notify = internalAction({
  args: { storeId: v.id("stores"), event: eventV, title: v.string(), body: v.string(), url: v.string(), tag: v.string() },
  handler: async (ctx, { storeId, event, ...payload }) => {
    if (!configure()) return;
    const subs = await ctx.runQuery(internal.push.targets, { event, storeId });
    if (!subs.length) return;
    const r = await deliver(subs, payload);
    await ctx.runMutation(internal.push.report, r);
  },
});

/** Bouton « Envoyer une notification de test » (un appareil précis ou tous). */
export const sendTest = action({
  args: { id: v.optional(v.id("pushSubscriptions")) },
  handler: async (ctx, { id }): Promise<{ sent: number; removed: number }> => {
    const user = await ctx.auth.getUserIdentity();
    if (!user) throw new ConvexError("Non autorisé");
    if (!configure()) throw new ConvexError("Clés VAPID manquantes sur le serveur (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).");
    const subs = await ctx.runQuery(internal.push.targets, { id, userId: user.subject.split("|")[0] as Id<"users"> });
    if (!subs.length) throw new ConvexError("Aucun appareil abonné.");
    const r = await deliver(subs, { title: "🔔 Notifications activées", body: "Tu seras prévenu ici à chaque vente.", url: "/admin", tag: "test" });
    await ctx.runMutation(internal.push.report, r);
    return { sent: r.ok.length, removed: r.gone.length };
  },
});
