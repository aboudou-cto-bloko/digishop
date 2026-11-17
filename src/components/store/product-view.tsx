import { ChevronDown, Download, Eye, FileArchive, FileText, Flame, Headphones, Image as ImageIcon, ShieldCheck, Star, Video, Zap } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { effectivePrice } from "../../../convex/lib/pricing";
import { fileSize, num, waLink } from "@/lib/format";
import { Faq, Guarantee, Testimonials } from "./conversion/blocks";
import { Countdown } from "./conversion/countdown";
import { FilePreviewButton } from "./file-preview";
import { BuyButton } from "./checkout-sheet";
import { PaymentLogos } from "./payment-logos";
import { Money, Price } from "./price";
import { ContactLink, ShareButton } from "./share-button";
import { MobileBuyBar } from "./mobile-buy-bar";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";

export type ProductDetail = NonNullable<FunctionReturnType<typeof api.products.bySlug>>;

function kind(mime: string, name: string) {
  if (mime.startsWith("audio/")) return "Audio";
  if (mime.startsWith("video/")) return "Vidéo";
  if (mime.startsWith("image/")) return "Image";
  if (mime === "application/pdf" || /\.pdf$/i.test(name)) return "PDF";
  if (/zip|rar|7z|compressed/.test(mime) || /\.(zip|rar|7z)$/i.test(name)) return "ZIP";
  return (name.split(".").pop() ?? "Fichier").toUpperCase().slice(0, 5);
}

function FileIcon({ mime, name }: { mime: string; name: string }) {
  const k = kind(mime, name);
  const cls = "size-5 stroke-[1.6]";
  if (k === "Audio") return <Headphones className={cls} />;
  if (k === "Vidéo") return <Video className={cls} />;
  if (k === "Image") return <ImageIcon className={cls} />;
  if (k === "ZIP") return <FileArchive className={cls} />;
  return <FileText className={cls} />;
}

/**
 * Page de vente d'un produit, inspirée de Chariow : bandeau sombre (titre, avis, formats), carte d'achat collante
 * (couverture, stock, prix, compte à rebours, aperçu, moyens de paiement), puis description, fichiers avec aperçu
 * gratuit, avis, garantie et FAQ. Rendu identique en boutique (serveur) et dans l'aperçu admin (client).
 */
export function ProductView({
  product: p,
  descriptionHtml,
  whatsapp,
  now,
  base = "",
  preview,
}: {
  product: ProductDetail;
  descriptionHtml: string;
  whatsapp?: string;
  now: number;
  base?: string;
  preview?: boolean;
}) {
  const { price, compareAt, promo } = effectivePrice(p, now);
  const checkoutHref = `/checkout/${p.slug}`;
  const soldOut = p.stock !== null && p.stock.left === 0;
  const reviews = p.testimonials.length;
  const rating = reviews ? p.testimonials.reduce((a, t) => a + t.rating, 0) / reviews : 0;
  const kinds = [...new Set(p.files.map((f) => kind(f.mime, f.name)))];
  const totalPages = p.files.reduce((a, f) => a + (f.pages ?? 0), 0);
  const previews = p.files.filter((f) => f.previewUrl).length;

  const ctaLabel = p.cta?.trim() || "Acheter maintenant";
  const buyButton = (className: string) =>
    soldOut ? (
      <span className={`${className} cursor-not-allowed bg-muted text-muted-foreground`} aria-disabled>
        Épuisé
      </span>
    ) : (
      <BuyButton href={`${base}${checkoutHref}`} preview={preview} className={`${className} bg-brand text-brand-foreground hover:bg-brand-hover`}>
        {ctaLabel}
      </BuyButton>
    );

  const meta = (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-background/80">
      {reviews > 0 && (
        <li className="flex items-center gap-1.5">
          <Star className="size-4 fill-[#f8cb3c] text-[#f8cb3c]" />
          <span className="font-semibold text-background">{rating.toFixed(1).replace(".", ",")}</span>
          <span>
            · {reviews} avis
          </span>
        </li>
      )}
      {kinds.length > 0 && <li>{kinds.join(" · ")}</li>}
      {totalPages > 0 && <li>{num(totalPages)} page{totalPages > 1 ? "s" : ""}</li>}
      {p.salesCountShown !== null && (
        <li className="flex items-center gap-1.5">
          <Flame className="size-4 text-[#fb923c]" /> {num(p.salesCountShown)} ventes
        </li>
      )}
    </ul>
  );

  const card = (
    <div className="space-y-5 sm:rounded-[28px] sm:border sm:border-border sm:bg-card sm:p-5 sm:shadow-[0_18px_50px_-24px_rgb(0_0_0/0.35)]">
      <div className="overflow-hidden rounded-2xl bg-surface">
        {p.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.coverUrl} alt={p.title} fetchPriority="high" decoding="async" className="mx-auto max-h-[60vh] w-full object-contain" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center text-muted-foreground">
            <FileText className="size-12 stroke-1" />
          </div>
        )}
      </div>

      {p.stock && (
        <div>
          <div className="flex justify-between text-sm">
            <span>
              Vendu <b className="tabular">{num(p.stock.sold)}</b>
            </span>
            <span>
              Restant <b className="tabular">{num(p.stock.left)}</b>
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuemin={0} aria-valuemax={p.stock.limit} aria-valuenow={p.stock.sold} aria-label="Exemplaires vendus">
            <div className="h-full rounded-full bg-[#d92d20]" style={{ width: `${Math.round((p.stock.sold / p.stock.limit) * 100)}%` }} />
          </div>
        </div>
      )}

      <div>
        {compareAt && (
          <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[#fde8e7] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#b42318]">
            <Flame className="size-3.5" /> {promo?.label || "Offre à durée limitée"}
          </p>
        )}
        <Price product={p} now={now} size="lg" highlight className="mt-1" />
      </div>

      {promo?.showCountdown && <Countdown endsAt={promo.endsAt} label={promo.label} />}

      <div className="space-y-2">
        {/* Repère du bouton principal : la barre mobile n'apparaît qu'une fois ce bouton sorti de l'écran */}
        <div id="achat-principal">{buyButton("flex h-14 w-full items-center justify-center rounded-2xl text-lg font-bold")}</div>
        {previews > 0 && (
          <a href="#fichiers" className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-border text-sm font-semibold hover:bg-surface">
            <Eye className="size-4" /> Découvrir un aperçu ({previews})
          </a>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Moyens de paiement disponibles</p>
        <PaymentLogos variant="grid" max={8} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ShareButton title={p.title} productId={p._id} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface text-sm font-semibold hover:bg-surface/70" />
        {whatsapp ? (
          <ContactLink
            href={preview ? undefined : waLink(whatsapp, `Bonjour, j'ai une question sur « ${p.title} ».`)}
            productId={p._id}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-surface text-sm font-semibold hover:bg-surface/70"
          >
            <WhatsAppIcon className="size-4" /> Contact
          </ContactLink>
        ) : (
          <span />
        )}
      </div>

      <details className="group rounded-2xl bg-surface px-4 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between text-sm font-semibold">
          Comment acheter ?
          <ChevronDown className="size-4 transition group-open:rotate-180" />
        </summary>
        <ol className="space-y-2.5 pb-4 text-sm text-muted-foreground">
          {[
            `Clique sur « ${ctaLabel} » et indique ton nom, ton email et ton numéro WhatsApp.`,
            "Paie par Mobile Money ou carte bancaire, sur la page sécurisée.",
            "Télécharge tout de suite ; le lien t'est aussi envoyé par email.",
          ].map((t, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-card text-xs font-bold text-foreground">{i + 1}</span>
              <span className="pt-0.5">{t}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );

  return (
    <>
      {/* Bandeau sombre */}
      <section className="bg-foreground text-background">
        <div className="mx-auto grid max-w-6xl grid-cols-1 px-4 pb-8 pt-8 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10 lg:pb-14 lg:pt-12 [&>*]:min-w-0">
          <div>
            <h1 className="text-[1.75rem] font-bold leading-tight sm:text-4xl">{p.title}</h1>
            {p.tagline && <p className="mt-3 max-w-[60ch] text-[1.05rem] text-background/75">{p.tagline}</p>}
            <div className="mt-4">{meta}</div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-28 lg:pb-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-10 [&>*]:min-w-0">
          {/* Carte d'achat : sous le bandeau sur mobile, collante et chevauchant le bandeau sur ordinateur */}
          <aside className="pt-6 sm:-mt-4 sm:pt-0 lg:col-start-2 lg:row-start-1 lg:-mt-40">
            <div className="lg:sticky lg:top-24">{card}</div>
          </aside>

          <div className="space-y-6 lg:col-start-1 lg:row-start-1 lg:pt-8">
            {descriptionHtml && (
              <section className="border-t border-border pt-6 sm:rounded-[28px] sm:border-0 sm:bg-card sm:p-8">
                <div className="rich" dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
              </section>
            )}

            {p.files.length > 0 && (
              <section id="fichiers" className="scroll-mt-24 border-t border-border pt-6 sm:rounded-[28px] sm:border-0 sm:bg-card sm:p-8">
                <h2 className="text-xl font-bold">Fichiers ({p.files.length})</h2>
                {previews > 0 && (
                  <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[var(--success-bg)] px-4 py-3 text-sm font-medium text-[var(--success-fg)]">
                    <Eye className="size-4 shrink-0" /> Prévisualise gratuitement les premières pages avant l&apos;achat.
                  </p>
                )}
                <ul className="mt-4 space-y-2">
                  {p.files.map((f, i) => (
                    <li key={i} className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card">
                        <FileIcon mime={f.mime} name={f.name} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{f.name.replace(/\.[^.]+$/, "")}</span>
                        <span className="block text-sm text-muted-foreground">
                          {kind(f.mime, f.name)} · {fileSize(f.size)}
                          {f.pages ? ` · ${num(f.pages)} page${f.pages > 1 ? "s" : ""}` : ""}
                        </span>
                      </span>
                      <FilePreviewButton file={f} productId={p._id} ctaLabel={ctaLabel} checkoutHref={checkoutHref} base={base} preview={preview} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <ul className="grid gap-4 border-t border-border pt-6 sm:grid-cols-3 sm:gap-3 sm:border-0 sm:pt-0">
              {[
                { icon: <Zap />, title: "Accès immédiat", text: "Téléchargement juste après le paiement." },
                { icon: <ShieldCheck />, title: "Paiement sécurisé", text: "Mobile Money ou carte, sur une page de paiement sécurisée." },
                { icon: <Download />, title: "À vie", text: "Re-télécharge quand tu veux." },
              ].map((i) => (
                <li key={i.title} className="flex gap-3 sm:rounded-2xl sm:bg-card sm:p-4">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface [&_svg]:size-[18px] [&_svg]:stroke-[1.7]">{i.icon}</span>
                  <span>
                    <span className="block font-semibold">{i.title}</span>
                    <span className="block text-sm text-muted-foreground">{i.text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <Testimonials items={p.testimonials} />
            {p.guarantee && <Guarantee text={p.guarantee} />}
            <Faq items={p.faq} />
          </div>
        </div>

        {/* CTA mobile à portée de pouce : seulement quand le bouton principal n'est plus visible */}
        <MobileBuyBar anchorId="achat-principal">
          <div className="min-w-0 flex-1">
            <Money xof={price} className={`block text-lg font-bold leading-tight ${compareAt ? "text-[#d92d20]" : ""}`} />
            {compareAt && <Money xof={compareAt} className="block text-sm text-muted-foreground line-through" />}
          </div>
          {buyButton("flex h-14 flex-[1.4] items-center justify-center rounded-2xl px-3 text-center text-base font-bold leading-tight")}
        </MobileBuyBar>
      </main>
    </>
  );
}
