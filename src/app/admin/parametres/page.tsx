"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Bell, Bot, Check, ChevronRight, FileText, Globe2, RefreshCw, Copy, CreditCard, Eye, EyeOff, Headset, Loader2, Mail, Search, Store, Target, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/format";
import { uploadToConvex } from "@/lib/upload";
import { CountryPicker } from "@/components/admin/country-picker";
import { PushSettings } from "@/components/admin/push-settings";
import { ExtraPixels, OdinSection } from "@/components/admin/odin-settings";
import { currencyName } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useStoreQuery, useStoreMutation, useStoreAction } from "@/hooks/use-current-store";

type Settings = NonNullable<ReturnType<typeof useSettings>>;
function useSettings() {
  return useStoreQuery(api.settings.adminSettings, {});
}

const SECTIONS = [
  { id: "boutique", label: "Boutique", desc: "Nom, logo et accroche affichés sur ta boutique.", icon: Store, tint: "bg-[#e3ecfb] text-[#1d4ed8]" },
  { id: "paiement", label: "Paiement", desc: "Connexion Moneroo et webhook de confirmation.", icon: CreditCard, tint: "bg-[#e3f9e8] text-[#15803d]" },
  { id: "marches", label: "Marchés et devises", desc: "Pays couverts, devises affichées, moyens de paiement par pays.", icon: Globe2, tint: "bg-[#e3ecfb] text-[#1d4ed8]" },
  { id: "pixels", label: "Pixels et Tracking", desc: "Facebook Pixel, API Conversions, TikTok Pixel.", icon: Target, tint: "bg-[#e3f9e8] text-[#15803d]" },
  { id: "seo", label: "SEO & Référencement", desc: "Titre et description pour Google et les partages.", icon: Search, tint: "bg-[#e3ecfb] text-[#1d4ed8]" },
  { id: "emails", label: "Emails", desc: "Envoi des accès clients (SMTP, avec secours).", icon: Mail, tint: "bg-[#fdf7c3] text-[#a16207]" },
  { id: "support", label: "Support client", desc: "WhatsApp et email de contact pour tes clients.", icon: Headset, tint: "bg-[#fdf7c3] text-[#a16207]" },
  { id: "odin", label: "OdiN", desc: "Clé d'API et webhook pour l'outil de vente automatique.", icon: Bot, tint: "bg-[#f3ead7] text-[#8a6a2f]" },
  { id: "notifications", label: "Notifications et application", desc: "Alertes de vente sur ton téléphone, installation du dashboard.", icon: Bell, tint: "bg-[#fde8e7] text-[#b42318]" },
] as const;

export default function SettingsPage() {
  const s = useSettings();
  if (!s) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48 rounded-3xl" />
      </div>
    );
  }
  return <SettingsForm key={String(s._id ?? "new")} s={s} />;
}

function SettingsForm({ s }: { s: Settings }) {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-heading text-4xl">Paramètres</h1>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link href="/admin/pages" className="flex items-center gap-4 rounded-3xl bg-surface p-5 hover:bg-[#eceeec] sm:col-span-2">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#ede9fe] text-[#6d28d9]">
            <FileText className="size-6 stroke-[1.6]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.05rem] font-semibold">Pages de contenu</span>
            <span className="block text-sm text-muted-foreground">Crée et gère tes pages : CGV, mentions légales, politique de confidentialité, remboursement…</span>
          </span>
          <ChevronRight className="size-5 text-muted-foreground" />
        </Link>
        {SECTIONS.map(({ id, label, desc, icon: Icon, tint }) => (
          <a key={id} href={`#${id}`} className="flex items-center gap-4 rounded-3xl bg-surface p-5 hover:bg-[#eceeec]">
            <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", tint)}>
              <Icon className="size-6 stroke-[1.6]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[1.05rem] font-semibold">{label}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
          </a>
        ))}
      </div>

      <div className="mt-10 space-y-10">
        <StoreSection s={s} />
        <PaymentSection />
        <MarketsSection s={s} />
        <PixelsSection s={s} />
        <SeoSection s={s} />
        <EmailSection s={s} />
        <SupportSection s={s} />
        <OdinSection />
        <Section id="notifications" title="Notifications et application" desc="Installe le dashboard sur ton téléphone et reçois une alerte à chaque vente, même application fermée. Valable pour toutes tes boutiques.">
          <PushSettings />
        </Section>
      </div>
    </div>
  );
}

function Section({ id, title, desc, children, onSave, saving }: { id: string; title: string; desc: ReactNode; children: ReactNode; onSave?: () => void; saving?: boolean }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.3fr] [&>*]:min-w-0">
        <div>
          <h2 className="font-heading text-[1.9rem] leading-tight">{title}</h2>
          <div className="mt-2 text-[0.95rem] text-muted-foreground">{desc}</div>
        </div>
        <div className="space-y-5">
          {children}
          {onSave && (
            <div className="flex justify-end">
              <button type="button" onClick={onSave} disabled={saving} className="inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-6 font-semibold hover:bg-[#eceeec] disabled:opacity-60">
                {saving && <Loader2 className="size-4 animate-spin" />} Enregistrer
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block font-semibold">{label}</span>
      {children}
      {help && <span className="block text-sm text-muted-foreground">{help}</span>}
    </label>
  );
}

const inputCls = "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10";

function useSave() {
  const update = useStoreMutation(api.settings.updateSettings);
  const [saving, setSaving] = useState(false);
  const save = async (patch: Parameters<typeof update>[0]): Promise<boolean> => {
    setSaving(true);
    try {
      await update(patch);
      toast.success("Paramètres enregistrés");
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

function StoreSection({ s }: { s: Settings }) {
  const { save, saving } = useSave();
  const genUrl = useMutation(api.settings.generateUploadUrl);
  const [storeName, setStoreName] = useState(s.storeName);
  const [ownerName, setOwnerName] = useState(s.ownerName ?? "");
  const [tagline, setTagline] = useState(s.tagline ?? "");
  const [busy, setBusy] = useState(false);

  const onLogo = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const id = await uploadToConvex(await genUrl(), file);
      await save({ logoId: id as Id<"_storage"> });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section id="boutique" title="Boutique" desc="Ce que tes clients voient en arrivant sur ta boutique." onSave={() => save({ storeName, ownerName, tagline })} saving={saving}>
      <div className="flex items-center gap-4">
        <label className="relative flex size-20 cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-surface">
          {s.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.logoUrl} alt="Logo" className="size-full object-cover" />
          ) : (
            <Store className="size-7 stroke-[1.4] text-muted-foreground" />
          )}
          {busy && <Loader2 className="absolute size-5 animate-spin" />}
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
        </label>
        <div className="text-sm text-muted-foreground">
          Logo carré : 512 × 512 px conseillé (min. 192 × 192), PNG sur fond transparent ou SVG. Il sert aussi d&apos;icône de la boutique (onglet, partage).
          {s.logoUrl && (
            <button type="button" onClick={() => save({ logoId: null })} className="mt-1 block font-semibold text-foreground underline-offset-4 hover:underline">
              Retirer le logo
            </button>
          )}
        </div>
      </div>
      <Field label="Nom de la boutique">
        <input value={storeName} onChange={(e) => setStoreName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Ton prénom et nom" help="Utilisé pour te saluer sur le dashboard.">
        <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Accroche de la boutique">
        <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Des guides pratiques pour réussir, en français" className={inputCls} />
      </Field>
    </Section>
  );
}

function PaymentSection() {
  const setup = useStoreQuery(api.settings.setupStatus, {});
  const webhookUrl = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""}/webhooks/moneroo`;
  return (
    <Section
      id="paiement"
      title="Paiement"
      desc={
        <>
          Les paiements passent par Moneroo (MTN MoMo, Moov, Wave, carte…). Les clés restent côté serveur : elles se configurent dans les variables d&apos;environnement Convex, jamais ici.
        </>
      }
    >
      <StatusRow ok={setup?.moneroo} label="Moneroo connecté" okText="Clé API et secret webhook présents" koText="Ajoute MONEROO_SECRET_KEY et MONEROO_WEBHOOK_SECRET" />
      <Field label="URL du webhook à coller dans Moneroo" help="Moneroo → Développeurs → Webhooks → Ajouter. Événements : payment.*">
        <CopyField value={webhookUrl} />
      </Field>
    </Section>
  );
}

function MarketsSection({ s }: { s: Settings }) {
  const catalog = useQuery(api.catalog.adminCatalog);
  const markets = useQuery(api.catalog.marketCountries);
  const refresh = useAction(api.catalog.refresh);
  const save = useStoreMutation(api.settings.updateMarkets);
  const [countries, setCountries] = useState<string[]>(s.countries ?? []);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Aperçu des devises qui seront proposées (la vraie liste est recalculée côté serveur)
  const currencies = [...new Set((markets?.countries ?? []).filter((c) => countries.includes(c.code)).map((c) => c.currency))];

  const onSave = async () => {
    setSaving(true);
    try {
      const r = await save({ countries });
      toast.success(r.currencies.length ? `Marchés enregistrés · devises : XOF, ${r.currencies.join(", ")}` : "Marchés enregistrés");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section
      id="marches"
      title="Marchés et devises"
      desc={
        <>
          Choisis les pays où tu vends. La liste vient de ton catalogue Moneroo : seuls les pays où un moyen de paiement local est disponible apparaissent, regroupés par devise.
          <br />
          <br />
          Les devises suivent automatiquement : un visiteur voit le prix et paie dans la devise de son pays, au taux du jour. Tes prix restent fixés en F CFA.
        </>
      }
      onSave={onSave}
      saving={saving}
    >
      <CountryPicker value={countries} onChange={setCountries} />

      <div className="rounded-2xl bg-surface p-4">
        <p className="text-sm font-semibold">Devises proposées aux acheteurs</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["XOF", ...currencies.filter((c) => c !== "XOF")].map((c) => (
            <span key={c} className="inline-flex h-9 items-center rounded-lg bg-card px-3 text-sm font-semibold">
              {c} · {currencyName(c)}
            </span>
          ))}
          {countries.length === 0 && <span className="self-center text-sm text-muted-foreground">+ la devise locale quand Moneroo l&apos;encaisse dans le pays du visiteur</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          Catalogue Moneroo : {markets?.countries.length ?? "…"} pays avec paiement local
          {catalog?.fxFetchedAt ? ` · taux du ${new Date(catalog.fxFetchedAt).toLocaleDateString("fr-FR")}` : ""}
        </span>
        <button
          type="button"
          disabled={refreshing}
          onClick={async () => {
            setRefreshing(true);
            try {
              toast.success(`Catalogue actualisé (${await refresh({})})`);
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setRefreshing(false);
            }
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 font-semibold text-foreground hover:bg-surface disabled:opacity-60"
        >
          <RefreshCw className={cn("size-4", refreshing && "animate-spin")} /> Actualiser
        </button>
      </div>
    </Section>
  );
}

function PixelsSection({ s }: { s: Settings }) {
  const { save, saving } = useSave();
  const [fbPixelId, setFb] = useState(s.fbPixelId ?? "");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testCode, setTestCode] = useState(s.fbTestEventCode ?? "");
  const [tiktok, setTiktok] = useState(s.tiktokPixelId ?? "");
  const testCapi = useStoreAction(api.meta.capi.testConnection);
  const [testing, setTesting] = useState(false);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const runTest = async () => {
    setTesting(true);
    setCheck(null);
    try {
      const r = await testCapi({});
      setCheck(r.ok ? { ok: true, text: `Connexion valide : Pixel « ${r.pixelName} » accessible avec le jeton enregistré.` } : { ok: false, text: r.error ?? "Échec" });
    } catch (e) {
      setCheck({ ok: false, text: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Section
      id="pixels"
      title="Pixels et Tracking"
      desc={
        <>
          Ajoute ton Pixel Facebook pour mesurer et optimiser tes campagnes. Les événements envoyés : <strong>PageView</strong>, <strong>ViewContent</strong>,{" "}
          <strong>InitiateCheckout</strong> et <strong>Purchase</strong> (avec le montant).
          <br />
          <br />
          Avec le jeton de l&apos;API Conversions, chaque achat est aussi envoyé par le serveur : il reste compté même quand le navigateur bloque le pixel (iOS, bloqueurs). Facebook dédoublonne automatiquement.
        </>
      }
      saving={saving}
      onSave={async () => {
        const ok = await save({
          fbPixelId,
          fbAccessToken: token ? token : undefined,
          fbTestEventCode: testCode,
          tiktokPixelId: tiktok,
        });
        // Le jeton ne reste jamais affiché après l'envoi : on ne voit que « enregistré » + ses 4 derniers caractères
        if (ok) {
          setToken("");
          setCheck(null);
        }
      }}
    >
      <Field label="ID Pixel Facebook" help="Gestionnaire d'événements Meta → Sources de données → ton pixel (15-16 chiffres).">
        <input value={fbPixelId} onChange={(e) => setFb(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="1385816843684946" className={inputCls} />
      </Field>
      <Field
        label="Jeton d'API de Conversion Facebook"
        help={
          s.hasFbAccessToken ? (
            <span className="inline-flex items-center gap-2">
              <Check className="size-4 text-[var(--success-fg)]" /> Jeton enregistré (se termine par …{s.fbAccessTokenHint}). Laisse vide pour le garder.
              <button type="button" onClick={() => save({ fbAccessToken: "" })} className="font-semibold text-foreground underline-offset-4 hover:underline">
                Supprimer
              </button>
            </span>
          ) : (
            "Gestionnaire d'événements → Paramètres → API Conversions → Générer un jeton d'accès."
          )
        }
      >
        <div className="flex h-12 items-center rounded-xl border border-border bg-card pr-1 focus-within:ring-2 focus-within:ring-foreground/10">
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            placeholder={s.hasFbAccessToken ? "Colle un nouveau jeton pour remplacer l'actuel" : "EAAG…"}
            className="h-full flex-1 bg-transparent px-4 text-base outline-none"
            autoComplete="off"
          />
          <button type="button" onClick={() => setShowToken((v) => !v)} className="flex size-10 items-center justify-center rounded-lg text-muted-foreground" aria-label={showToken ? "Masquer" : "Afficher"}>
            {showToken ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </Field>
      <div className="space-y-2">
        <div className={cn("flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold", s.hasFbAccessToken ? "bg-[var(--success-bg)] text-[var(--success-fg)]" : "bg-surface text-muted-foreground")}>
          {s.hasFbAccessToken ? <Check className="size-4" /> : null}
          {s.hasFbAccessToken ? `Jeton enregistré en base (se termine par …${s.fbAccessTokenHint})` : "Aucun jeton enregistré"}
        </div>
        <button type="button" onClick={runTest} disabled={testing || !s.hasFbAccessToken || !s.fbPixelId} className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec] disabled:opacity-50">
          {testing && <Loader2 className="size-4 animate-spin" />} Tester la connexion à Meta
        </button>
        {check && <p className={cn("text-sm", check.ok ? "text-[var(--success-fg)]" : "text-destructive")}>{check.text}</p>}
      </div>
      <Field label="Code d'événement test (optionnel)" help="Pour vérifier la réception dans l'onglet « Tester les événements ». Vide-le une fois les tests finis.">
        <input value={testCode} onChange={(e) => setTestCode(e.target.value.trim())} placeholder="TEST12345" className={inputCls} />
      </Field>
      <Field label="ID Pixel TikTok (optionnel)">
        <input value={tiktok} onChange={(e) => setTiktok(e.target.value.trim())} placeholder="C1A2B3C4D5E6F7G8H9" className={inputCls} />
      </Field>
      <ExtraPixels />
    </Section>
  );
}

function SeoSection({ s }: { s: Settings }) {
  const { save, saving } = useSave();
  const [title, setTitle] = useState(s.seoTitle ?? "");
  const [desc, setDesc] = useState(s.seoDescription ?? "");
  return (
    <Section id="seo" title="SEO & Référencement" desc="Le titre et la description de ta page d'accueil sur Google, WhatsApp et Facebook." onSave={() => save({ seoTitle: title, seoDescription: desc })} saving={saving}>
      <Field label="Titre" help={`${title.length}/60 caractères`}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} placeholder={s.storeName} className={inputCls} />
      </Field>
      <Field label="Description" help={`${desc.length}/160 caractères`}>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} rows={3} className="w-full rounded-xl border border-border px-4 py-3 text-base outline-none focus:ring-2 focus:ring-foreground/10" />
      </Field>
    </Section>
  );
}

function EmailSection({ s }: { s: Settings }) {
  const setup = useStoreQuery(api.settings.setupStatus, {});
  const sendTest = useStoreAction(api.email.send.sendTest);
  const { save, saving } = useSave();
  const [notifyEmail, setNotify] = useState(s.notifyEmail ?? "");
  const [testing, setTesting] = useState(false);
  const test = async () => {
    setTesting(true);
    try {
      const r = await sendTest({});
      if (r.ok) toast.success(`Email de test envoyé via ${r.provider}`);
      else toast.error(r.error ?? "Échec de l'envoi");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  };
  return (
    <Section
      id="emails"
      title="Emails"
      desc={
        <>
          Après chaque paiement, le client reçoit son lien d&apos;accès et toi une notification de vente. Plusieurs comptes SMTP peuvent être configurés (SMTP_1_*, SMTP_2_*…) : si le premier échoue, le suivant prend le relais.
        </>
      }
      onSave={() => save({ notifyEmail })}
      saving={saving}
    >
      <StatusRow ok={setup?.smtp} label="Envoi d'emails" okText="Au moins un compte SMTP configuré" koText="Ajoute SMTP_1_HOST, SMTP_1_USER, SMTP_1_PASS dans Convex" />
      <Field label="Recevoir les notifications de vente sur" help="Vide = l'email de connexion au dashboard.">
        <input type="email" value={notifyEmail} onChange={(e) => setNotify(e.target.value)} placeholder="moi@exemple.com" className={inputCls} />
      </Field>
      <button type="button" onClick={test} disabled={testing} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface disabled:opacity-60">
        {testing ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />} Envoyer un email de test
      </button>
    </Section>
  );
}

function SupportSection({ s }: { s: Settings }) {
  const { save, saving } = useSave();
  const [whatsapp, setWhatsapp] = useState(s.whatsapp ?? "");
  const [supportEmail, setSupportEmail] = useState(s.supportEmail ?? "");
  return (
    <Section id="support" title="Support client" desc="Affichés sur la page de livraison et dans l'email d'accès, pour qu'un client bloqué te joigne en un clic." onSave={() => save({ whatsapp, supportEmail })} saving={saving}>
      <Field label="Numéro WhatsApp" help="Format international : +229 01 00 00 00 00">
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" placeholder="+229 01 00 00 00 00" className={inputCls} />
      </Field>
      <Field label="Email de support" help="Les clients répondent à l'email d'accès vers cette adresse.">
        <input type="email" value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} className={inputCls} />
      </Field>
    </Section>
  );
}

function StatusRow({ ok, label, okText, koText }: { ok: boolean | undefined; label: string; okText: string; koText: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl px-4 py-3.5", ok ? "bg-[var(--success-bg)]" : "bg-[#fef3c7]")}>
      <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", ok ? "bg-[var(--success-fg)] text-white" : "bg-[#b45309] text-white")}>
        {ok ? <Check className="size-4 stroke-[3]" /> : <X className="size-4 stroke-[3]" />}
      </span>
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-sm text-foreground/75">{ok === undefined ? "Vérification…" : ok ? okText : koText}</div>
      </div>
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  return (
    <div className="flex h-12 items-center gap-1 rounded-xl border border-border bg-surface pl-4 pr-1">
      <span className="flex-1 truncate font-mono text-sm">{value}</span>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(value).then(() => toast.success("URL copiée"))}
        className="flex size-10 items-center justify-center rounded-lg hover:bg-card"
        aria-label="Copier"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}
