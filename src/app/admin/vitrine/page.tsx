"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ExternalLink, ImagePlus, Loader2, Monitor, RotateCw, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ACCENT_PRESETS, BACKGROUND_PRESETS, contrast, isHex, onColor } from "@/lib/color";
import { errorMessage } from "@/lib/format";
import { FONT_PAIRS, fontStyle, type FontPair } from "@/lib/store-fonts";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { useStoreQuery, useStoreMutation, useCurrentStore } from "@/hooks/use-current-store";

type Layout = "grid" | "editorial" | "spotlight";
type Draft = {
  layout: Layout;
  accent: string;
  background: string;
  font: FontPair;
  coverId?: Id<"_storage">;
  coverUrl: string | null;
  coverTitle: string;
  coverSubtitle: string;
  featuredProductId?: Id<"products">;
  socialProofPopup: boolean;
};

const LAYOUTS: { value: Layout; label: string; hint: string; sketch: ReactNode }[] = [
  {
    value: "grid",
    label: "Grille",
    hint: "Catalogue façon Chariow : idéal à partir de 3 produits.",
    sketch: (
      <>
        <rect x="6" y="6" width="68" height="10" rx="3" className="fill-current opacity-30" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={6 + i * 23} y="22" width="20" height="26" rx="3" className="fill-current opacity-60" />
        ))}
      </>
    ),
  },
  {
    value: "editorial",
    label: "Éditorial",
    hint: "Grande couverture plein écran puis liste aérée, effet magazine.",
    sketch: (
      <>
        <rect x="0" y="0" width="80" height="24" className="fill-current opacity-70" />
        <rect x="10" y="29" width="14" height="8" rx="2" className="fill-current opacity-50" />
        <rect x="28" y="30" width="40" height="3" rx="1.5" className="fill-current opacity-30" />
        <rect x="10" y="40" width="14" height="8" rx="2" className="fill-current opacity-50" />
        <rect x="28" y="41" width="40" height="3" rx="1.5" className="fill-current opacity-30" />
      </>
    ),
  },
  {
    value: "spotlight",
    label: "Produit vedette",
    hint: "L'accueil vend un seul produit : parfait pour un best-seller.",
    sketch: (
      <>
        <rect x="6" y="8" width="30" height="38" rx="4" className="fill-current opacity-60" />
        <rect x="42" y="12" width="32" height="6" rx="2" className="fill-current opacity-40" />
        <rect x="42" y="22" width="24" height="3" rx="1.5" className="fill-current opacity-25" />
        <rect x="42" y="32" width="22" height="8" rx="3" className="fill-current opacity-70" />
      </>
    ),
  },
];

export default function StorefrontPage() {
  const settings = useStoreQuery(api.settings.adminSettings, {});
  const products = useStoreQuery(api.products.listPublished, {});
  if (!settings || !products) {
    return (
      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Skeleton className="h-[600px] rounded-3xl" />
        <Skeleton className="h-[600px] rounded-3xl" />
      </div>
    );
  }
  return <Editor key={String(settings._id ?? "new")} settings={settings} products={products} />;
}

function Editor({
  settings,
  products,
}: {
  settings: FunctionReturnType<typeof api.settings.adminSettings>;
  products: FunctionReturnType<typeof api.products.listPublished>;
}) {
  const { store } = useCurrentStore();
  const updateTheme = useStoreMutation(api.settings.updateTheme);
  const saveDraft = useStoreMutation(api.settings.saveThemeDraft);
  const genUrl = useMutation(api.settings.generateUploadUrl);
  const t = settings.theme;
  const initial: Draft = {
    layout: t.layout,
    accent: t.accent,
    background: t.background,
    font: t.font,
    coverId: t.coverId,
    coverUrl: t.coverUrl,
    coverTitle: t.coverTitle ?? "",
    coverSubtitle: t.coverSubtitle ?? "",
    featuredProductId: t.featuredProductId,
    socialProofPopup: settings.socialProofPopup ?? false,
  };
  const [d, setD] = useState<Draft>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [mobileTab, setMobileTab] = useState<"settings" | "preview">("settings");
  const [frameKey, setFrameKey] = useState(0);
  const dirty = JSON.stringify(d) !== saved;
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setD((x) => ({ ...x, [k]: val }));

  const accentOk = isHex(d.accent);

  // Brouillon enregistré en continu : l'aperçu (vraie page /apercu) se met à jour en temps réel
  useEffect(() => {
    if (!/^#[0-9a-f]{6}$/i.test(d.accent)) return;
    const t = setTimeout(() => {
      saveDraft({
        theme: {
          layout: d.layout,
          accent: d.accent.toLowerCase(),
          background: d.background,
          font: d.font,
          coverId: d.coverId,
          coverTitle: d.coverTitle || undefined,
          coverSubtitle: d.coverSubtitle || undefined,
          featuredProductId: d.featuredProductId,
        },
        socialProofPopup: d.socialProofPopup,
      }).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [d, saveDraft]);
  const textContrast = accentOk ? contrast(d.accent, onColor(d.accent)) : 0;
  const bgContrast = accentOk ? contrast(d.accent, d.background) : 0;

  const onCover = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisis une image (JPG, PNG, WebP).");
    if (file.size > 10 * 1024 ** 2) return toast.error("Image trop lourde (10 Mo maximum).");
    setUploading(true);
    try {
      const id = (await uploadToConvex(await genUrl(), file)) as Id<"_storage">;
      setD((x) => ({ ...x, coverId: id, coverUrl: URL.createObjectURL(file) }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    if (!accentOk) return toast.error("Couleur d'accent invalide : utilise le format #RRGGBB.");
    setSaving(true);
    try {
      await updateTheme({
        theme: {
          layout: d.layout,
          accent: d.accent.toLowerCase(),
          background: d.background,
          font: d.font,
          coverId: d.coverId,
          coverTitle: d.coverTitle,
          coverSubtitle: d.coverSubtitle,
          featuredProductId: d.featuredProductId,
        },
        socialProofPopup: d.socialProofPopup,
      });
      setSaved(JSON.stringify(d));
      toast.success("Vitrine publiée 🎉");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-28">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-heading text-4xl">Vitrine</h1>
        <a href={store.url} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold hover:bg-[#eceeec]">
          <ExternalLink className="size-4" /> Voir ma boutique
        </a>
      </div>

      {/* Mobile : un onglet à la fois (réglages ou aperçu) */}
      <div className="sticky top-[68px] z-10 -mx-4 mb-4 bg-card px-4 pb-3 pt-1 xl:hidden">
        <div className="grid grid-cols-2 rounded-xl bg-surface p-1">
          {(["settings", "preview"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setMobileTab(tab)}
              aria-pressed={mobileTab === tab}
              className={cn("h-11 rounded-lg text-sm font-semibold", mobileTab === tab ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {tab === "settings" ? "Réglages" : "Aperçu en direct"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[440px_1fr] [&>*]:min-w-0">
        {/* ── Réglages ── */}
        <div className={cn("space-y-6", mobileTab !== "settings" && "hidden xl:block")}>
          <Block title="Mise en page">
            <div className="grid grid-cols-3 gap-2">
              {LAYOUTS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => set("layout", l.value)}
                  aria-pressed={d.layout === l.value}
                  className={cn(
                    "rounded-2xl border-2 p-2 text-left transition",
                    d.layout === l.value ? "border-foreground bg-card" : "border-transparent bg-surface hover:bg-[#eceeec]",
                  )}
                >
                  <svg viewBox="0 0 80 54" className="w-full rounded-lg bg-card text-foreground" aria-hidden>
                    {l.sketch}
                  </svg>
                  <span className="mt-2 block text-sm font-semibold">{l.label}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{LAYOUTS.find((l) => l.value === d.layout)?.hint}</p>
            {d.layout === "spotlight" && (
              <label className="block space-y-2">
                <span className="text-sm font-semibold">Produit mis en avant</span>
                <select
                  value={d.featuredProductId ?? ""}
                  onChange={(e) => set("featuredProductId", (e.target.value || undefined) as Id<"products"> | undefined)}
                  className="h-12 w-full rounded-xl border border-border bg-card px-3 text-base"
                >
                  <option value="">Le plus récent</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Block>

          <Block title="Couleur principale" subtitle="Boutons, badges et liens de ta boutique.">
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((c) => (
                <Swatch key={c.value} color={c.value} label={c.name} active={d.accent.toLowerCase() === c.value} onClick={() => set("accent", c.value)} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={accentOk ? d.accent : "#000000"}
                onChange={(e) => set("accent", e.target.value)}
                aria-label="Couleur personnalisée"
                className="size-12 cursor-pointer rounded-xl border border-border bg-card p-1"
              />
              <input
                value={d.accent}
                onChange={(e) => set("accent", e.target.value.trim())}
                className="h-12 w-36 rounded-xl border border-border bg-card px-3 font-mono text-base uppercase"
                aria-label="Code couleur"
              />
              <span
                className="inline-flex h-12 min-w-40 flex-1 items-center justify-center rounded-xl px-3 text-sm font-bold"
                style={{ background: accentOk ? d.accent : "#ccc", color: accentOk ? onColor(d.accent) : "#000" }}
              >
                Acheter maintenant
              </span>
            </div>
            {accentOk && textContrast < 4.5 && (
              <Warn>Le texte des boutons sera peu lisible sur cette couleur (contraste {textContrast.toFixed(1)}:1). Choisis une teinte plus claire ou plus foncée.</Warn>
            )}
            {accentOk && textContrast >= 4.5 && bgContrast < 1.25 && <Warn>La couleur se distingue mal du fond : les boutons risquent de passer inaperçus.</Warn>}
          </Block>

          <Block title="Fond">
            <div className="flex flex-wrap gap-2">
              {BACKGROUND_PRESETS.map((c) => (
                <Swatch key={c.value} color={c.value} label={c.name} active={d.background === c.value} onClick={() => set("background", c.value)} bordered />
              ))}
            </div>
          </Block>

          <Block title="Police">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(FONT_PAIRS) as FontPair[]).map((key) => {
                const f = fontStyle(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set("font", key)}
                    aria-pressed={d.font === key}
                    className={cn(
                      "rounded-2xl border-2 px-4 py-3 text-left transition",
                      f.className,
                      d.font === key ? "border-foreground bg-card" : "border-transparent bg-surface hover:bg-[#eceeec]",
                    )}
                    style={f.style}
                  >
                    <span className="block text-2xl leading-tight" style={{ fontFamily: FONT_PAIRS[key].heading }}>
                      Aa Titre
                    </span>
                    <span className="mt-0.5 block text-sm">{FONT_PAIRS[key].label}</span>
                    <span className="block font-sans text-xs text-muted-foreground" style={{ fontFamily: "var(--font-outfit)" }}>
                      {FONT_PAIRS[key].hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </Block>

          <Block title="Image de couverture" subtitle="Format paysage 16:9 : 1920 × 1080 px conseillé (minimum 1280 × 720), JPG ou WebP, moins de 1 Mo idéalement. Garde le sujet au centre : les bords sont recadrés sur mobile.">
            <label className="relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-surface">
              {d.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.coverUrl} alt="Couverture" className="size-full object-cover" />
              ) : (
                <span className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImagePlus className="size-8 stroke-[1.4]" />
                  <span className="text-sm font-medium">Ajouter une couverture</span>
                </span>
              )}
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-card/70">
                  <Loader2 className="size-6 animate-spin" />
                </span>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onCover(e.target.files?.[0])} />
            </label>
            {d.coverUrl && (
              <button type="button" onClick={() => setD((x) => ({ ...x, coverId: undefined, coverUrl: null }))} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-destructive">
                <Trash2 className="size-4" /> Retirer la couverture
              </button>
            )}
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Titre</span>
              <input value={d.coverTitle} onChange={(e) => set("coverTitle", e.target.value)} placeholder={settings.storeName} maxLength={90} className="h-12 w-full rounded-xl border border-border bg-card px-4 text-base" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Sous-titre</span>
              <input value={d.coverSubtitle} onChange={(e) => set("coverSubtitle", e.target.value)} placeholder={settings.tagline ?? "Ta promesse en une phrase"} maxLength={200} className="h-12 w-full rounded-xl border border-border bg-card px-4 text-base" />
            </label>
          </Block>

          <Block title="Preuve sociale">
            <label className="flex items-start justify-between gap-4">
              <span>
                <span className="block font-semibold">Notifications d&apos;achat récentes</span>
                <span className="block text-sm text-muted-foreground">« Moukaïla (Bénin) vient d&apos;acheter… ». Basé uniquement sur tes vraies ventes, prénom et pays seulement.</span>
              </span>
              <Switch checked={d.socialProofPopup} onCheckedChange={(v) => set("socialProofPopup", v)} />
            </label>
          </Block>
        </div>

        {/* ── Aperçu : la vraie boutique (route /apercu), scrollable et navigable ── */}
        <div className={cn("xl:sticky xl:top-[84px] xl:self-start", mobileTab !== "preview" && "hidden xl:block")}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="size-2 animate-pulse rounded-full bg-[#22c55e]" /> En direct
              <button type="button" onClick={() => setFrameKey((k) => k + 1)} className="ml-1 inline-flex size-9 items-center justify-center rounded-lg hover:bg-surface" aria-label="Revenir à l'accueil de l'aperçu" title="Revenir à l'accueil">
                <RotateCw className="size-4" />
              </button>
            </span>
            <div className="flex rounded-xl bg-surface p-1">
              {(["mobile", "desktop"] as const).map((dv) => (
                <button
                  key={dv}
                  type="button"
                  onClick={() => setDevice(dv)}
                  aria-pressed={device === dv}
                  className={cn("inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold", device === dv ? "bg-card shadow-sm" : "text-muted-foreground")}
                >
                  {dv === "mobile" ? <Smartphone className="size-4" /> : <Monitor className="size-4" />}
                  {dv === "mobile" ? "Mobile" : "Ordinateur"}
                </button>
              ))}
            </div>
          </div>
          <PreviewFrame device={device} frameKey={frameKey} src={`/apercu/${store.slug}`} />
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-[104px] z-30 flex justify-center px-4 transition lg:bottom-6 lg:pl-[272px]",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl bg-foreground p-2 pl-5 text-background shadow-2xl">
          <span className="flex-1 text-sm font-medium">Modifications non publiées</span>
          <button type="button" onClick={() => setD(JSON.parse(saved) as Draft)} className="h-11 rounded-xl px-3 text-sm font-semibold text-background/80 hover:text-background" title="Revenir à la version publiée">
            Annuler
          </button>
          <button type="button" onClick={publish} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-foreground disabled:opacity-60">
            {saving && <Loader2 className="size-4 animate-spin" />} Publier
          </button>
        </div>
      </div>
    </div>
  );
}

/** Cadre d'aperçu : iframe sur /apercu, à la vraie largeur (390 px ou 1280 px), mis à l'échelle si besoin. */
function PreviewFrame({ device, frameKey, src }: { device: "mobile" | "desktop"; frameKey: number; src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const width = device === "mobile" ? 390 : 1280;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, (e.contentRect.width - 12) / width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  // Hauteur visible fixe ; la page défile à l'intérieur de l'iframe
  const visible = device === "mobile" ? 720 : 760;
  return (
    <div ref={ref} className={cn("mx-auto w-full", device === "mobile" && "max-w-[402px]")}>
      <div
        className="overflow-hidden rounded-[32px] border-[6px] border-foreground/90 bg-card shadow-xl"
        style={{ height: Math.round(visible * scale) + 12, width: Math.round(width * scale) + 12, maxWidth: "100%" }}
      >
        <iframe
          key={`${device}-${frameKey}`}
          src={src}
          title="Aperçu en direct de la boutique"
          className="block origin-top-left border-0 bg-background"
          style={{ width, height: visible, transform: `scale(${scale})` }}
        />
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Fais défiler et clique sur un produit : c&apos;est ta vraie boutique, avec tes réglages non publiés.</p>
    </div>
  );
}

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-border p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({ color, label, active, onClick, bordered }: { color: string; label: string; active: boolean; onClick: () => void; bordered?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn("flex size-11 items-center justify-center rounded-full ring-offset-2 transition", active && "ring-2 ring-foreground", bordered && "border border-border")}
      style={{ background: color }}
    >
      {active && <Check className="size-5" style={{ color: onColor(color) }} />}
    </button>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-[#fef3c7] px-3 py-2.5 text-sm text-[#92400e]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {children}
    </p>
  );
}
