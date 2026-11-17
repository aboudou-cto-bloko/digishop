import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  MONEROO_API_URL,
  buildAuthHeaders,
  describeFetchError,
  fetchWithTimeout,
  num,
  readJson,
  str,
} from "./moneroo_client";
import { thankYouUrl } from "./shared";
export { thankYouUrl } from "./shared";

function secret(): string {
  const key = process.env.MONEROO_SECRET_KEY;
  if (!key) throw new Error("MONEROO_SECRET_KEY non configurée");
  return key;
}

type InitSale = {
  saleId: Id<"sales">;
  storeId: Id<"stores">;
  baseUrl: string;
  amount: number;
  currency: string;
  accessKey: string;
  number: string;
  productTitle: string;
  country?: string; // ignoré ici : Moneroo déduit le pays du moyen de paiement choisi, pas du client
};
export type InitResult = { ok: true; url: string } | { ok: false; reason: string; notEnabled: boolean };

/**
 * Crée la session de paiement Moneroo SANS rien enregistrer en cas d'échec : l'orchestrateur (checkout.ts) décide
 * s'il bascule sur un autre prestataire. `method` restreint la page hébergée au moyen choisi par l'acheteur.
 */
export async function tryInitialize(ctx: ActionCtx, sale: InitSale, customer: { name: string; email: string; phone?: string }, method?: string): Promise<InitResult> {
  const key = process.env.MONEROO_SECRET_KEY;
  if (!key) return { ok: false, reason: "Moneroo non configuré (MONEROO_SECRET_KEY manquante)", notEnabled: false };
  const [first, ...rest] = customer.name.trim().split(/\s+/);
  const payload = {
    amount: sale.amount, // XOF (sans sous-unité) ou devise de l'acheteur convertie
    currency: sale.currency,
    description: `${sale.productTitle} — ${sale.number}`.slice(0, 120),
    customer: {
      email: customer.email,
      first_name: first || "Client",
      last_name: rest.join(" ") || first || "Client",
      ...(customer.phone ? { phone: customer.phone.replace(/\D/g, "") } : {}),
    },
    return_url: thankYouUrl(sale.baseUrl, sale.saleId, sale.accessKey),
    ...(method ? { methods: [method] } : {}),
    // Un seul compte Moneroo pour toutes les boutiques : la boutique voyage dans les métadonnées
    metadata: { sale_id: sale.saleId, sale_number: sale.number, store_id: sale.storeId },
  };

  let res: Response;
  try {
    res = await fetchWithTimeout(`${MONEROO_API_URL}/payments/initialize`, {
      method: "POST",
      headers: buildAuthHeaders(key),
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, reason: describeFetchError(err, "initialisation"), notEnabled: false };
  }
  const body = await readJson(res);
  const paymentId = str(body, ["data", "id"]);
  const checkoutUrl = str(body, ["data", "checkout_url"]);
  if (!res.ok || !paymentId || !checkoutUrl) {
    const message = str(body, ["message"]) ?? JSON.stringify(body).slice(0, 200);
    console.error("[moneroo] init failed", res.status, message);
    return { ok: false, reason: `Moneroo ${res.status} : ${message}`, notEnabled: /not (enabled|compatible)|incompatible methods/i.test(message) };
  }
  await ctx.runMutation(internal.sales.attachPayment, { saleId: sale.saleId, paymentId });
  return { ok: true, url: checkoutUrl };
}

type VerifyResult = { status: Doc<"sales">["status"] | "unknown" };

/** Source de vérité : GET /payments/{id}/verify, puis mise à jour idempotente. */
async function verifyAndApply(
  ctx: ActionCtx,
  saleId: Id<"sales">,
  opts: { abandonIfPending?: boolean } = {},
): Promise<VerifyResult> {
  const sale = await ctx.runQuery(internal.sales.internalGet, { saleId });
  if (!sale) return { status: "unknown" };
  if (sale.status === "paid" || !sale.monerooPaymentId) return { status: sale.status };
  if (!process.env.MONEROO_SECRET_KEY) return { status: sale.status };

  let res: Response;
  try {
    res = await fetchWithTimeout(`${MONEROO_API_URL}/payments/${sale.monerooPaymentId}/verify`, {
      method: "GET",
      headers: buildAuthHeaders(secret()),
    });
  } catch (err) {
    console.error("[moneroo] verify", describeFetchError(err, "vérification"));
    return { status: sale.status };
  }
  const body = await readJson(res);
  if (!res.ok) {
    console.error("[moneroo] verify", res.status, JSON.stringify(body).slice(0, 300));
    return { status: sale.status };
  }

  const status = str(body, ["data", "status"]);
  const method =
    str(body, ["data", "capture", "method", "name"]) ?? str(body, ["data", "method", "name"]);
  const methodCode =
    str(body, ["data", "capture", "method", "short_code"]) ?? str(body, ["data", "method", "short_code"]) ?? str(body, ["data", "method", "code"]);
  const currency = str(body, ["data", "currency", "code"]) ?? str(body, ["data", "currency"]);
  if (status === "success") {
    await ctx.runMutation(internal.sales.markPaid, {
      saleId,
      paymentId: sale.monerooPaymentId,
      amount: num(body, ["data", "amount"]),
      currency,
      method,
      methodCode,
      fees: num(body, ["data", "capture", "metadata", "fees"]),
    });
    return { status: "paid" };
  }
  if (status === "failed" || status === "cancelled") {
    await ctx.runMutation(internal.sales.markFailed, {
      saleId,
      paymentId: sale.monerooPaymentId,
      method,
      reason:
        str(body, ["data", "capture", "failure_message"]) ??
        (status === "cancelled" ? "Paiement annulé par le client" : "Paiement refusé"),
    });
    return { status: "failed" };
  }
  if (opts.abandonIfPending) {
    await ctx.runMutation(internal.sales.markAbandonedIfPending, { saleId });
    return { status: "abandoned" };
  }
  return { status: "pending" };
}

/** Appelé par la page "merci" au retour de Moneroo (le webhook peut arriver après). */
export const verify = action({
  args: { saleId: v.string(), key: v.string() },
  handler: async (ctx, { saleId, key }): Promise<VerifyResult> => {
    const sale = await ctx.runQuery(internal.payments.lookup.byIdAndKey, { saleId, key });
    if (!sale) return { status: "unknown" };
    return verifyAndApply(ctx, sale._id);
  },
});

export const verifyInternal = internalAction({
  args: { saleId: v.id("sales"), abandonIfPending: v.optional(v.boolean()) },
  handler: async (ctx, { saleId, abandonIfPending }) => {
    await verifyAndApply(ctx, saleId, { abandonIfPending });
  },
});
