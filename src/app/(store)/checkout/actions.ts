"use server";

import { headers } from "next/headers";
import { fetchAction } from "convex/nextjs";
import { ConvexError } from "convex/values";
import { z } from "zod";
import { countryFromPhone, isCountryCode } from "@/lib/geo";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const inputSchema = z.object({
  productId: z.string().min(1),
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  couponCode: z.string().optional(),
  withBump: z.boolean().optional(),
  currency: z.string().length(3).optional(),
  initiateEventId: z.string().max(80).optional(),
  method: z
    .string()
    .regex(/^[a-z0-9_]{2,40}$/)
    .optional(),
  context: z.object({
    lang: z.string().max(20).optional(),
    device: z.string().max(40).optional(),
    referrer: z.string().max(300).optional(),
    utmSource: z.string().max(60).optional(),
    utmCampaign: z.string().max(100).optional(),
    fbp: z.string().max(200).optional(),
    fbc: z.string().max(300).optional(),
    country: z.string().length(2).optional(), // détecté côté navigateur (fuseau horaire / choix du visiteur)
    sessionKey: z
      .string()
      .regex(/^[a-z0-9]{12,40}$/)
      .optional(), // session du tracking maison (parcours avant achat)
  }),
});

export type StartCheckoutResult = { ok: true; redirectUrl: string } | { ok: false; error: string };

/** Enrichit le contexte avec IP / user-agent / pays (utiles à la CAPI Meta), puis lance le paiement. */
export async function startCheckout(input: z.input<typeof inputSchema>): Promise<StartCheckoutResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Formulaire invalide." };
  const data = parsed.data;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || undefined;
  // Pays : indicatif du numéro (libphonenumber, là où se trouve le compte de paiement), sinon choix/détection du navigateur, sinon géolocalisation IP.
  // L'IP passe en dernier : un acheteur camerounais en roaming ou derrière un opérateur béninois sortait en « BJ » et était mal routé.
  const ipCountry = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? undefined;
  const candidates = [countryFromPhone(data.phone), data.context.country, ipCountry];
  const country = candidates.find((c) => isCountryCode(c))?.toUpperCase();

  try {
    const res = await fetchAction(api.checkout.start, {
      productId: data.productId as Id<"products">,
      name: data.name,
      email: data.email,
      phone: data.phone || undefined,
      couponCode: data.couponCode || undefined,
      withBump: data.withBump,
      currency: data.currency,
      initiateEventId: data.initiateEventId,
      method: data.method,
      context: { ...data.context, ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? undefined, country },
    });
    return { ok: true, redirectUrl: res.redirectUrl };
  } catch (err) {
    if (err instanceof ConvexError && typeof err.data === "string") return { ok: false, error: err.data };
    const msg = err instanceof Error ? err.message : "";
    const m = msg.match(/(?:ConvexError|Error): (.+?)(?:\n|$)/);
    console.error("[checkout]", msg);
    return { ok: false, error: m?.[1] ?? "Le paiement n'a pas pu démarrer. Réessaie dans un instant." };
  }
}
