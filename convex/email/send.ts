"use node";

import nodemailer from "nodemailer";
import { createElement } from "react";
import { render } from "@react-email/render";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import PurchaseEmail, { purchaseSubject } from "../../emails/purchase";
import SellerSaleEmail, { sellerSaleSubject } from "../../emails/seller-sale";
import TestEmail from "../../emails/test-email";
import AdminInviteEmail from "../../emails/admin-invite";
import { BRAND } from "../lib/brand";
import RecoveryEmail, { fillTemplate } from "../../emails/recovery";
import { dateTime, fcfa } from "../../emails/components/theme";
import type { Doc } from "../_generated/dataModel";
import { sign } from "../lib/sign";

type SmtpAccount = { label: string; host: string; port: number; user: string; pass: string; from: string };

/** Comptes SMTP_1_*, SMTP_2_*, … essayés dans l'ordre (failover). */
function smtpAccounts(): SmtpAccount[] {
  const out: SmtpAccount[] = [];
  for (let i = 1; i <= 5; i++) {
    const host = process.env[`SMTP_${i}_HOST`];
    const user = process.env[`SMTP_${i}_USER`];
    const pass = process.env[`SMTP_${i}_PASS`];
    if (!host || !user || !pass) continue;
    out.push({
      label: process.env[`SMTP_${i}_LABEL`] ?? `smtp${i}:${host}`,
      host,
      port: Number(process.env[`SMTP_${i}_PORT`] ?? 587),
      user,
      pass,
      from: process.env[`SMTP_${i}_FROM`] ?? user,
    });
  }
  return out;
}

type Mail = { to: string; subject: string; html: string; text: string; fromName: string; replyTo?: string };

async function deliver(mail: Mail) {
  const accounts = smtpAccounts();
  if (accounts.length === 0) return { ok: false as const, error: "Aucun compte SMTP configuré (SMTP_1_HOST…)" };
  const errors: string[] = [];
  for (const acc of accounts) {
    try {
      const transport = nodemailer.createTransport({
        host: acc.host,
        port: acc.port,
        secure: acc.port === 465,
        auth: { user: acc.user, pass: acc.pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
      const fromAddr = acc.from.includes("<") ? acc.from : `"${mail.fromName.replace(/"/g, "")}" <${acc.from}>`;
      await transport.sendMail({ from: fromAddr, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, replyTo: mail.replyTo });
      return { ok: true as const, provider: acc.label };
    } catch (err) {
      errors.push(`${acc.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { ok: false as const, error: errors.join(" | ").slice(0, 900) };
}

/** Rendu React Email → HTML + version texte (meilleure délivrabilité). */
async function renderBoth(el: Parameters<typeof render>[0]) {
  const [html, text] = await Promise.all([render(el), render(el, { plainText: true })]);
  return { html, text };
}

type SaleData = NonNullable<FunctionReturnType<typeof internal.email.data.forSale>>;

function purchaseProps(d: SaleData) {
  const s = d.sale;
  return {
    store: d.store,
    customerName: s.customerName,
    productTitle: s.productTitle,
    coverUrl: d.coverUrl,
    files: d.files,
    number: s.number,
    paidAt: s.paidAt ?? s._creationTime,
    price: s.price,
    discount: s.discount,
    couponCode: s.couponCode,
    net: s.net,
    method: s.method,
    accessUrl: d.accessUrl,
    supportWhatsapp: d.supportWhatsapp,
    supportEmail: d.supportEmail,
  };
}

function sellerProps(d: SaleData) {
  const s = d.sale;
  return {
    store: d.store,
    productTitle: s.productTitle,
    coverUrl: d.coverUrl,
    customerName: s.customerName,
    customerEmail: s.customerEmail,
    customerPhone: s.customerPhone,
    net: s.net,
    fees: s.fees,
    method: s.method,
    couponCode: s.couponCode,
    source: d.source,
    paidAt: s.paidAt ?? s._creationTime,
    dashboardUrl: d.dashboardUrl,
  };
}

/** Sujet + élément React de l'email d'une vente. */
function saleEmail(d: SaleData, template: "purchase" | "seller_sale") {
  if (template === "purchase") {
    const props = purchaseProps(d);
    return { subject: purchaseSubject(props), element: createElement(PurchaseEmail, props) };
  }
  const props = sellerProps(d);
  return { subject: sellerSaleSubject(props), element: createElement(SellerSaleEmail, props) };
}

type Step = NonNullable<Doc<"settings">["recovery"]>["steps"][number];

function couponLabel(c: Pick<Doc<"coupons">, "type" | "value"> | null | undefined) {
  if (!c) return undefined;
  return c.type === "percent" ? `-${c.value} % avec ton code` : `-${fcfa(c.value)} avec ton code`;
}

function resumeUrlOf(d: SaleData, couponCode?: string) {
  const params = new URLSearchParams({ reprise: d.sale._id, k: d.sale.accessKey });
  // « promo » : un paramètre « code » serait intercepté par Convex Auth (code de connexion) et perdu
  if (couponCode) params.set("promo", couponCode);
  return `${d.store.siteUrl.replace(/\/$/, "")}/checkout/${d.productSlug ?? ""}?${params.toString()}`;
}

/** Liens de suivi d'une relance (ouverture + clic signés), servis par les routes HTTP Convex /t/o et /t/c. */
async function trackingLinks(logId: string, target: string) {
  const site = (process.env.CONVEX_SITE_URL ?? "").replace(/\/$/, "");
  if (!site) return undefined;
  const click = new URLSearchParams({ l: logId, u: target, s: await sign("click", `${logId}|${target}`) });
  const open = new URLSearchParams({ l: logId, s: await sign("open", logId) });
  return { resumeUrl: `${site}/t/c?${click.toString()}`, openPixelUrl: `${site}/t/o?${open.toString()}` };
}

/** Email de relance : objet et message du vendeur, variables remplacées. */
function recoveryEmail(
  d: SaleData,
  step: Pick<Step, "subject" | "message">,
  opts: { couponCode?: string; expiresAt?: number; coupon?: Pick<Doc<"coupons">, "type" | "value"> | null; token: string; tracking?: { resumeUrl: string; openPixelUrl: string } },
) {
  const s = d.sale;
  const site = d.store.siteUrl.replace(/\/$/, "");
  const vars = {
    prénom: s.customerName.trim().split(/\s+/)[0],
    produit: s.productTitle,
    code: opts.couponCode ?? "",
    expiration: opts.expiresAt ? dateTime(opts.expiresAt) : "",
    prix: fcfa(s.price),
  };
  const props = {
    store: d.store,
    heading: fillTemplate(step.subject, vars),
    message: fillTemplate(step.message, vars),
    productTitle: s.productTitle,
    coverUrl: d.coverUrl,
    priceLabel: fcfa(s.price),
    couponCode: opts.couponCode,
    couponLabel: couponLabel(opts.coupon),
    expiresAt: opts.expiresAt,
    resumeUrl: opts.tracking?.resumeUrl ?? resumeUrlOf(d, opts.couponCode),
    openPixelUrl: opts.tracking?.openPixelUrl,
    unsubscribeUrl: `${site}/desabonnement?c=${s.customerId}&t=${opts.token}`,
    supportEmail: d.supportEmail,
  };
  return { subject: fillTemplate(step.subject, vars), element: createElement(RecoveryEmail, props) };
}

/** Relance : log puis envoi (appelé par recovery.tick). */
export const queueRecovery = internalAction({
  args: { saleId: v.id("sales"), stepId: v.string(), couponCode: v.optional(v.string()), expiresAt: v.optional(v.number()) },
  handler: async (ctx, { saleId, stepId, couponCode, expiresAt }) => {
    const d = await ctx.runQuery(internal.email.data.forSale, { saleId });
    if (!d) return;
    const logId = await ctx.runMutation(internal.email.log.create, {
      saleId,
      to: d.sale.customerEmail,
      template: "recovery",
      stepId,
      meta: { couponCode, expiresAt },
    });
    await ctx.runAction(internal.email.send.attempt, { logId });
  },
});

/** Aperçu d'une étape de relance dans le dashboard (dernière vente connue ou données d'exemple). */
export const previewRecovery = action({
  args: {
    subject: v.string(),
    message: v.string(),
    promo: v.union(v.literal("none"), v.literal("code")),
    discountLabel: v.optional(v.string()),
    validHours: v.optional(v.number()),
    storeId: v.id("stores"),
  },
  handler: async (ctx, args): Promise<{ subject: string; html: string } | null> => {
    if (!(await ctx.auth.getUserIdentity())) throw new Error("Non autorisé");
    const saleId = await ctx.runQuery(internal.email.data.anySale, { storeId: args.storeId });
    if (!saleId) return null;
    const d = await ctx.runQuery(internal.email.data.forSale, { saleId });
    if (!d) return null;
    const expiresAt = args.promo === "code" ? Date.now() + (args.validHours ?? 48) * 3_600_000 : undefined;
    const built = recoveryEmail(d, args, {
      couponCode: args.promo === "code" ? "RELANCE-EXEMPLE" : undefined,
      expiresAt,
      coupon: null,
      token: "apercu",
    });
    const html = await render(args.discountLabel ? createElement(RecoveryEmail, { ...(built.element.props as Parameters<typeof RecoveryEmail>[0]), couponLabel: args.discountLabel }) : built.element);
    return { subject: built.subject, html };
  },
});

const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const template = v.union(v.literal("purchase"), v.literal("seller_sale"));

/** Point d'entrée : crée la ligne de log puis tente l'envoi. */
export const queue = internalAction({
  args: { saleId: v.id("sales"), template },
  handler: async (ctx, { saleId, template }) => {
    const data = await ctx.runQuery(internal.email.data.forSale, { saleId });
    if (!data) return;
    const to = template === "purchase" ? data.sale.customerEmail : (data.notifyEmail ?? (await ctx.runQuery(internal.account.adminEmail, { storeId: data.sale.storeId })) ?? process.env.ADMIN_EMAIL);
    if (!to) return;
    const logId = await ctx.runMutation(internal.email.log.create, { saleId, to, template });
    await ctx.runAction(internal.email.send.attempt, { logId });
  },
});

export const attempt = internalAction({
  args: { logId: v.id("emailLog") },
  handler: async (ctx, { logId }) => {
    const log = await ctx.runQuery(internal.email.log.get, { id: logId });
    if (!log || log.status === "sent") return;
    const d = await ctx.runQuery(internal.email.data.forSale, { saleId: log.saleId });
    if (!d) return;
    let subject: string;
    let body: { html: string; text: string };
    if (log.template === "recovery") {
      const step = log.stepId ? await ctx.runQuery(internal.recovery.stepFor, { storeId: d.sale.storeId, stepId: log.stepId }) : null;
      if (!step) return;
      const coupon = log.meta?.couponCode ? await ctx.runQuery(internal.email.data.couponByCode, { storeId: d.sale.storeId, code: log.meta.couponCode }) : null;
      const token = await ctx.runQuery(internal.recovery.unsubscribeToken, { customerId: d.sale.customerId });
      const tracking = await trackingLinks(logId, resumeUrlOf(d, log.meta?.couponCode));
      const built = recoveryEmail(d, step, { couponCode: log.meta?.couponCode, expiresAt: log.meta?.expiresAt, coupon, token, tracking });
      subject = built.subject;
      body = await renderBoth(built.element);
    } else {
      const built = saleEmail(d, log.template);
      subject = built.subject;
      body = await renderBoth(built.element);
    }

    const res = await deliver({
      to: log.to,
      subject,
      ...body,
      fromName: d.store.storeName,
      replyTo: log.template === "purchase" ? d.supportEmail : undefined,
    });
    const { attempts } = await ctx.runMutation(internal.email.log.result, {
      id: logId,
      ok: res.ok,
      provider: res.ok ? res.provider : undefined,
      error: res.ok ? undefined : res.error,
    });
    if (!res.ok) {
      console.error("[email] échec", log.template, res.error);
      const delay = RETRY_DELAYS_MS[attempts - 1];
      if (delay !== undefined) await ctx.scheduler.runAfter(delay, internal.email.send.attempt, { logId });
    }
  },
});

/** Bouton « Envoyer un email de test » des paramètres. */
export const sendTest = action({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }): Promise<{ ok: boolean; provider?: string; error?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autorisé");
    const { store, notifyEmail } = await ctx.runQuery(internal.email.data.store, { storeId });
    const to = notifyEmail ?? (await ctx.runQuery(internal.account.adminEmail, { storeId })) ?? process.env.ADMIN_EMAIL;
    if (!to) return { ok: false, error: "Aucune adresse de notification" };
    const body = await renderBoth(createElement(TestEmail, { store }));
    const res = await deliver({ to, fromName: store.storeName, subject: `Test d'envoi : ${store.storeName}`, ...body });
    return res.ok ? { ok: true, provider: res.provider } : { ok: false, error: res.error };
  },
});

/** Rendu HTML pour l'aperçu dans le dashboard (sans envoi). */
export const previewSale = action({
  args: { saleId: v.id("sales"), template },
  handler: async (ctx, { saleId, template }): Promise<{ subject: string; html: string } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Non autorisé");
    const d = await ctx.runQuery(internal.email.data.forSale, { saleId });
    if (!d) return null;
    const { subject, element } = saleEmail(d, template);
    return { subject, html: await render(element) };
  },
});

/** Invitation d'un administrateur (identifiants temporaires). Renvoie false si aucun SMTP n'est configuré ou si l'envoi échoue. */
export const adminInvite = internalAction({
  args: { to: v.string(), tempPassword: v.string(), invitedBy: v.string() },
  handler: async (_ctx, { to, tempPassword, invitedBy }): Promise<boolean> => {
    const site = (process.env.SITE_URL ?? "").replace(/\/$/, "");
    const store = { storeName: BRAND.name, siteUrl: site };
    const body = await renderBoth(createElement(AdminInviteEmail, { store, email: to, tempPassword, invitedBy, loginUrl: `${site}/login` }));
    const res = await deliver({ to, subject: `Ton accès administrateur ${BRAND.name}`, ...body, fromName: BRAND.name });
    return res.ok;
  },
});
