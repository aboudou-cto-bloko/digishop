"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Download, FileText, Headphones, Loader2, Mail, RefreshCw, ShieldBan, Smartphone, Video } from "lucide-react";
import { api } from "../../../../../convex/_generated/api";
import { errorMessage, fileSize, waLink } from "@/lib/format";
import { formatMoney, normalizePhone } from "@/lib/geo";
import { fbTrack, ttTrack } from "@/lib/tracking";
import { useStoreBase } from "@/components/store/store-id";
import { useVisitor } from "@/components/store/visitor";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";

const SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "";

export function ThankYou({ saleId, accessKey, whatsapp, supportEmail }: { saleId: string; accessKey: string; whatsapp?: string; supportEmail?: string }) {
  const sale = useQuery(api.sales.forThankYou, { saleId, key: accessKey });
  const verifyMoneroo = useAction(api.payments.moneroo.verify);
  const verifySaspay = useAction(api.payments.saspay.verify);
  const retry = useAction(api.checkout.retry);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [waitedLong, setWaitedLong] = useState(false);
  const polls = useRef(0);

  // Le webhook peut arriver après le retour du client : on vérifie nous-mêmes chez Moneroo
  const status = sale?.status;
  // Chaque prestataire revérifie auprès de sa propre API (le webhook peut arriver après, ou pas du tout)
  const verify = sale?.provider === "saspay" ? verifySaspay : verifyMoneroo;
  useEffect(() => {
    if (status !== "pending") return;
    let stop = false;
    const tick = async () => {
      if (stop || polls.current > 24) return;
      polls.current += 1;
      if (polls.current === 8) setWaitedLong(true);
      await verify({ saleId, key: accessKey }).catch(() => {});
      if (!stop) timer = setTimeout(tick, polls.current < 6 ? 3000 : 6000);
    };
    let timer = setTimeout(tick, 600);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [status, saleId, accessKey, verify]);

  // Événement Purchase navigateur, une seule fois (même event_id que l'API Conversions)
  useEffect(() => {
    if (!sale || sale.status !== "paid") return;
    const key = `ds_px_${sale._id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    const eventId = `purchase_${sale._id}`;
    const fire = () => {
      fbTrack("Purchase", { content_ids: [sale.productId], content_name: sale.productTitle, content_type: "product", value: sale.net, currency: "XOF", num_items: 1 }, eventId);
      ttTrack("CompletePayment", { content_id: sale.productId, value: sale.net, currency: "XOF" }, eventId);
    };
    const t = setTimeout(fire, 800);
    return () => clearTimeout(t);
  }, [sale]);

  const onRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const r = await retry({ saleId, key: accessKey });
      window.location.assign(r.redirectUrl);
    } catch (e) {
      setRetryError(errorMessage(e));
      setRetrying(false);
    }
  };

  if (sale === undefined) {
    return (
      <Shell>
        <div className="flex flex-col items-center py-10">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (sale === null) {
    return (
      <Shell>
        <Icon tone="neutral">
          <CircleAlert />
        </Icon>
        <h1 className="mt-5 text-center text-2xl font-bold">Lien invalide</h1>
        <p className="mt-2 text-center text-muted-foreground">Ce lien de commande est incomplet. Utilise le lien reçu par email, ou contacte-nous.</p>
        <Support whatsapp={whatsapp} supportEmail={supportEmail} />
      </Shell>
    );
  }

  if (sale.status === "pending") {
    return (
      <Shell>
        <Icon tone="yellow">
          <Loader2 className="animate-spin" />
        </Icon>
        <h1 className="mt-5 text-center text-2xl font-bold">Confirmation du paiement…</h1>
        <p className="mt-2 text-center text-[1.02rem] text-foreground/75">
          Si tu paies par Mobile Money, <strong>valide la transaction sur ton téléphone</strong> (code secret). Cette page se met à jour toute seule.
        </p>
        <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface p-4 text-sm">
          <Smartphone className="size-5 shrink-0" />
          <span>Ne ferme pas cette page. Tu recevras aussi ton accès par email à {sale.customerEmail}.</span>
        </div>
        {waitedLong && (
          <div className="mt-4 space-y-3 text-center">
            <p className="text-sm text-muted-foreground">Ça prend plus de temps que prévu. Si tu as annulé ou que rien ne s&apos;est passé sur ton téléphone :</p>
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-foreground px-6 font-semibold text-background disabled:opacity-60"
            >
              {retrying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Relancer le paiement
            </button>
          </div>
        )}
      </Shell>
    );
  }

  if (sale.status === "failed" || sale.status === "abandoned") {
    return (
      <Shell>
        <Icon tone="danger">
          <CircleAlert />
        </Icon>
        <h1 className="mt-5 text-center text-2xl font-bold">Le paiement n&apos;est pas passé</h1>
        <p className="mt-2 text-center text-[1.02rem] text-foreground/75">
          {sale.failureReason && sale.status === "failed" ? `${sale.failureReason}. ` : ""}
          Aucun montant n&apos;a été débité. Vérifie ton solde ou essaie un autre moyen de paiement.
        </p>
        <Summary sale={sale} />
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-brand-foreground text-lg font-bold disabled:opacity-60"
        >
          {retrying ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />} Réessayer le paiement
        </button>
        {retryError && <p className="mt-3 text-center text-sm text-destructive">{retryError}</p>}
        <Support whatsapp={whatsapp} supportEmail={supportEmail} />
      </Shell>
    );
  }

  if (sale.accessRevoked) {
    return (
      <Shell>
        <Icon tone="neutral">
          <ShieldBan />
        </Icon>
        <h1 className="mt-5 text-center text-2xl font-bold">Accès désactivé</h1>
        <p className="mt-2 text-center text-muted-foreground">L&apos;accès à ce produit a été désactivé. Contacte-nous si tu penses que c&apos;est une erreur.</p>
        <Support whatsapp={whatsapp} supportEmail={supportEmail} />
      </Shell>
    );
  }

  const first = sale.customerName.split(" ")[0];
  return (
    <Shell>
      <div className="text-center text-5xl" aria-hidden>
        🎉
      </div>
      <h1 className="mt-4 text-center font-heading text-[2.2rem] leading-tight">Merci {first} !</h1>
      <p className="mt-2 text-center text-[1.02rem] text-foreground/75">Paiement confirmé. Ton produit est prêt à être téléchargé.</p>

      <div className="mt-6 flex items-center gap-4 rounded-2xl bg-surface p-3">
        {sale.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sale.coverUrl} alt="" className="h-16 w-12 rounded-lg object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 font-semibold">{sale.productTitle}</div>
          <div className="text-sm text-muted-foreground">
            Commande #{sale.number} · {sale.charged ? formatMoney(sale.charged.amount, sale.charged.currency) : formatMoney(sale.net, "XOF")}
          </div>
        </div>
      </div>

      <ul className="mt-5 space-y-2.5">
        {sale.files.map((f) => (
          <li key={f.index}>
            <a
              href={`${SITE}/download?s=${sale._id}&k=${accessKey}&f=${f.index}`}
              className="flex min-h-16 items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background transition hover:bg-foreground/90"
            >
              <FileGlyph mime={f.mime} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block font-semibold [overflow-wrap:anywhere]">{f.name}</span>
                <span className="block text-sm text-background/70">{fileSize(f.size)}</span>
              </span>
              <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-bold text-brand-foreground">
                <Download className="size-4" /> Télécharger
              </span>
            </a>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[var(--success-bg)] p-4 text-sm text-[var(--success-fg)]">
        <Mail className="mt-0.5 size-5 shrink-0" />
        <span>
          Un email avec ce lien a été envoyé à <strong>{sale.customerEmail}</strong>. Garde-le : tu pourras re-télécharger à tout moment. Pense à vérifier tes spams.
        </span>
      </div>
      {!sale.customerPhone && <PhoneAsk saleId={saleId} accessKey={accessKey} />}
      <Support whatsapp={whatsapp} supportEmail={supportEmail} />
    </Shell>
  );
}

/** Numéro WhatsApp demandé après l'achat : facultatif, pour le suivi et l'aide si besoin. */
function PhoneAsk({ saleId, accessKey }: { saleId: string; accessKey: string }) {
  const v = useVisitor();
  const addPhone = useMutation(api.sales.addPhone);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[var(--success-bg)] p-4 text-sm text-[var(--success-fg)]">
        <Check className="mt-0.5 size-5 shrink-0" />
        <span>Numéro enregistré. Merci !</span>
      </div>
    );
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const tel = normalizePhone(phone, v.country);
    if (!tel) {
      setError("Numéro invalide : vérifie l'indicatif du pays (ex. +229…).");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await addPhone({ saleId, key: accessKey, phone: tel.e164 });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate className="mt-5 space-y-2.5 rounded-2xl border border-border p-4">
      <label htmlFor="after-phone" className="flex items-center gap-2 font-semibold">
        <WhatsAppIcon className="size-5" /> Ton numéro WhatsApp <span className="text-sm font-normal text-muted-foreground">(facultatif)</span>
      </label>
      <p className="text-sm text-muted-foreground">Pour que le vendeur puisse t&apos;aider si tu as un souci avec ton accès. Jamais de spam.</p>
      <div className="flex gap-2">
        <input
          id="after-phone"
          name="tel"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="done"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))}
          placeholder="+229 …"
          className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10"
        />
        <button
          type="submit"
          disabled={saving || !phone.trim()}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-foreground px-5 font-semibold text-background disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Enregistrer"}
        </button>
      </div>
      {error && <p className="text-sm font-medium text-destructive">{error}</p>}
    </form>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const base = useStoreBase();
  return (
    <main className="mx-auto max-w-lg px-4 pb-16 pt-6 sm:pt-12">
      <div className="rounded-[28px] bg-card p-6 sm:p-8">{children}</div>
      <p className="mt-6 text-center text-sm">
        <Link href={`${base}/`} className="font-medium text-muted-foreground underline-offset-4 hover:underline">
          Voir les autres produits
        </Link>
      </p>
    </main>
  );
}

function Icon({ tone, children }: { tone: "yellow" | "danger" | "neutral"; children: React.ReactNode }) {
  const cls = tone === "yellow" ? "bg-brand text-brand-foreground" : tone === "danger" ? "bg-[var(--danger-bg)] text-[var(--danger-fg)]" : "bg-surface";
  return <div className={`mx-auto flex size-16 items-center justify-center rounded-full [&_svg]:size-8 ${cls}`}>{children}</div>;
}

function Summary({ sale }: { sale: { productTitle: string; net: number; number: string; charged?: { amount: number; currency: string } } }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl bg-surface p-4">
      <span className="min-w-0 truncate font-medium">{sale.productTitle}</span>
      <span className="shrink-0 font-bold">{sale.charged ? formatMoney(sale.charged.amount, sale.charged.currency) : formatMoney(sale.net, "XOF")}</span>
    </div>
  );
}

function FileGlyph({ mime }: { mime: string }) {
  const cls = "size-6 shrink-0 stroke-[1.6]";
  if (mime.startsWith("audio/")) return <Headphones className={cls} />;
  if (mime.startsWith("video/")) return <Video className={cls} />;
  return <FileText className={cls} />;
}

function Support({ whatsapp, supportEmail }: { whatsapp?: string; supportEmail?: string }) {
  if (!whatsapp && !supportEmail) return null;
  return (
    <div className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">
      Besoin d&apos;aide ?{" "}
      {whatsapp && (
        <a
          href={waLink(whatsapp, "Bonjour, j'ai besoin d'aide pour ma commande.")}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-4"
        >
          <WhatsAppIcon className="size-4" /> Écris-nous sur WhatsApp
        </a>
      )}
      {whatsapp && supportEmail && " ou "}
      {supportEmail && (
        <a href={`mailto:${supportEmail}`} className="font-semibold text-foreground underline underline-offset-4">
          par email
        </a>
      )}
    </div>
  );
}
