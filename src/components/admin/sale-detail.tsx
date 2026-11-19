"use client";

import Link from "next/link";
import { useAction } from "convex/react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ChevronRight,
  CircleDollarSign,
  Clock,
  Copy,
  CreditCard,
  Globe,
  Link2,
  Eye,
  Mail,
  Package,
  RefreshCw,
  Route,
  ShieldBan,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, fmtDateTime, waLink } from "@/lib/format";
import { countryName, flagUrl, formatMoney } from "@/lib/geo";
import { KV, Money, Panel, SectionTitle, StatusBadge, Thumb } from "./ui";
import { useStoreQuery, useStoreMutation, useCurrentStore } from "@/hooks/use-current-store";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";


function safeHost(ref?: string) {
  if (!ref) return "Direct";
  try {
    return new URL(ref).hostname.replace(/^www\./, "");
  } catch {
    return ref;
  }
}

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copié`);
  } catch {
    toast.error("Copie impossible");
  }
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => copy(text, label)}
      aria-label={`Copier ${label.toLowerCase()}`}
      className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-surface"
    >
      <Copy className="size-5 stroke-[1.6]" />
    </button>
  );
}

export function SaleDetail({ id }: { id: Id<"sales"> }) {
  const { store } = useCurrentStore();
  const sale = useStoreQuery(api.sales.detail, { id });
  const setAccess = useStoreMutation(api.sales.setAccess);
  const resend = useStoreMutation(api.sales.resendPurchaseEmail);
  const recheck = useStoreMutation(api.sales.recheck);
  const sendRecovery = useStoreMutation(api.recovery.sendNow);
  const sendWhatsapp = useStoreMutation(api.whatsapp.enqueue);
  const waStatus = useStoreQuery(api.whatsapp.status, {});

  if (sale === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-40 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    );
  }
  if (sale === null) return <p className="py-10 text-center text-muted-foreground">Vente introuvable.</p>;

  const accessUrl = `${store.url}/merci/${sale._id}?k=${sale.accessKey}`;
  const country = sale.context.country ? { name: countryName(sale.context.country), flag: flagUrl(sale.context.country) } : undefined;
  const earned = sale.net - (sale.fees ?? 0);
  const firstName = sale.customerName.split(" ")[0];

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div className="pr-14">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-lg font-bold">Vente : #{sale.number}</h2>
          <CopyBtn text={sale.number} label="Numéro de vente" />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="size-[18px] stroke-[1.6]" /> {fmtDateTime(sale._creationTime)}
          </span>
          <StatusBadge status={sale.status} />
        </div>
      </div>

      {sale.refund && (
        <div className="rounded-2xl bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger-fg)]">
          <strong>Remboursée</strong> le {fmtDateTime(sale.refund.at)} : {sale.refund.amount.toLocaleString("fr-FR")} F CFA
          {sale.refund.reason ? ` · ${sale.refund.reason}` : ""}. Retirée des revenus, accès coupé.
        </div>
      )}

      {sale.status === "paid" && (
        <div className="flex flex-wrap gap-2">
          {sale.accessRevoked ? (
            <button
              type="button"
              onClick={() => run(() => setAccess({ id, revoked: false }), "Accès rétabli")}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-5 font-semibold text-background"
            >
              <ShieldCheck className="size-5" /> Rétablir l&apos;accès
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Révoquer l'accès de ${sale.customerName} ? Ses liens de téléchargement ne marcheront plus.`)) {
                  void run(() => setAccess({ id, revoked: true }), "Accès révoqué");
                }
              }}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#dc2626] px-5 font-semibold text-white hover:bg-[#c81e1e]"
            >
              <ShieldBan className="size-5" /> Révoquer l&apos;accès
            </button>
          )}
        </div>
      )}
      {sale.status === "pending" && sale.monerooPaymentId && (
        <button
          type="button"
          onClick={() => run(() => recheck({ id }), "Vérification lancée")}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-5 font-semibold hover:bg-[#eceeec]"
        >
          <RefreshCw className="size-5" /> Vérifier chez Moneroo
        </button>
      )}
      {sale.status !== "paid" && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run(() => sendRecovery({ saleId: id, template: "failed" }), "Email « paiement échoué » envoyé")}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-foreground px-5 font-semibold text-background"
          >
            <Mail className="size-5" /> Relancer par email
          </button>
          <button
            type="button"
            onClick={() => run(() => sendRecovery({ saleId: id, template: "cart" }), "Rappel de commande envoyé")}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-5 font-semibold hover:bg-[#eceeec]"
          >
            Rappel de commande
          </button>
          {waStatus?.configured && sale.customerPhone && (
            <button
              type="button"
              onClick={() => run(() => sendWhatsapp({ saleId: id, kind: "failed" }), "Ajouté à la file WhatsApp (envoi progressif)")}
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#dcfce7] px-5 font-semibold text-[#166534]"
            >
              <WhatsAppIcon className="size-5" /> Relancer sur WhatsApp
            </button>
          )}
        </div>
      )}
      {sale.failureReason && sale.status !== "paid" && (
        <p className="rounded-2xl bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-fg)]">{sale.failureReason}</p>
      )}

      <section>
        <SectionTitle icon={<Package />}>Produit</SectionTitle>
        <Link href={`/admin/produits/${sale.productId}`} className="mt-3 flex items-center gap-4 rounded-2xl py-2 hover:bg-surface/60">
          <Thumb src={sale.coverUrl} alt="" className="size-14" />
          <span className="min-w-0 flex-1 font-semibold">{sale.productTitle}</span>
          <ChevronRight className="size-5" />
        </Link>
      </section>

      <section>
        <SectionTitle icon={<UserRound />}>Client</SectionTitle>
        <Panel className="mt-4 px-0 py-0">
          <div className="flex items-center gap-4 border-b border-border px-5 py-4">
            <span className="flex size-11 items-center justify-center rounded-full bg-foreground text-background">
              <UserRound className="size-5" />
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{sale.customerName}</span>
            {sale.customerPhone && (
              <a
                href={waLink(sale.customerPhone, `Bonjour ${firstName}, `)}
                target="_blank"
                rel="noreferrer"
                aria-label="Écrire sur WhatsApp"
                className="flex size-11 items-center justify-center rounded-full hover:bg-surface"
              >
                <WhatsAppIcon className="size-8" />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-muted-foreground">Email</div>
              <div className="truncate font-medium">{sale.customerEmail}</div>
            </div>
            <CopyBtn text={sale.customerEmail} label="Email" />
          </div>
          {sale.customerPhone && (
            <div className="mx-5 flex items-center gap-2 border-t border-border py-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-muted-foreground">Téléphone</div>
                <div className="truncate font-medium">{sale.customerPhone}</div>
              </div>
              <CopyBtn text={sale.customerPhone} label="Téléphone" />
            </div>
          )}
        </Panel>
      </section>

      <section>
        <SectionTitle icon={<CreditCard />}>Informations de paiement</SectionTitle>
        <Panel className="mt-4">
          <KV label="Prix">
            <Money value={sale.price} />
          </KV>
          <KV label={sale.couponCode ? `Réduction (${sale.couponCode})` : "Réduction"}>
            <Money value={sale.discount} />
          </KV>
          <KV label="Montant net">
            <Money value={sale.net} />
          </KV>
          {sale.charged && <KV label="Payé en devise locale">{formatMoney(sale.charged.amount, sale.charged.currency)}</KV>}
          {sale.bump && (
            <KV label={`+ ${sale.bump.title}`}>
              <Money value={sale.bump.price} />
            </KV>
          )}
          <KV label="Méthode">
            {sale.method ? (
              <span className="inline-flex h-10 items-center rounded-full border-2 border-foreground px-4 text-sm font-semibold">{sale.method}</span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </KV>
        </Panel>
      </section>

      {sale.status === "paid" && (
        <section>
          <SectionTitle icon={<CircleDollarSign />}>Détails du règlement</SectionTitle>
          <Panel className="mt-4">
            <KV label="Frais de paiement">{sale.fees !== undefined ? <Money value={sale.fees} /> : <span className="text-muted-foreground">Non communiqués</span>}</KV>
            <KV label="Montant réglé (vos revenus)">
              <Money value={earned} />
            </KV>
            {sale.paidAt && <KV label="Réglé le">{fmtDateTime(sale.paidAt)}</KV>}
          </Panel>
        </section>
      )}

      {sale.status === "paid" && (
        <section>
          <SectionTitle icon={<Mail />}>Livraison</SectionTitle>
          <Panel className="mt-4">
            <KV label="Téléchargements">{sale.downloads}</KV>
            {sale.emails
              .filter((e) => e.template === "purchase")
              .map((e) => (
                <KV key={e._id} label={`Email du ${fmtDateTime(e.at)}`}>
                  <span className={e.status === "sent" ? "text-[var(--success-fg)]" : e.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                    {e.status === "sent" ? "Envoyé ✓" : e.status === "failed" ? `Échec (${e.attempts} essai${e.attempts > 1 ? "s" : ""})` : "En cours…"}
                  </span>
                </KV>
              ))}
          </Panel>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run(() => resend({ id }), "Email renvoyé")}
              disabled={sale.accessRevoked}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec] disabled:opacity-50"
            >
              <Mail className="size-4" /> Renvoyer l&apos;email
            </button>
            <EmailPreviewButton saleId={id} />
            <button
              type="button"
              onClick={() => copy(accessUrl, "Lien d'accès")}
              disabled={sale.accessRevoked}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec] disabled:opacity-50"
            >
              <Link2 className="size-4" /> Copier le lien d&apos;accès
            </button>
            {sale.customerPhone && !sale.accessRevoked && (
              <a
                href={waLink(sale.customerPhone, `Bonjour ${firstName}, voici ton accès à « ${sale.productTitle} » : ${accessUrl}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#dcfce7] px-4 text-sm font-semibold text-[#166534]"
              >
                <WhatsAppIcon className="size-4" /> Envoyer par WhatsApp
              </a>
            )}
          </div>
        </section>
      )}

      <section>
        <SectionTitle icon={<Globe />}>Contexte</SectionTitle>
        <Panel className="mt-4">
          <KV label="Pays">
            {country ? (
              <span className="inline-flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={country.flag} alt="" className="h-4 w-6 rounded-[3px] object-cover" />
                {country.name}
              </span>
            ) : (
              "-"
            )}
          </KV>
          <KV label="Langue">{sale.context.lang ?? "-"}</KV>
          <KV label="Appareil">{sale.context.device ?? "-"}</KV>
          <KV label="Source">{sale.context.utmSource ?? safeHost(sale.context.referrer)}</KV>
          {sale.context.utmCampaign && <KV label="Campagne">{sale.context.utmCampaign}</KV>}
        </Panel>
      </section>

      <Journey saleId={sale._id} />
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  page_view: "Page vue",
  product_view: "Fiche produit",
  preview_open: "Aperçu ouvert",
  share: "Partage",
  contact: "Contact WhatsApp",
  checkout_open: "Page de paiement",
  bump_toggle: "Offre complémentaire",
  coupon_apply: "Code promo",
  payment_start: "Paiement lancé",
  checkout_error: "Erreur au paiement",
  purchase: "Achat confirmé",
};

const hourFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Porto-Novo" });

/** Parcours de l'acheteur avant la vente (tracking maison) : visites, pages, aperçus, paiement. */
function Journey({ saleId }: { saleId: Id<"sales"> }) {
  const j = useStoreQuery(api.tracking.journey, { saleId });
  if (j === undefined) return <Skeleton className="h-24 rounded-2xl" />;
  if (j === null) return null;
  return (
    <section>
      <SectionTitle icon={<Route />}>Parcours avant l&apos;achat</SectionTitle>
      <p className="mt-2 text-sm text-muted-foreground">
        {j.visits} visite{j.visits > 1 ? "s" : ""} · première le {fmtDateTime(j.firstVisit)}
      </p>
      <ol className="mt-4 space-y-5">
        {j.sessions.map((s, i) => (
          <li key={s.sessionId} className="rounded-2xl bg-surface p-4">
            <p className="text-sm font-semibold">
              Visite {i + 1} · {fmtDateTime(s.startedAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.source}
              {s.campaign ? ` (${s.campaign})` : ""} · {s.device}
              {s.browser ? ` · ${s.browser}` : ""}
              {s.seconds ? ` · ${Math.round(s.seconds / 60) || "<1"} min` : ""}
              {s.maxScroll ? ` · lecture jusqu'à ${s.maxScroll} %` : ""}
            </p>
            <ul className="mt-3 space-y-2 border-l-2 border-border pl-4">
              {s.events
                // « Page vue » d'une fiche produit fait doublon avec « Fiche produit »
                .filter((e, k, all) => !(e.type === "page_view" && all.some((x) => x.type === "product_view" && x.path === e.path && Math.abs(x.at - e.at) < 2000)))
                .map((e, k) => (
                <li key={k} className="relative text-sm">
                  <span className={`absolute -left-[21px] top-1.5 size-2.5 rounded-full ${e.type === "purchase" ? "bg-[#1baf7a]" : e.type === "payment_start" ? "bg-[#eb6834]" : "bg-foreground/40"}`} />
                  <span className="font-medium">{EVENT_LABELS[e.type] ?? e.type}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {e.type === "preview_open" && e.props?.file ? e.props.file : e.path}
                    {e.type === "coupon_apply" ? (e.props?.ok ? " · accepté" : " · refusé") : ""}
                    {e.type === "bump_toggle" ? (e.props?.on ? " · ajoutée" : " · retirée") : ""} · {hourFmt.format(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Aperçu de l'email réellement envoyé au client (rendu React Email côté serveur). */
function EmailPreviewButton({ saleId }: { saleId: Id<"sales"> }) {
  const preview = useAction(api.email.send.previewSale);
  const [open, setOpen] = useState(false);
  const [mail, setMail] = useState<{ subject: string; html: string } | null>(null);
  const load = async () => {
    setOpen(true);
    if (mail) return;
    try {
      setMail(await preview({ saleId, template: "purchase" }));
    } catch (e) {
      toast.error(errorMessage(e));
      setOpen(false);
    }
  };
  return (
    <>
      <button type="button" onClick={load} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec]">
        <Eye className="size-4" /> Aperçu de l&apos;email
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[88dvh] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[620px]">
          <div className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle className="text-base">Email envoyé au client</DialogTitle>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">Objet : {mail?.subject ?? "…"}</p>
          </div>
          {mail ? (
            <iframe title="Aperçu de l'email" srcDoc={mail.html} sandbox="" className="w-full flex-1 bg-[#f3f4f3]" />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <Skeleton className="h-3/4 w-3/4 rounded-3xl" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
