"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Gift, Loader2, Lock, X } from "lucide-react";
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import { z } from "zod";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { effectivePrice, type Promo } from "../../../../../convex/lib/pricing";
import { useVisitor } from "@/components/store/visitor";
import { countryFromPhone, countryName, formatMoney, normalizePhone } from "@/lib/geo";
import { CountryBadge } from "@/components/store/country-badge";
import { track, sessionKey, type CheckoutError } from "@/lib/track";
import { captureAttribution, deviceLabel, fbTrack, metaCookies, newEventId, ttTrack, visitorId } from "@/lib/tracking";
import { cn } from "@/lib/utils";
import { startCheckout } from "../actions";

type Product = {
  _id: Id<"products">;
  title: string;
  slug: string;
  price: number;
  compareAtPrice?: number;
  promo: Promo | null;
  coverUrl: string | null;
  fileCount: number;
  countries: string[];
  bump: {
    title: string;
    coverUrl: string | null;
    price: number;
    regularPrice: number;
    pitch: string;
  } | null;
};

const BUYER_KEY = "ds_buyer";

const baseSchema = z.object({
  name: z.string().trim().min(2, "Indique ton nom et prénom."),
  email: z.email("Vérifie ton adresse email : ton accès y sera envoyé."),
});
const EMAIL_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahou.com": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.con": "outlook.com",
  "icloud.con": "icloud.com",
};

/** Faute de frappe courante dans le domaine (le lien d'accès part par email : une erreur = un client qui ne reçoit rien). */
function suggestEmail(email: string): string | null {
  const [local, domain] = email.trim().toLowerCase().split("@");
  const fixed = domain ? EMAIL_TYPOS[domain] : undefined;
  return local && fixed ? `${local}@${fixed}` : null;
}

function dialPrefix(country?: string) {
  try {
    return country ? `+${getCountryCallingCode(country as CountryCode)} ` : "+";
  } catch {
    return "+";
  }
}

/** Classe un message d'erreur serveur en code court (le texte lui-même n'est pas envoyé). */
function serverErrorCode(message: string): CheckoutError {
  const m = message.toLowerCase();
  if (m.includes("fermée")) return "store_closed";
  if (m.includes("pays")) return "country_blocked";
  if (m.includes("épuis") || m.includes("stock")) return "out_of_stock";
  return "server";
}

type Errors = Partial<Record<"name" | "email" | "phone", string>>;

/**
 * Formulaire de paiement. Deux présentations : page autonome (liens directs, relances) ou widget
 * ouvert par-dessus la fiche produit (`onClose` fourni) — même logique, mêmes contrôles serveur.
 */
export function CheckoutForm({
  product,
  legal,
  now,
  base = "",
  onClose,
}: {
  product: Product;
  legal: { cgv?: string; refund?: string };
  now: number;
  base?: string;
  onClose?: () => void;
}) {
  const v = useVisitor();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [icEventId] = useState(() => newEventId("ic"));
  const [method, setMethod] = useState<string | undefined>(undefined);
  const methods = useQuery(api.routing.methodsForCountry, v.country ? { country: v.country } : "skip");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<string | null>(null);
  const [withBump, setWithBump] = useState(false);
  const [reprise, setReprise] = useState<{
    saleId: string;
    key: string;
  } | null>(null);
  const trackStart = useMutation(api.analytics.trackCheckoutStart);
  const previous = useQuery(api.sales.forThankYou, reprise ? { saleId: reprise.saleId, key: reprise.key } : "skip");

  const preview = useQuery(api.coupons.preview, appliedCode ? { code: appliedCode, productId: product._id } : "skip");
  const { price } = effectivePrice(product, now);
  const discount = preview?.ok ? preview.discount : 0;
  const bumpPrice = withBump && product.bump ? product.bump.price : 0;
  const total = price - discount + bumpPrice;
  const coverage = product.countries.length ? product.countries : v.coverage;
  const blocked = Boolean(v.country && coverage.length && !coverage.includes(v.country));

  useEffect(() => {
    // Préremplissage après hydratation (localStorage / URL indisponibles côté serveur)
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const saved = JSON.parse(localStorage.getItem(BUYER_KEY) ?? "null") as {
        name?: string;
        email?: string;
        phone?: string;
      } | null;
      if (saved) {
        setName(saved.name ?? "");
        setEmail(saved.email ?? "");
        if (saved.phone) setPhone(saved.phone);
      }
    } catch {}
    const url = new URL(window.location.href);
    // « promo » (et non « code », intercepté par Convex Auth comme code de connexion)
    const code = url.searchParams.get("promo") ?? url.searchParams.get("code");
    if (code) {
      setPromoOpen(true);
      setPromoInput(code.toUpperCase());
      setAppliedCode(code.toUpperCase());
    }
    const r = url.searchParams.get("reprise");
    const k = url.searchParams.get("k");
    if (r && k) setReprise({ saleId: r, key: k });
    /* eslint-enable react-hooks/set-state-in-effect */
    trackStart({
      productId: product._id,
      visitorId: visitorId(),
      country: v.country,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule mesure par ouverture, le pays n'est qu'un attribut
  }, [product._id, trackStart]);

  // Tracking maison : ouverture du paiement + résultat d'un code promo
  useEffect(() => {
    track("checkout_open", { productId: product._id });
  }, [product._id]);
  // InitiateCheckout dès l'OUVERTURE du paiement (et non à la validation) : c'est l'événement que les pubs Meta optimisent.
  // Tant qu'il n'arrivait qu'après « Payer », un petit compte ne donnait aucun signal et Meta diffusait sur les clics les moins chers.
  // Même event_id qu'à la validation : l'API Conversions envoyée par le serveur est dédupliquée, jamais comptée deux fois.
  useEffect(() => {
    fbTrack("InitiateCheckout", { content_ids: [product._id], content_name: product.title, content_type: "product", value: price, currency: "XOF", num_items: 1 }, icEventId);
    ttTrack("InitiateCheckout", { content_id: product._id, value: price, currency: "XOF" }, icEventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule mesure par ouverture, le prix n'est qu'un attribut
  }, [product._id, icEventId]);
  // Pays non couvert : l'acheteur voit le message de blocage et ne peut pas payer
  useEffect(() => {
    if (blocked)
      track("checkout_error", {
        productId: product._id,
        props: { error: "country_blocked" },
      });
  }, [blocked, product._id]);
  useEffect(() => {
    if (appliedCode && preview !== undefined)
      track("coupon_apply", {
        productId: product._id,
        props: { ok: Boolean(preview?.ok) },
      });
  }, [appliedCode, preview, product._id]);
  // Nom du champ quitté rempli (jamais sa valeur) : sert à mesurer où les acheteurs abandonnent
  const fieldDone = (field: "name" | "email" | "phone" | "promo") => (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value.trim()) track("checkout_field", { productId: product._id, props: { field } });
  };

  // Reprise depuis un email de relance : les infos de la première tentative
  useEffect(() => {
    if (!previous) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setName((x) => x || previous.customerName);
    setEmail((x) => x || previous.customerEmail);
    if (previous.customerPhone) setPhone((x) => (x && x.replace(/\D/g, "").length > 4 ? x : previous.customerPhone!));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [previous]);

  // Indicatif du pays détecté tant que le champ est vide
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhone((x) => (x.replace(/\D/g, "").length === 0 ? dialPrefix(v.country) : x));
  }, [v.country]);

  // Le numéro saisi est le signal le plus fiable du pays (la géolocalisation IP des opérateurs mobiles se trompe souvent) :
  // un +229 complet bascule le pays, donc les moyens de paiement et le prestataire, sans que l'acheteur ait à chercher un sélecteur.
  useEffect(() => {
    const fromPhone = countryFromPhone(phone);
    if (fromPhone && fromPhone !== v.country && normalizePhone(phone, fromPhone)) v.setCountry(fromPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seul le numéro doit déclencher le basculement
  }, [phone]);

  // Moyen de paiement : le premier proposé par défaut ; si le pays change et que le moyen n'existe plus, on reprend le premier
  useEffect(() => {
    if (!methods?.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMethod(undefined);
      return;
    }
    setMethod((cur) => (cur && methods.some((m) => m.code === cur) ? cur : methods[0]!.code));
  }, [methods]);

  // Validation au fil de l'eau : l'erreur apparaît en quittant le champ (jamais sur un champ vide), disparaît dès que c'est corrigé
  const fieldError = (field: "name" | "email" | "phone", value: string): string | undefined => {
    if (field === "phone") return normalizePhone(value, v.country) ? undefined : "Numéro WhatsApp invalide : vérifie l'indicatif du pays (ex. +229…).";
    const r = baseSchema.shape[field].safeParse(value);
    return r.success ? undefined : r.error.issues[0]?.message;
  };
  const checkField = (field: "name" | "email" | "phone", value: string, onlyIfFilled: boolean) => {
    // Un champ téléphone qui ne contient que l'indicatif pré-rempli compte comme vide
    if (field === "phone" && value.replace(/\D/g, "").length <= dialPrefix(v.country).replace(/\D/g, "").length && onlyIfFilled)
      return setErrors((cur) => (cur.phone ? { ...cur, phone: undefined } : cur));
    const err = onlyIfFilled && !value.trim() ? undefined : fieldError(field, value);
    setErrors((cur) => (cur[field] === err ? cur : { ...cur, [field]: err }));
  };
  const emailFix = suggestEmail(email);
  const phoneHasDigits = phone.replace(/\D/g, "").length > dialPrefix(v.country).replace(/\D/g, "").length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || blocked) return;
    setFormError(null);
    const errs: Errors = {};
    const parsed = baseSchema.safeParse({ name, email });
    if (!parsed.success) for (const issue of parsed.error.issues) errs[issue.path[0] as keyof Errors] ??= issue.message;
    // Le numéro WhatsApp est demandé avant le paiement : il sert aussi à déterminer le pays (et donc le prestataire de paiement)
    const tel = normalizePhone(phone, v.country);
    if (!tel) errs.phone = "Numéro WhatsApp invalide : vérifie l'indicatif du pays (ex. +229…).";
    if (Object.keys(errs).length || !parsed.success || !tel) {
      // Une seule erreur à la fois (la première, dans l'ordre du formulaire) : un formulaire vide ne se couvre pas de rouge
      const first = (["name", "email", "phone"] as const).find((f) => errs[f]);
      if (first) {
        // Une trace par erreur affichée (sans jamais envoyer ce que l'acheteur a saisi)
        track("checkout_error", {
          productId: product._id,
          props: { error: `invalid_${first}` as CheckoutError },
        });
        setErrors({ [first]: errs[first] });
        document.getElementById(first)?.focus();
      }
      return;
    }
    setErrors({});
    setPending(true);
    try {
      localStorage.setItem(BUYER_KEY, JSON.stringify({ name, email, phone: tel.national }));
    } catch {}

    track("payment_start", { productId: product._id });
    const attr = captureAttribution();
    // Même identifiant que l'événement envoyé à l'ouverture : Meta fusionne navigateur et serveur
    const eventId = icEventId;

    const res = await startCheckout({
      productId: product._id,
      name: parsed.data.name,
      email: parsed.data.email,
      phone: tel.e164,
      couponCode: preview?.ok ? (appliedCode ?? undefined) : undefined,
      withBump: withBump || undefined,
      currency: v.currency !== "XOF" ? v.currency : undefined,
      initiateEventId: eventId,
      method,
      context: {
        lang: navigator.language?.slice(0, 2),
        device: deviceLabel(navigator.userAgent),
        referrer: attr.referrer,
        utmSource: attr.utmSource,
        utmCampaign: attr.utmCampaign,
        country: v.country,
        sessionKey: sessionKey(),
        ...metaCookies(attr),
      },
    });
    if (res.ok) window.location.assign(res.redirectUrl);
    else {
      track("checkout_error", {
        productId: product._id,
        props: { error: serverErrorCode(res.error) },
      });
      setFormError(res.error);
      setPending(false);
    }
  };

  const local = v.convert(total);

  const Wrapper = onClose ? "div" : "main";
  return (
    <Wrapper className={onClose ? "px-4 pb-6 sm:px-6" : "mx-auto max-w-xl px-4 pb-16 pt-2 sm:pt-8"}>
      {onClose ? (
        <div className="sticky top-0 z-10 -mx-4 flex items-center gap-3 bg-surface/95 px-4 pb-2 pt-3 backdrop-blur sm:-mx-6 sm:px-6">
          <h2 className="min-w-0 flex-1 text-lg font-bold">Finaliser ma commande</h2>
          <button type="button" onClick={onClose} aria-label="Fermer le paiement" className="flex size-11 items-center justify-center rounded-full bg-card hover:bg-card/70">
            <X className="size-5" />
          </button>
        </div>
      ) : (
        <Link
          href={`${base}/p/${product.slug}`}
          className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[0.95rem] font-medium text-foreground/80 hover:text-foreground"
        >
          <ArrowLeft className="size-5" /> Retour au produit
        </Link>
      )}

      <div className="mt-3 flex items-center gap-4 rounded-[24px] bg-card p-4">
        {product.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.coverUrl} alt="" className="h-20 w-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="h-20 w-16 shrink-0 rounded-xl bg-surface" />
        )}
        <div className="min-w-0">
          {onClose ? <p className="line-clamp-2 font-semibold leading-snug">{product.title}</p> : <h1 className="line-clamp-2 font-semibold leading-snug">{product.title}</h1>}
          <p className="mt-1 text-sm text-muted-foreground">
            Produit digital · {product.fileCount} fichier
            {product.fileCount > 1 ? "s" : ""} · accès immédiat
          </p>
        </div>
      </div>

      {blocked && (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fef3c7] px-4 py-3 text-[0.95rem] text-[#92400e]">
          Ce produit n&apos;est pas encore disponible en {countryName(v.country)}. Si tu n&apos;es pas dans ce pays, change-le avec le drapeau en haut de la page.
        </p>
      )}

      <form onSubmit={submit} noValidate className="mt-4 space-y-4 rounded-[24px] bg-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">Tes informations</h2>

        <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Tu paies depuis</span>
          <CountryBadge labeled />
        </div>

        <Field id="name" label="Nom et prénom" error={errors.name} ok={!errors.name && name.trim().length >= 2}>
          <input
            id="name"
            name="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (errors.name) checkField("name", e.target.value, false);
            }}
            onBlur={(e) => {
              fieldDone("name")(e);
              checkField("name", name, true);
            }}
            autoComplete="name"
            autoCapitalize="words"
            autoCorrect="off"
            enterKeyHint="next"
            placeholder="Ex. : Awa Koné"
            className={inputCls(errors.name)}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field id="email" label="Email" hint="Ton lien de téléchargement sera envoyé ici." error={errors.email} ok={!errors.email && !fieldError("email", email) && Boolean(email)}>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) checkField("email", e.target.value, false);
            }}
            onBlur={(e) => {
              fieldDone("email")(e);
              checkField("email", email, true);
            }}
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            placeholder="toi@exemple.com"
            className={inputCls(errors.email)}
            aria-invalid={Boolean(errors.email)}
          />
          {emailFix && (
            <button
              type="button"
              onClick={() => {
                setEmail(emailFix);
                checkField("email", emailFix, false);
              }}
              className="text-left text-sm font-semibold text-foreground underline underline-offset-4"
            >
              Tu voulais écrire {emailFix} ? Touche ici pour corriger.
            </button>
          )}
        </Field>
        <Field
          id="phone"
          label="Numéro WhatsApp"
          hint="Pour t'aider si besoin. Jamais de spam."
          error={errors.phone}
          ok={!errors.phone && phoneHasDigits && Boolean(normalizePhone(phone, v.country))}
        >
          <input
            id="phone"
            name="tel"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/[^\d+ ]/g, ""));
              if (errors.phone) checkField("phone", e.target.value, false);
            }}
            onFocus={(e) => {
              // Le curseur se place après l'indicatif pré-rempli : on tape directement le numéro
              const el = e.currentTarget;
              requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
            }}
            onBlur={(e) => {
              fieldDone("phone")(e);
              checkField("phone", phone, true);
            }}
            autoComplete="tel"
            enterKeyHint="done"
            placeholder={`${dialPrefix(v.country)} …`}
            className={inputCls(errors.phone)}
            aria-invalid={Boolean(errors.phone)}
          />
        </Field>
        {product.bump && (
          <label
            className={cn(
              "flex cursor-pointer gap-3 rounded-2xl border-2 border-dashed p-4 transition",
              withBump ? "border-[var(--success-fg)] bg-[var(--success-bg)]/50" : "border-[#d4d7d4] hover:bg-surface",
            )}
          >
            <input
              type="checkbox"
              checked={withBump}
              onChange={(e) => {
                setWithBump(e.target.checked);
                track("bump_toggle", {
                  productId: product._id,
                  props: { on: e.target.checked },
                });
              }}
              className="mt-1 size-5 shrink-0 accent-[var(--success-fg)]"
            />
            {product.bump.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.bump.coverUrl} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" />
            )}
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-[var(--success-fg)]">
                <Gift className="size-4" /> Offre spéciale
              </span>
              <span className="mt-0.5 block font-semibold">
                Ajoute « {product.bump.title} » pour {v.format(product.bump.price)}
                {product.bump.regularPrice > product.bump.price && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground line-through">{v.format(product.bump.regularPrice)}</span>
                )}
              </span>
              {product.bump.pitch && <span className="mt-1 block text-sm text-foreground/75">{product.bump.pitch}</span>}
            </span>
          </label>
        )}

        <div className="border-t border-border pt-4">
          {!promoOpen ? (
            <button type="button" onClick={() => setPromoOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
              J&apos;ai un code promo <ChevronDown className="size-4" />
            </button>
          ) : (
            <div className="space-y-2">
              <label htmlFor="promo" className="block font-semibold">
                Code promo
              </label>
              <div className="flex gap-2">
                <input
                  id="promo"
                  onBlur={fieldDone("promo")}
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value.toUpperCase().replace(/\s/g, ""));
                    if (appliedCode) setAppliedCode(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (promoInput) setAppliedCode(promoInput);
                    }
                  }}
                  className={cn(inputCls(), "flex-1 font-mono uppercase")}
                  placeholder="CODE"
                />
                <button
                  type="button"
                  onClick={() => promoInput && setAppliedCode(promoInput)}
                  className="h-12 shrink-0 rounded-xl bg-foreground px-5 font-semibold text-background"
                >
                  Appliquer
                </button>
              </div>
              {appliedCode && preview === undefined && <p className="text-sm text-muted-foreground">Vérification…</p>}
              {preview?.ok && (
                <p className="flex items-center gap-1.5 text-sm font-semibold text-[var(--success-fg)]">
                  <Check className="size-4" /> Code {preview.code} appliqué : -{v.format(preview.discount)}
                </p>
              )}
              {preview && !preview.ok && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <X className="size-4" /> {preview.error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-2xl bg-surface p-4">
          <Row label="Prix" value={v.format(price)} />
          {discount > 0 && <Row label="Réduction" value={`-${v.format(discount)}`} accent />}
          {bumpPrice > 0 && <Row label={product.bump!.title} value={`+${v.format(bumpPrice)}`} />}
          <div className="flex items-baseline justify-between border-t border-border pt-2">
            <span className="font-semibold">Total à payer</span>
            <span className="text-right">
              <span className="block text-2xl font-bold">{formatMoney(local.amount, local.currency)}</span>
              {local.converted && <span className="block text-xs text-muted-foreground">soit {formatMoney(total, "XOF")} · taux du jour</span>}
            </span>
          </div>
        </div>

        {formError && (
          <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-[0.95rem] text-destructive">
            {formError}
          </p>
        )}

        {methods && methods.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">Comment veux-tu payer ?</legend>
            <div className="grid grid-cols-2 gap-2">
              {methods.map((m) => (
                <label
                  key={m.code}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-2.5 rounded-2xl border-2 px-3 py-2 text-sm font-semibold transition",
                    method === m.code ? "border-foreground bg-surface" : "border-border hover:bg-surface/60",
                  )}
                >
                  <input type="radio" name="method" value={m.code} checked={method === m.code} onChange={() => setMethod(m.code)} className="sr-only" />
                  {m.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.iconUrl} alt="" className="size-7 shrink-0 rounded-md object-contain" loading="lazy" />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface text-[0.65rem] font-bold">{m.name.slice(0, 2).toUpperCase()}</span>
                  )}
                  <span className="min-w-0 flex-1 leading-tight">{m.name}</span>
                  {method === m.code && <Check className="size-4 shrink-0" />}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* Collé en bas de l'écran : sur mobile (navigateur intégré de Facebook, clavier ouvert) le bouton restait hors de vue */}
        <div className="sticky bottom-3 z-10">
          <button
            type="submit"
            disabled={pending || blocked}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-lg font-bold text-brand-foreground shadow-lg transition hover:bg-brand-hover disabled:opacity-60"
          >
            {pending ? (
              <>
                <Loader2 className="size-5 animate-spin" /> Ouverture du paiement…
              </>
            ) : total === 0 ? (
              "Recevoir gratuitement"
            ) : (
              `Payer ${formatMoney(local.amount, local.currency)}`
            )}
          </button>
        </div>
        <p className="flex items-start justify-center gap-2 text-center text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          {total === 0 ? "Aucun paiement requis." : "Paiement sécurisé : Mobile Money ou carte bancaire."}
        </p>
        {legal.cgv && (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            En validant, tu acceptes nos{" "}
            <a href={`${base}/pages/${legal.cgv}`} target="_blank" className="underline underline-offset-2">
              conditions générales de vente
            </a>
            {legal.refund && (
              <>
                {" "}
                et notre{" "}
                <a href={`${base}/pages/${legal.refund}`} target="_blank" className="underline underline-offset-2">
                  politique de remboursement
                </a>
              </>
            )}
            . Le produit étant livré immédiatement, tu renonces au droit de rétractation dès son accès.
          </p>
        )}
      </form>
    </Wrapper>
  );
}

function inputCls(error?: string) {
  return cn(
    "h-12 w-full rounded-xl border bg-card px-4 text-base outline-none transition focus:ring-2",
    error ? "border-destructive focus:ring-destructive/20" : "border-border focus:ring-foreground/10",
  );
}

function Field({ id, label, hint, error, ok, children }: { id: string; label: string; hint?: string; error?: string; ok?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-1.5 font-semibold">
        {label}
        {ok && <Check className="size-4 text-[var(--success-fg)]" aria-label="Valide" />}
      </label>
      {children}
      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-[0.95rem]">
      <span className="min-w-0 truncate text-muted-foreground">{label}</span>
      <span className={cn("shrink-0 font-semibold", accent && "text-[var(--success-fg)]")}>{value}</span>
    </div>
  );
}
