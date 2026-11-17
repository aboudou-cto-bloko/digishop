"use client";

import { useMutation } from "convex/react";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Gift, ImagePlus, Loader2, MousePointerClick, Package, Plus, ShieldCheck, Star, Timer, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Switch } from "@/components/ui/switch";
import { errorMessage } from "@/lib/format";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { CountryPicker } from "./country-picker";
import { useStoreQuery } from "@/hooks/use-current-store";

type Testimonial = NonNullable<Doc<"products">["testimonials"]>[number];
type FaqItem = NonNullable<Doc<"products">["faq"]>[number];

export type ConversionState = {
  promo: { enabled: boolean; price: string; startsAt: string; endsAt: string; label: string; showCountdown: boolean };
  testimonials: Testimonial[];
  faq: FaqItem[];
  guarantee: { enabled: boolean; text: string };
  showSalesCount: boolean;
  stock: { enabled: boolean; limit: string };
  cta: string;
  bump: { enabled: boolean; productId: string; price: string; pitch: string };
  countries: string[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** datetime-local ↔ timestamp (heure locale du navigateur). */
const toLocalInput = (ts?: number) => {
  if (!ts) return "";
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : undefined);

export function initialConversion(p: Doc<"products">): ConversionState {
  return {
    promo: {
      enabled: Boolean(p.promo),
      price: p.promo ? String(p.promo.price) : "",
      startsAt: toLocalInput(p.promo?.startsAt),
      endsAt: toLocalInput(p.promo?.endsAt),
      label: p.promo?.label ?? "",
      showCountdown: p.promo?.showCountdown ?? true,
    },
    testimonials: p.testimonials ?? [],
    faq: p.faq ?? [],
    guarantee: { enabled: p.guarantee?.enabled ?? false, text: p.guarantee?.text ?? "Satisfait ou remboursé pendant 7 jours si le contenu ne correspond pas à la description." },
    showSalesCount: p.showSalesCount ?? false,
    stock: { enabled: p.stockLimit !== undefined, limit: p.stockLimit !== undefined ? String(p.stockLimit) : "" },
    cta: p.cta ?? "",
    bump: {
      enabled: Boolean(p.orderBump),
      productId: p.orderBump?.productId ?? "",
      price: p.orderBump ? String(p.orderBump.price) : "",
      pitch: p.orderBump?.pitch ?? "",
    },
    countries: p.countries ?? [],
  };
}

/** Transforme l'état du formulaire en arguments de products.update (validation légère côté client). */
export function conversionPayload(c: ConversionState): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  let promo = null;
  if (c.promo.enabled) {
    const price = Number(c.promo.price);
    const endsAt = fromLocalInput(c.promo.endsAt);
    if (!price) return { ok: false, error: "Indique le prix promo." };
    if (!endsAt) return { ok: false, error: "Indique la date de fin de la promo." };
    promo = { price, startsAt: fromLocalInput(c.promo.startsAt), endsAt, label: c.promo.label.trim() || undefined, showCountdown: c.promo.showCountdown };
  }
  let stockLimit: number | null = null;
  if (c.stock.enabled) {
    stockLimit = Number(c.stock.limit);
    if (!Number.isInteger(stockLimit) || stockLimit < 1) return { ok: false, error: "Indique le nombre d'exemplaires en vente (1 minimum)." };
  }
  let orderBump = null;
  if (c.bump.enabled) {
    if (!c.bump.productId) return { ok: false, error: "Choisis le produit de l'offre complémentaire." };
    orderBump = { productId: c.bump.productId as Id<"products">, price: Number(c.bump.price) || 0, pitch: c.bump.pitch.trim() };
  }
  return {
    ok: true,
    data: {
      promo,
      orderBump,
      testimonials: c.testimonials.map((t) => ({ ...t, name: t.name.trim(), text: t.text.trim(), city: t.city?.trim() || undefined })),
      faq: c.faq.map((f) => ({ ...f, question: f.question.trim(), answer: f.answer.trim() })),
      guarantee: c.guarantee.enabled ? { enabled: true, text: c.guarantee.text.trim() } : null,
      showSalesCount: c.showSalesCount,
      stockLimit,
      cta: c.cta.trim(),
      countries: c.countries,
    },
  };
}

export function ConversionEditor({
  productId,
  regularPrice,
  value: c,
  onChange,
  photoUrls,
}: {
  productId: Id<"products">;
  regularPrice: number;
  value: ConversionState;
  onChange: (c: ConversionState) => void;
  photoUrls: Record<string, string | null>;
}) {
  const products = useStoreQuery(api.products.adminList, {});
  const genUrl = useMutation(api.settings.generateUploadUrl);
  const storeCountries = useStoreQuery(api.settings.adminSettings, {})?.countries ?? [];
  const [localPhotos, setLocalPhotos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const set = <K extends keyof ConversionState>(k: K, v: ConversionState[K]) => onChange({ ...c, [k]: v });

  const promoPrice = Number(c.promo.price) || 0;
  const promoPct = promoPrice && regularPrice ? Math.round((1 - promoPrice / regularPrice) * 100) : 0;

  const move = <T,>(arr: T[], i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };

  const uploadPhoto = async (id: string, file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisis une image.");
    setUploading(id);
    try {
      const storageId = (await uploadToConvex(await genUrl(), file)) as Id<"_storage">;
      setLocalPhotos((x) => ({ ...x, [storageId]: URL.createObjectURL(file) }));
      set("testimonials", c.testimonials.map((t) => (t.id === id ? { ...t, photoId: storageId } : t)));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Promo programmée */}
      <Section icon={<Timer />} title="Promotion programmée" subtitle="Prix réduit entre deux dates, avec compte à rebours. Le prix normal revient tout seul à la fin." toggle={c.promo.enabled} onToggle={(v) => set("promo", { ...c.promo, enabled: v })}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prix promo (F CFA)" help={promoPct > 0 ? `-${promoPct} % par rapport au prix normal` : undefined}>
            <input inputMode="numeric" value={c.promo.price} onChange={(e) => set("promo", { ...c.promo, price: e.target.value.replace(/\D/g, "") })} placeholder="1500" className={inputCls} />
          </Field>
          <Field label="Libellé (optionnel)">
            <input value={c.promo.label} onChange={(e) => set("promo", { ...c.promo, label: e.target.value })} placeholder="Offre de lancement" maxLength={40} className={inputCls} />
          </Field>
          <Field label="Début (optionnel)" help="Vide = dès maintenant">
            <input type="datetime-local" value={c.promo.startsAt} onChange={(e) => set("promo", { ...c.promo, startsAt: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Fin">
            <input type="datetime-local" value={c.promo.endsAt} onChange={(e) => set("promo", { ...c.promo, endsAt: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <ToggleRow label="Afficher le compte à rebours" checked={c.promo.showCountdown} onChange={(v) => set("promo", { ...c.promo, showCountdown: v })} />
      </Section>

      {/* Avis */}
      <Section icon={<Star />} title="Avis clients" subtitle="Les avis de vrais clients sont le premier levier de confiance. Photo : carré, 200 × 200 px.">
        <div className="space-y-3">
          {c.testimonials.map((t, i) => {
            const photo = t.photoId ? (localPhotos[t.photoId] ?? photoUrls[t.photoId] ?? null) : null;
            return (
              <div key={t.id} className="space-y-3 rounded-2xl bg-surface p-4">
                <div className="flex items-start gap-3">
                  <label className="relative flex size-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-card">
                    {photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="size-full object-cover" />
                    ) : (
                      <ImagePlus className="size-5 text-muted-foreground" />
                    )}
                    {uploading === t.id && <Loader2 className="absolute size-5 animate-spin" />}
                    <input type="file" accept="image/*" className="sr-only" onChange={(e) => uploadPhoto(t.id, e.target.files?.[0])} aria-label="Photo du client" />
                  </label>
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <input value={t.name} onChange={(e) => set("testimonials", c.testimonials.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))} placeholder="Prénom Nom" className={inputCls} aria-label="Nom" />
                    <input value={t.city ?? ""} onChange={(e) => set("testimonials", c.testimonials.map((x) => (x.id === t.id ? { ...x, city: e.target.value } : x)))} placeholder="Ville (ex. Cotonou)" className={inputCls} aria-label="Ville" />
                  </div>
                </div>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Note">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={t.rating === n}
                      aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                      onClick={() => set("testimonials", c.testimonials.map((x) => (x.id === t.id ? { ...x, rating: n } : x)))}
                      className="flex size-10 items-center justify-center"
                    >
                      <Star className={cn("size-6", n <= t.rating ? "fill-[#f5a524] text-[#f5a524]" : "text-[#d4d7d4]")} />
                    </button>
                  ))}
                </div>
                <textarea
                  value={t.text}
                  onChange={(e) => set("testimonials", c.testimonials.map((x) => (x.id === t.id ? { ...x, text: e.target.value } : x)))}
                  rows={3}
                  placeholder="« Grâce à ce guide, j'ai lancé mon élevage en 3 semaines… »"
                  className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/10"
                />
                <RowActions
                  onUp={() => set("testimonials", move(c.testimonials, i, -1))}
                  onDown={() => set("testimonials", move(c.testimonials, i, 1))}
                  onDelete={() => set("testimonials", c.testimonials.filter((x) => x.id !== t.id))}
                />
              </div>
            );
          })}
          <AddButton onClick={() => set("testimonials", [...c.testimonials, { id: uid(), name: "", rating: 5, text: "" }])}>Ajouter un avis</AddButton>
        </div>
      </Section>

      {/* FAQ */}
      <Section icon={<span className="text-lg font-bold">?</span>} title="Questions fréquentes" subtitle="Réponds aux objections avant qu'elles ne bloquent l'achat (format, délai, paiement…).">
        <div className="space-y-3">
          {c.faq.map((f, i) => (
            <div key={f.id} className="space-y-2 rounded-2xl bg-surface p-4">
              <input value={f.question} onChange={(e) => set("faq", c.faq.map((x) => (x.id === f.id ? { ...x, question: e.target.value } : x)))} placeholder="Question" className={cn(inputCls, "font-semibold")} aria-label="Question" />
              <textarea
                value={f.answer}
                onChange={(e) => set("faq", c.faq.map((x) => (x.id === f.id ? { ...x, answer: e.target.value } : x)))}
                rows={3}
                placeholder="Réponse"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/10"
              />
              <RowActions onUp={() => set("faq", move(c.faq, i, -1))} onDown={() => set("faq", move(c.faq, i, 1))} onDelete={() => set("faq", c.faq.filter((x) => x.id !== f.id))} />
            </div>
          ))}
          <AddButton onClick={() => set("faq", [...c.faq, { id: uid(), question: "", answer: "" }])}>Ajouter une question</AddButton>
          {c.faq.length === 0 && (
            <button
              type="button"
              onClick={() =>
                set("faq", [
                  { id: uid(), question: "Comment je reçois le produit ?", answer: "Juste après le paiement : sur la page de confirmation et par email. Tu peux le télécharger sur téléphone ou ordinateur." },
                  { id: uid(), question: "Quels moyens de paiement acceptez-vous ?", answer: "Mobile Money (MTN, Moov, Wave…) et carte bancaire, via notre partenaire sécurisé Moneroo." },
                  { id: uid(), question: "Je n'ai pas reçu l'email, que faire ?", answer: "Vérifie tes spams, puis écris-nous sur WhatsApp avec ton numéro de commande : on te renvoie l'accès." },
                ])
              }
              className="text-sm font-semibold underline-offset-4 hover:underline"
            >
              Utiliser 3 questions types
            </button>
          )}
        </div>
      </Section>

      {/* Garantie + preuve sociale */}
      <Section icon={<ShieldCheck />} title="Garantie" toggle={c.guarantee.enabled} onToggle={(v) => set("guarantee", { ...c.guarantee, enabled: v })}>
        <textarea value={c.guarantee.text} onChange={(e) => set("guarantee", { ...c.guarantee, text: e.target.value })} rows={2} className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/10" />
      </Section>

      <Section
        icon={<Users />}
        title="Afficher le nombre de ventes sur la fiche produit"
        subtitle="Désactivé par défaut. Activé : « 120 personnes l'ont déjà acheté », à partir de 5 vraies ventes. Désactivé, le chiffre n'est jamais envoyé au navigateur et le produit n'apparaît pas dans les notifications d'achat."
        toggle={c.showSalesCount}
        onToggle={(v) => set("showSalesCount", v)}
      />

      {/* Bouton d'achat */}
      <Section icon={<MousePointerClick />} title="Bouton d'achat" subtitle="Le texte du bouton principal, de la barre mobile et de l'aperçu. Choisis un verbe qui décrit ce que le client obtient.">
        <CtaPicker value={c.cta} onChange={(v) => set("cta", v)} />
      </Section>

      {/* Stock limité */}
      <Section
        icon={<Package />}
        title="Stock limité"
        subtitle="Nombre d'exemplaires en vente. La fiche affiche « Vendu / Restant » avec une jauge ; une fois tout vendu, le produit passe en « Épuisé » et les paiements sont refusés."
        toggle={c.stock.enabled}
        onToggle={(v) => set("stock", { ...c.stock, enabled: v })}
      >
        <Field label="Exemplaires en vente (au total, ventes passées comprises)">
          <input inputMode="numeric" value={c.stock.limit} onChange={(e) => set("stock", { ...c.stock, limit: e.target.value.replace(/\D/g, "") })} placeholder="100" className={inputCls} />
        </Field>
      </Section>

      {/* Offre complémentaire */}
      <Section icon={<Gift />} title="Offre complémentaire au paiement" subtitle="Une case à cocher au checkout pour ajouter un 2e produit à prix spécial. Augmente le panier moyen." toggle={c.bump.enabled} onToggle={(v) => set("bump", { ...c.bump, enabled: v })}>
        <Field label="Produit proposé">
          <select value={c.bump.productId} onChange={(e) => set("bump", { ...c.bump, productId: e.target.value })} className={inputCls}>
            <option value="">Choisir un produit…</option>
            {products
              ?.filter((p) => p._id !== productId)
              .map((p) => (
                <option key={p._id} value={p._id}>
                  {p.title} ({p.price} F){p.status === "draft" ? " · brouillon" : ""}
                </option>
              ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prix spécial (F CFA)">
            <input inputMode="numeric" value={c.bump.price} onChange={(e) => set("bump", { ...c.bump, price: e.target.value.replace(/\D/g, "") })} placeholder="1000" className={inputCls} />
          </Field>
          <Field label="Argument (1 phrase)">
            <input value={c.bump.pitch} onChange={(e) => set("bump", { ...c.bump, pitch: e.target.value })} placeholder="Le complément idéal pour aller plus vite" maxLength={120} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Pays */}
      <Section title="Pays où le produit est vendu" subtitle="Par défaut, les pays de la boutique (Paramètres → Marchés). Restreins si ce produit ne concerne que certains pays : les autres visiteurs le voient mais ne peuvent pas payer.">
        <CountryPicker value={c.countries} onChange={(v) => set("countries", v)} restrictTo={storeCountries} inheritLabel="Comme la boutique" />
      </Section>
    </div>
  );
}

const inputCls = "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10";

function Section({
  icon,
  title,
  subtitle,
  toggle,
  onToggle,
  children,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  children?: ReactNode;
}) {
  const open = toggle === undefined || toggle;
  return (
    <section className="space-y-4 rounded-3xl border border-border p-5 sm:p-6">
      <div className="flex items-start gap-3">
        {icon && <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface [&_svg]:size-5 [&_svg]:stroke-[1.7]">{icon}</span>}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {onToggle && <Switch checked={Boolean(toggle)} onCheckedChange={onToggle} aria-label={title} />}
      </div>
      {open && children}
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-semibold">{label}</span>
      {children}
      {help && <span className="block text-sm text-muted-foreground">{help}</span>}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span className="text-sm font-semibold">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function RowActions({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete: () => void }) {
  const btn = "flex size-10 items-center justify-center rounded-lg hover:bg-card";
  return (
    <div className="flex justify-end gap-1">
      <button type="button" onClick={onUp} className={btn} aria-label="Monter">
        <ArrowUp className="size-4" />
      </button>
      <button type="button" onClick={onDown} className={btn} aria-label="Descendre">
        <ArrowDown className="size-4" />
      </button>
      <button type="button" onClick={onDelete} className={cn(btn, "text-destructive")} aria-label="Supprimer">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#d4d7d4] font-semibold hover:bg-surface">
      <Plus className="size-4" /> {children}
    </button>
  );
}

const CTA_PRESETS = ["Acheter maintenant", "Télécharger", "Obtenir le guide", "Je le veux", "Réserver ma place"];
const CTA_MAX = 28;

/** Choix du texte du bouton d'achat : 5 propositions ou un texte libre (28 caractères max). */
function CtaPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const current = value.trim() || CTA_PRESETS[0];
  const [custom, setCustom] = useState(!CTA_PRESETS.includes(current));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Texte du bouton">
        {CTA_PRESETS.map((label) => {
          const on = !custom && current === label;
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setCustom(false);
                onChange(label === CTA_PRESETS[0] ? "" : label);
              }}
              className={cn("min-h-11 rounded-full px-4 text-sm font-semibold", on ? "bg-foreground text-background" : "bg-surface hover:bg-[#eceeec]")}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          role="radio"
          aria-checked={custom}
          onClick={() => setCustom(true)}
          className={cn("min-h-11 rounded-full px-4 text-sm font-semibold", custom ? "bg-foreground text-background" : "bg-surface hover:bg-[#eceeec]")}
        >
          Personnalisé…
        </button>
      </div>
      {custom && (
        <Field label={`Ton texte (${value.length}/${CTA_MAX})`}>
          <input autoFocus value={value} maxLength={CTA_MAX} onChange={(e) => onChange(e.target.value)} placeholder="Ex. Je commence aujourd'hui" className={inputCls} />
        </Field>
      )}
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aperçu</span>
        <span className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-brand px-3 text-center font-bold text-brand-foreground">{value.trim() || CTA_PRESETS[0]}</span>
      </div>
    </div>
  );
}
