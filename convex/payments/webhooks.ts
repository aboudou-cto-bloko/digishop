import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { verifyMonerooSignature, str } from "./moneroo_client";
import { verifySignature as verifyCameroonPayinSignature, str as cmStr } from "./saspay_client";

/**
 * Webhook Moneroo. Il ne livre qu'un sous-ensemble de la transaction : on vérifie la
 * signature, on retrouve la vente, puis on re-vérifie le statut via l'API (verifyInternal).
 */
export const monerooWebhook = httpAction(async (ctx, request) => {
  const rawBody = await request.text();
  const secret = process.env.MONEROO_WEBHOOK_SECRET;
  if (!secret) return new Response("Server configuration error", { status: 500 });

  const signature = request.headers.get("x-moneroo-signature") ?? "";
  if (!signature || !(await verifyMonerooSignature(rawBody, signature, secret))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = str(payload, ["event"]) ?? "";

  // Retraits : on retrouve le retrait puis on re-vérifie via GET /payouts/{id}/verify
  if (event.startsWith("payout.")) {
    const monerooId = str(payload, ["data", "id"]);
    const metaId = str(payload, ["data", "metadata", "payout_id"]);
    const fromMeta = metaId ? await ctx.runQuery(internal.payments.lookup.normalizePayout, { id: metaId }) : null;
    const row = fromMeta ?? (monerooId ? (await ctx.runQuery(internal.payouts.byMoneroo, { monerooId }))?._id : null);
    if (row) await ctx.runAction(internal.payouts.verify, { id: row });
    return new Response("OK", { status: 200 });
  }
  if (!event.startsWith("payment.")) return new Response("OK", { status: 200 });

  const paymentId = str(payload, ["data", "id"]);
  const saleIdMeta = str(payload, ["data", "metadata", "sale_id"]);
  let saleId = saleIdMeta ? await ctx.runQuery(internal.payments.lookup.normalize, { saleId: saleIdMeta }) : null;
  if (!saleId && paymentId) {
    saleId = (await ctx.runQuery(internal.sales.internalByPayment, { paymentId }))?._id ?? null;
  }
  if (!saleId) return new Response("OK", { status: 200 }); // inconnu : on évite les retries

  await ctx.runAction(internal.payments.moneroo.verifyInternal, { saleId });
  return new Response("OK", { status: 200 });
});

/**
 * Webhook du prestataire d'encaissement Cameroun (CEMAC). La charge utile reprend les metadata de
 * la session (sale_id) : c'est la jointure principale. Repli : transaction_id déjà mémorisé par un
 * poll. Le statut est toujours re-vérifié via l'API (verifyInternal), jamais lu du payload.
 */
export const cameroonPayinWebhook = httpAction(async (ctx, request) => {
  const rawBody = await request.text();
  const secret = process.env.SASPAY_WEBHOOK_SECRET;
  if (!secret) return new Response("Server configuration error", { status: 500 });

  const signature = request.headers.get("x-webhook-signature") ?? "";
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
  if (!signature || !timestamp || !(await verifyCameroonPayinSignature(rawBody, signature, timestamp, secret))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = cmStr(payload, ["event"]) ?? request.headers.get("x-webhook-event") ?? "";
  if (!event.startsWith("transaction.")) return new Response("OK", { status: 200 });

  const transactionId = cmStr(payload, ["data", "id"]);
  if (!transactionId) return new Response("OK", { status: 200 });

  // Décaissement (RETRAIT) : l'id de transaction est connu dès la création, la jointure est immédiate.
  const payout = await ctx.runQuery(internal.payouts.bySaspay, { id: transactionId });
  if (payout) {
    await ctx.runAction(internal.payouts.verify, { id: payout._id });
    return new Response("OK", { status: 200 });
  }

  // Le payload reprend les metadata de la session : jointure directe, sans attendre un poll.
  const metaSaleId = cmStr(payload, ["data", "metadata", "sale_id"]);
  const fromMeta = metaSaleId ? await ctx.runQuery(internal.payments.lookup.normalize, { saleId: metaSaleId }) : null;
  const saleId = fromMeta ?? (await ctx.runQuery(internal.sales.internalBySaspayTransaction, { transactionId }))?._id ?? null;
  if (!saleId) return new Response("OK", { status: 200 }); // inconnu : on évite les retries

  await ctx.runAction(internal.payments.saspay.verifyInternal, { saleId });
  return new Response("OK", { status: 200 });
});
