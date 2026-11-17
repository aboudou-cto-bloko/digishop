import { Download, ShieldCheck, Zap } from "lucide-react";
import { Price } from "../price";
import type { LayoutProps } from "../types";
import { Cover, EmptyStore, StoreLink } from "./shared";

/** Layout « Produit vedette » : la page d'accueil vend un seul produit, idéal pour un vendeur mono-produit. */
export function SpotlightLayout({ settings, theme, products, now, preview, base }: LayoutProps) {
  const featured = products.find((p) => p._id === theme.featuredProductId) ?? products[0];
  if (!featured) {
    return (
      <main className="mx-auto max-w-6xl px-4 pt-10">
        <EmptyStore />
      </main>
    );
  }
  const others = products.filter((p) => p._id !== featured._id);
  return (
    <main className="mx-auto max-w-6xl px-4">
      <section className="grid items-center gap-8 py-8 sm:py-14 lg:grid-cols-2 lg:gap-14">
        <div className="relative order-2 lg:order-1">
          {theme.coverUrl && <Cover src={theme.coverUrl} className="absolute -inset-4 -z-10 size-[calc(100%+2rem)] rounded-[36px] object-cover opacity-25 blur-2xl" />}
          <div className="overflow-hidden rounded-[28px] bg-card shadow-[0_30px_80px_-30px_rgba(0,0,0,0.35)]">
            <Cover src={featured.coverUrl} alt={featured.title} priority className="aspect-[4/5] w-full object-cover" />
          </div>
        </div>
        <div className="order-1 lg:order-2">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{settings.storeName}</p>
          <h1 className="mt-3 font-heading text-[2.4rem] leading-[1.04] sm:text-6xl">{theme.coverTitle || featured.title}</h1>
          <p className="mt-4 text-lg text-foreground/75">{theme.coverSubtitle || featured.tagline || settings.tagline}</p>
          <Price product={featured} now={now} size="lg" className="mt-6" />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <StoreLink
              href={`/checkout/${featured.slug}`}
              preview={preview} base={base}
              className="inline-flex h-14 items-center justify-center rounded-2xl bg-brand px-8 text-lg font-bold text-brand-foreground"
            >
              Acheter maintenant
            </StoreLink>
            <StoreLink href={`/p/${featured.slug}`} preview={preview} base={base} className="inline-flex h-14 items-center justify-center rounded-2xl bg-card px-8 font-semibold">
              En savoir plus
            </StoreLink>
          </div>
          <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
            {[
              { icon: <Zap className="size-4" />, t: "Accès immédiat" },
              { icon: <ShieldCheck className="size-4" />, t: "Paiement sécurisé" },
              { icon: <Download className="size-4" />, t: "Téléchargeable à vie" },
            ].map((x) => (
              <li key={x.t} className="flex items-center gap-2 font-medium text-foreground/80">
                <span className="flex size-8 items-center justify-center rounded-lg bg-card">{x.icon}</span>
                {x.t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {others.length > 0 && (
        <section className="mt-6 border-t border-border pt-10">
          <h2 className="mb-5 text-xl font-bold">Autres produits</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {others.map((p) => (
              <StoreLink key={p._id} href={`/p/${p.slug}`} preview={preview} base={base} className="overflow-hidden rounded-2xl bg-card">
                <Cover src={p.coverUrl} alt={p.title} className="aspect-[4/5] w-full object-cover" />
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-semibold">{p.title}</h3>
                  <Price product={p} now={now} size="sm" className="mt-1" />
                </div>
              </StoreLink>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
