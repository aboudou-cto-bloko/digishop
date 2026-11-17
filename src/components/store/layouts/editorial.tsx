import { ArrowRight } from "lucide-react";
import { Price } from "../price";
import type { LayoutProps } from "../types";
import { Cover, EmptyStore, StoreLink } from "./shared";

/** Layout « Éditorial » : grande couverture plein écran puis liste aérée, comme un magazine. */
export function EditorialLayout({ settings, theme, products, now, preview, base }: LayoutProps) {
  return (
    <main>
      <div className="mx-auto max-w-6xl px-3 pt-2 sm:px-4 sm:pt-4">
      <section className="relative isolate overflow-hidden rounded-[28px] bg-foreground sm:rounded-[36px]">
        <Cover src={theme.coverUrl} priority className="absolute inset-0 -z-10 size-full object-cover opacity-60" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/40 to-black/80" />
        <div className="flex min-h-[58vh] flex-col justify-end px-6 pb-10 pt-24 text-white sm:min-h-[64vh] sm:px-12 sm:pb-14">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">{settings.storeName}</p>
          <h1 className="max-w-3xl font-heading text-[2.6rem] leading-[1.02] sm:text-7xl">{theme.coverTitle || settings.tagline || settings.storeName}</h1>
          {theme.coverSubtitle && <p className="mt-4 max-w-xl text-lg text-white/85">{theme.coverSubtitle}</p>}
          {products.length > 0 && (
            <a href="#catalogue" className="mt-8 inline-flex h-14 w-fit items-center gap-2 rounded-full bg-brand px-7 text-base font-bold text-brand-foreground">
              Découvrir <ArrowRight className="size-5" />
            </a>
          )}
        </div>
      </section>
      </div>

      <section id="catalogue" className="mx-auto max-w-4xl scroll-mt-20 px-4 pt-10 sm:pt-16">
        {products.length === 0 ? (
          <EmptyStore />
        ) : (
          <div className="space-y-4 sm:space-y-6">
            {products.map((p, i) => (
              <StoreLink
                key={p._id}
                href={`/p/${p.slug}`}
                preview={preview} base={base}
                className="group flex items-center gap-4 rounded-[28px] bg-card p-3 sm:gap-8 sm:p-5"
              >
                <div className="w-28 shrink-0 overflow-hidden rounded-2xl bg-surface sm:w-48">
                  <Cover src={p.coverUrl} alt={p.title} className="aspect-[4/5] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                </div>
                <div className="min-w-0 flex-1 py-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">N° {String(i + 1).padStart(2, "0")}</span>
                  <h2 className="mt-1 line-clamp-2 font-heading text-xl leading-tight sm:text-3xl">{p.title}</h2>
                  {p.tagline && <p className="mt-2 line-clamp-2 hidden text-foreground/70 sm:block">{p.tagline}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <Price product={p} now={now} size="sm" />
                    <span className="hidden h-11 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-bold text-brand-foreground sm:inline-flex">
                      Voir <ArrowRight className="size-4" />
                    </span>
                  </div>
                </div>
              </StoreLink>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
