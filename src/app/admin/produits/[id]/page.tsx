"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { use, useEffect, useState } from "react";
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  FileText,
  ImagePlus,
  Loader2,
  Rocket,
  Trash2,
  Upload,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { PublishBadge } from "@/components/admin/ui";
import { RichEditor } from "@/components/shared/rich-editor";
import { SeoPanel } from "@/components/admin/seo-panel";
import { htmlToText } from "@/lib/rich-html";
import { GalleryEditor } from "@/components/admin/gallery-editor";
import { ConversionEditor, conversionPayload, initialConversion, type ConversionState } from "@/components/admin/product-conversion";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, fcfa, fileSize } from "@/lib/format";
import { uploadToConvex } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { useStoreQuery, useStoreMutation, useCurrentStore } from "@/hooks/use-current-store";

type FileItem = Doc<"products">["files"][number];
type Uploading = { key: string; name: string; progress: number };

export default function ProductEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const product = useStoreQuery(api.products.adminGet, { id: id as Id<"products"> });

  if (product === undefined) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }
  if (product === null) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Ce produit n&apos;existe plus.</p>
        <Link href="/admin/produits" className="mt-4 inline-block font-semibold underline">
          Retour aux produits
        </Link>
      </div>
    );
  }
  // key : remonte le formulaire si le produit change ailleurs (évite les valeurs périmées)
  return <Editor key={product._id} product={product} />;
}

function Editor({ product }: { product: Doc<"products"> & { coverUrl: string | null; photoUrls: Record<string, string | null>; galleryUrls: Record<string, string | null> } }) {
  const { store } = useCurrentStore();
  const update = useStoreMutation(api.products.update);
  const setStatus = useStoreMutation(api.products.setStatus);
  const genUrl = useMutation(api.settings.generateUploadUrl);

  const [title, setTitle] = useState(product.title);
  const [tagline, setTagline] = useState(product.tagline ?? "");
  const [description, setDescription] = useState(product.description);
  const [price, setPrice] = useState(product.price ? String(product.price) : "");
  const [compareAt, setCompareAt] = useState(product.compareAtPrice ? String(product.compareAtPrice) : "");
  const [slug, setSlug] = useState(product.slug);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [coverBusy, setCoverBusy] = useState(false);
  const [conv, setConv] = useState<ConversionState>(() => initialConversion(product));
  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(product.seoDescription ?? "");
  const storeName = useStoreQuery(api.settings.adminSettings, {})?.storeName ?? "Ma boutique";
  const [convSaved, setConvSaved] = useState(() => JSON.stringify(initialConversion(product)));

  const priceNum = Number(price.replace(/\s/g, "")) || 0;
  const compareNum = Number(compareAt.replace(/\s/g, "")) || 0;
  const dirty =
    title !== product.title ||
    tagline !== (product.tagline ?? "") ||
    description !== product.description ||
    priceNum !== product.price ||
    compareNum !== (product.compareAtPrice ?? 0) ||
    slug !== product.slug ||
    seoTitle !== (product.seoTitle ?? "") ||
    seoDescription !== (product.seoDescription ?? "") ||
    JSON.stringify(conv) !== convSaved;
  const published = product.status === "published";
  const url = `${store.url}/p/${product.slug}`;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    if (compareNum && compareNum <= priceNum) {
      toast.error("Le prix barré doit être supérieur au prix de vente.");
      return false;
    }
    const convData = conversionPayload(conv);
    if (!convData.ok) {
      toast.error(convData.error);
      return false;
    }
    setSaving(true);
    try {
      await update({
        id: product._id,
        title,
        tagline,
        description,
        price: priceNum,
        compareAtPrice: compareNum || null,
        slug: slug !== product.slug ? slug : undefined,
        seoTitle,
        seoDescription,
        ...(convData.data as Partial<Parameters<typeof update>[0]>),
      });
      setConvSaved(JSON.stringify(conv));
      toast.success("Modifications enregistrées");
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    if (dirty && !(await save())) return;
    try {
      await setStatus({ id: product._id, status: published ? "draft" : "published" });
      toast.success(published ? "Produit repassé en brouillon" : "Produit publié 🎉 Partage son lien !");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const onCover = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choisis une image (JPG, PNG, WebP ou GIF).");
    if (file.size > (file.type === "image/gif" ? 15 : 8) * 1024 ** 2) return toast.error(file.type === "image/gif" ? "GIF trop lourd (15 Mo maximum)." : "Image trop lourde (8 Mo maximum).");
    setCoverBusy(true);
    try {
      const storageId = await uploadToConvex(await genUrl(), file);
      await update({ id: product._id, coverId: storageId as Id<"_storage"> });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCoverBusy(false);
    }
  };

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const added: FileItem[] = [];
    await Promise.all(
      Array.from(list).map(async (file) => {
        const key = `${file.name}-${file.size}-${Math.random()}`;
        setUploading((u) => [...u, { key, name: file.name, progress: 0 }]);
        try {
          const storageId = await uploadToConvex(await genUrl(), file, (p) =>
            setUploading((u) => u.map((x) => (x.key === key ? { ...x, progress: p } : x))),
          );
          added.push({ storageId: storageId as Id<"_storage">, name: file.name, size: file.size, mime: file.type || "application/octet-stream" });
        } catch (e) {
          toast.error(`${file.name} : ${errorMessage(e)}`);
        } finally {
          setUploading((u) => u.filter((x) => x.key !== key));
        }
      }),
    );
    if (added.length) {
      await update({ id: product._id, files: [...product.files, ...added] });
      toast.success(added.length > 1 ? `${added.length} fichiers ajoutés` : "Fichier ajouté");
    }
  };

  const removeFile = async (storageId: string) => {
    if (!window.confirm("Retirer ce fichier ? Les clients qui l'ont acheté ne pourront plus le télécharger.")) return;
    await update({ id: product._id, files: product.files.filter((f) => f.storageId !== storageId) });
  };

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/produits" className="flex size-11 items-center justify-center rounded-full bg-surface hover:bg-[#eceeec] lg:hidden" aria-label="Retour">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{product.title}</h1>
        <PublishBadge published={published} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-6">
          <Card title="Informations">
            <Field label="Nom du produit">
              <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} maxLength={120} />
            </Field>
            <Field label="Accroche" help="Une phrase sous le titre : la promesse principale.">
              <input
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className={inputCls}
                maxLength={160}
                placeholder="Ex. : Apprends à lire l'arabe en 30 jours, même en partant de zéro"
              />
            </Field>
            <Field label="Description" help="Ce que le client va apprendre, pour qui c'est fait, ce qu'il reçoit exactement.">
              <RichEditor
                value={description}
                onChange={setDescription}
                minHeight={280}
                placeholder="Décris ton produit : le problème qu'il résout, ce que le client va obtenir, pour qui il est fait…"
              />
            </Field>
          </Card>

          <Card title="Prix">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prix de vente (F CFA)">
                <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="2500" className={inputCls} />
              </Field>
              <Field label="Prix barré (optionnel)" help="Affiché barré à côté du prix.">
                <input inputMode="numeric" value={compareAt} onChange={(e) => setCompareAt(e.target.value.replace(/[^\d]/g, ""))} placeholder="5000" className={inputCls} />
              </Field>
            </div>
            {priceNum > 0 && priceNum < 200 && <p className="text-sm text-destructive">Le Mobile Money impose 200 F CFA minimum.</p>}
          </Card>

          <Card title="Fichiers livrés au client" subtitle="PDF, audio, vidéo, ZIP… Envoyés automatiquement après paiement.">
            <div className="space-y-2">
              {product.files.map((f) => (
                <div key={f.storageId} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                  <FileText className="size-6 shrink-0 stroke-[1.5] text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{f.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {fileSize(f.size)}
                      {f.pages ? ` · ${f.pages} page${f.pages > 1 ? "s" : ""}` : ""}
                    </div>
                    <PreviewStatus file={f} setting={product.previewPages} />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(f.storageId)}
                    className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-card hover:text-destructive"
                    aria-label={`Retirer ${f.name}`}
                  >
                    <Trash2 className="size-5" />
                  </button>
                </div>
              ))}
              {uploading.map((u) => (
                <div key={u.key} className="rounded-2xl bg-surface px-4 py-3">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="truncate">{u.name}</span>
                    <span className="tabular">{Math.round(u.progress * 100)} %</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e3e5e3]">
                    <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${u.progress * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            {product.files.some((f) => f.mime === "application/pdf" || /\.pdf$/i.test(f.name)) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Aperçu gratuit des PDF</div>
                  <div className="text-sm text-muted-foreground">Les visiteurs lisent les premières pages avant d&apos;acheter (jamais plus de la moitié du document).</div>
                </div>
                <select
                  aria-label="Nombre de pages en aperçu"
                  value={product.previewPages ?? 3}
                  onChange={(e) => void update({ id: product._id, previewPages: Number(e.target.value) }).then(() => toast.success("Aperçu mis à jour"))}
                  className="h-11 rounded-xl border border-border bg-card px-3 text-base"
                >
                  <option value={0}>Désactivé</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} page{n > 1 ? "s" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <label className="mt-1 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-[#d4d7d4] px-4 py-5 text-center hover:bg-surface">
              <Upload className="size-6 stroke-[1.5]" />
              <span className="font-semibold">Ajouter des fichiers</span>
              <span className="text-sm text-muted-foreground">Clique ou glisse ici</span>
              <input type="file" multiple className="sr-only" onChange={(e) => void onFiles(e.target.files).then(() => (e.target.value = ""))} />
            </label>
          </Card>

          <div>
            <h2 className="mb-1 mt-2 text-xl font-bold">Conversion</h2>
            <p className="mb-4 text-sm text-muted-foreground">Ce qui transforme un visiteur en acheteur : urgence, preuve sociale, réponses aux objections.</p>
            <ConversionEditor productId={product._id} regularPrice={priceNum} value={conv} onChange={setConv} photoUrls={product.photoUrls} />
          </div>

          <Card title="Référencement (SEO)" subtitle="Comment ton produit apparaît sur Google et quand tu partages son lien.">
            <SeoPanel
              title={seoTitle}
              description={seoDescription}
              fallbackTitle={title}
              fallbackDescription={tagline || description}
              slug={slug}
              storeName={storeName}
              onTitle={setSeoTitle}
              onDescription={setSeoDescription}
              price={priceNum ? `${priceNum.toLocaleString("fr-FR")} F CFA` : undefined}
              rating={
                conv.testimonials.length
                  ? { value: conv.testimonials.reduce((a, t) => a + t.rating, 0) / conv.testimonials.length, count: conv.testimonials.length }
                  : undefined
              }
              checks={[
                { ok: (seoTitle || title).trim().length >= 25 && (seoTitle || title).trim().length <= 60, label: "Titre entre 25 et 60 caractères, avec le mot-clé que tes clients tapent" },
                { ok: (seoDescription || tagline).trim().length >= 70, label: "Description de 70 à 155 caractères qui donne envie de cliquer" },
                { ok: htmlToText(description).split(/\s+/).filter(Boolean).length >= 150, label: "Description du produit d'au moins 150 mots (contenu indexable)" },
                { ok: Boolean(product.coverUrl), label: "Image de couverture (sert aussi au partage WhatsApp / Facebook)" },
                { ok: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && slug.length <= 60, label: "Adresse courte et lisible (ex. guide-elevage-poulets)" },
                { ok: conv.faq.length >= 2, label: "Au moins 2 questions fréquentes (affichables dans Google)" },
                { ok: conv.testimonials.length >= 1, label: "Au moins 1 avis client (étoiles dans les résultats)" },
                { ok: /<h2/.test(description), label: "Au moins un sous-titre dans la description" },
              ]}
            />
          </Card>

          <Card title="Lien du produit">
            <Field label="Adresse de la page">
              <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border focus-within:ring-2 focus-within:ring-foreground/10">
                <span className="hidden h-full items-center bg-surface px-3 text-sm text-muted-foreground sm:flex">/p/</span>
                <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} className="h-full flex-1 bg-card px-3 text-base outline-none" />
              </div>
            </Field>
          </Card>
        </div>

        {/* Colonne droite : couverture + publication + aperçu */}
        <div className="space-y-6 lg:sticky lg:top-[84px] lg:self-start">
          <Card title="Couverture" subtitle="Portrait 4:5, 1200 × 1500 px. Mets le titre en gros : la couverture est vue en petit sur mobile.">
            <label className="group relative block aspect-[4/5] cursor-pointer overflow-hidden rounded-2xl bg-surface">
              {product.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.coverUrl} alt="Couverture" className="size-full object-cover" />
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ImagePlus className="size-8 stroke-[1.4]" />
                  <span className="text-sm font-medium">Ajouter une image</span>
                  <span className="px-4 text-center text-xs">Portrait 4:5 · 1200 × 1500 px conseillé (min. 800 × 1000), JPG/PNG/WebP ou GIF animé</span>
                </span>
              )}
              {product.coverUrl && (
                <span className="absolute inset-x-3 bottom-3 rounded-xl bg-card/90 py-2.5 text-center text-sm font-semibold opacity-0 transition group-hover:opacity-100">
                  Changer l&apos;image
                </span>
              )}
              {coverBusy && (
                <span className="absolute inset-0 flex items-center justify-center bg-card/70">
                  <Loader2 className="size-6 animate-spin" />
                </span>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => onCover(e.target.files?.[0])} />
            </label>
          </Card>

          <Card title="Galerie (images et GIF)">
            <GalleryEditor productId={product._id} gallery={product.gallery ?? []} urls={product.galleryUrls} />
          </Card>

          <Card title="Publication">
            <p className="text-sm text-muted-foreground">
              {published ? "Ton produit est en vente. Partage le lien sur WhatsApp, Facebook, TikTok…" : "Brouillon : invisible pour les clients tant que tu ne publies pas."}
            </p>
            {published && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Lien copié"))}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-surface text-sm font-semibold hover:bg-[#eceeec]"
                >
                  <Copy className="size-4" /> Copier le lien
                </button>
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex size-11 items-center justify-center rounded-xl bg-surface hover:bg-[#eceeec]" aria-label="Voir la page">
                  <ExternalLink className="size-4" />
                </a>
              </div>
            )}
            <button
              type="button"
              onClick={togglePublish}
              className={cn(
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold",
                published ? "bg-surface hover:bg-[#eceeec]" : "bg-foreground text-background",
              )}
            >
              {published ? <EyeOff className="size-5" /> : <Rocket className="size-5" />}
              {published ? "Repasser en brouillon" : "Publier le produit"}
            </button>
          </Card>

          <Card title="Prix affiché">
            {priceNum > 0 ? (
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{fcfa(priceNum)}</span>
                {compareNum > priceNum && <span className="text-muted-foreground line-through">{fcfa(compareNum)}</span>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Indique un prix pour pouvoir publier.</p>
            )}
          </Card>
        </div>
      </div>

      {/* Barre d'enregistrement : visible seulement quand il y a des changements */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-[104px] z-30 flex justify-center px-4 transition lg:bottom-6 lg:pl-[272px]",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="flex w-full max-w-lg items-center gap-3 rounded-2xl bg-foreground p-2 pl-5 text-background shadow-2xl">
          <span className="flex-1 text-sm font-medium">Modifications non enregistrées</span>
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-foreground disabled:opacity-60">
            {saving && <Loader2 className="size-4 animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "h-12 w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-foreground/10";

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-3xl border border-border p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="block text-[0.95rem] font-semibold">{label}</span>
      {children}
      {help && <span className="block text-sm text-muted-foreground">{help}</span>}
    </div>
  );
}

/** Statut de l'aperçu gratuit d'un fichier (généré côté serveur). */
function PreviewStatus({ file: f, setting }: { file: FileItem; setting?: number }) {
  if (!f.previewStatus || f.previewStatus === "none") {
    if (f.previewStatus === "none" && f.pages && setting !== 0) return <div className="text-xs text-muted-foreground">Trop court pour un aperçu</div>;
    return null;
  }
  if (f.previewStatus === "pending") return <div className="text-xs font-medium text-muted-foreground">Aperçu en préparation…</div>;
  if (f.previewStatus === "failed") return <div className="text-xs font-medium text-[#b54708]">Pas d&apos;aperçu : PDF protégé ou illisible</div>;
  const n = Math.min(setting ?? 3, Math.floor((f.pages ?? 0) / 2));
  return <div className="text-xs font-semibold text-[var(--success-fg)]">Aperçu prêt · {n} page{n > 1 ? "s" : ""} visibles</div>;
}
