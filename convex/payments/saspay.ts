import { action, internalAction } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { saspayApiUrl, buildAuthHeaders, describeFetchError, fetchWithTimeout, str, readJson } from "./saspay_client";
import { thankYouUrl } from "./shared";
export { thankYouUrl } from "./shared";

function secret(): string {
  const key = process.env.SASPAY_SECRET_KEY;
  if (!key) throw new Error("SASPAY_SECRET_KEY non configurée");
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
  country?: string;
};
export type InitResult = { ok: true; url: string } | { ok: false; reason: string; notEnabled: boolean };

/** Crée la session de checkout hébergé SasPay SANS rien enregistrer en cas d'échec (l'orchestrateur décide du repli). */
export async function tryInitialize(ctx: ActionCtx, sale: InitSale, customer: { name: string; email: string; phone?: string }): Promise<InitResult> {
  const key = process.env.SASPAY_SECRET_KEY;
  if (!key) return { ok: false, reason: "Paiement SasPay non configuré (clé API manquante)", notEnabled: false };
  const payload = {
    amount: sale.amount.toFixed(2),
    currency: sale.currency,
    description: `${sale.productTitle} — ${sale.number}`.slice(0, 120),
    country: sale.country,
    customer_email: customer.email,
    customer_name: customer.name,
    ...(customer.phone ? { customer_phone: customer.phone } : {}),
    return_url: thankYouUrl(sale.baseUrl, sale.saleId, sale.accessKey),
    metadata: { sale_id: sale.saleId, sale_number: sale.number, store_id: sale.storeId },
  };
  let res: Response;
  try {
    res = await fetchWithTimeout(`${saspayApiUrl()}/checkout-sessions/`, { method: "POST", headers: buildAuthHeaders(key), body: JSON.stringify(payload) });
  } catch (err) {
    return { ok: false, reason: describeFetchError(err, "initialisation"), notEnabled: false };
  }
  const body = await readJson(res);
  const sessionId = str(body, ["id"]) ?? str(body, ["data", "id"]);
  const checkoutUrl = str(body, ["checkout_url"]) ?? str(body, ["data", "checkout_url"]);
  if (!res.ok || !sessionId || !checkoutUrl) {
    const message = str(body, ["message"]) ?? str(body, ["error", "message"]) ?? JSON.stringify(body).slice(0, 200);
    console.error("[saspay] init failed", res.status, message);
    return { ok: false, reason: `SasPay ${res.status} : ${message}`, notEnabled: false };
  }
  await ctx.runMutation(internal.sales.attachSaspaySession, { saleId: sale.saleId, sessionId });
  return { ok: true, url: checkoutUrl };
}

type VerifyResult = { status: Doc<"sales">["status"] | "unknown" };

/** Source de vérité : GET /checkout-sessions/{id}/status/, qui revérifie auprès de la gateway. */
async function verifyAndApply(
  ctx: ActionCtx,
  saleId: Id<"sales">,
  opts: { abandonIfPending?: boolean } = {},
): Promise<VerifyResult> {
  const sale = await ctx.runQuery(internal.sales.internalGet, { saleId });
  if (!sale) return { status: "unknown" };
  if (sale.status === "paid" || !sale.saspaySessionId) return { status: sale.status };
  if (!process.env.SASPAY_SECRET_KEY) return { status: sale.status };

  let res: Response;
  try {
    res = await fetchWithTimeout(`${saspayApiUrl()}/checkout-sessions/${sale.saspaySessionId}/status/`, {
      method: "GET",
      headers: buildAuthHeaders(secret()),
    });
  } catch (err) {
    console.error("[cameroon-payin] verify", describeFetchError(err, "vérification"));
    return { status: sale.status };
  }
  const body = await readJson(res);
  if (!res.ok) {
    console.error("[cameroon-payin] verify", res.status, JSON.stringify(body).slice(0, 300));
    return { status: sale.status };
  }

  // Connu seulement une fois le paiement tenté : on le mémorise dès qu'il apparaît, pour que
  // le webhook (qui ne porte que l'id de transaction) puisse ensuite relier l'événement à cette vente.
  // Réponse enveloppée {success, data:{...}} (parfois à plat) : on lit les deux
  const transactionId = str(body, ["data", "transaction_id"]) ?? str(body, ["transaction_id"]);
  if (transactionId) await ctx.runMutation(internal.sales.attachSaspayTransaction, { saleId, transactionId });

  const status = str(body, ["data", "transaction_status"]) ?? str(body, ["transaction_status"]);
  if (status === "SUCCESS") {
    await ctx.runMutation(internal.sales.markPaid, { saleId, paymentId: transactionId });
    return { status: "paid" };
  }
  if (status === "FAILED" || status === "CANCELLED") {
    await ctx.runMutation(internal.sales.markFailed, { saleId, paymentId: transactionId, reason: status === "CANCELLED" ? "Paiement annulé par le client" : "Paiement refusé" });
    return { status: "failed" };
  }
  if (opts.abandonIfPending) {
    await ctx.runMutation(internal.sales.markAbandonedIfPending, { saleId });
    return { status: "abandoned" };
  }
  return { status: "pending" };
}

/** Appelé par la page "merci" au retour du checkout (le webhook peut arriver après ou pas du tout). */
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
