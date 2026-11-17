import { Price } from "../price";
import type { LayoutProps } from "../types";
import { Cover, EmptyStore, StoreLink } from "./shared";

/** Layout « Grille » : le catalogue façon Chariow. */
export function GridLayout({ settings, theme, products, now, preview, base }: LayoutProps) {
  return (
    <main className="mx-auto max-w-6xl px-4">
      {theme.coverUrl ? (
        <section className="relative mt-4 overflow-hidden rounded-[28px] bg-foreground">
          <Cover src={theme.coverUrl} priority className="h-56 w-full object-cover opacity-80 sm:h-80" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
            <h1 className="font-heading text-[2.2rem] leading-[1.05] sm:text-6xl">{theme.coverTitle || settings.storeName}</h1>
            {(theme.coverSubtitle || settings.tagline) && <p className="mt-2 max-w-xl text-base text-white/85 sm:text-lg">{theme.coverSubtitle || settings.tagline}</p>}
          </div>
        </section>
      ) : (
        <section className="py-10 sm:py-16">
          <h1 className="font-heading text-[2.6rem] leading-[1.05] sm:text-6xl">{theme.coverTitle || settings.storeName}</h1>
          {(theme.coverSubtitle || settings.tagline) && <p className="mt-3 max-w-xl text-lg text-foreground/75">{theme.coverSubtitle || settings.tagline}</p>}
        </section>
      )}

      <div className={theme.coverUrl ? "mt-8" : ""}>
        {products.length === 0 ? (
          <EmptyStore />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {products.map((p, i) => (
              <StoreLink key={p._id} href={`/p/${p.slug}`} preview={preview} base={base} className="group overflow-hidden rounded-3xl bg-card">
                <div className="aspect-[4/5] overflow-hidden bg-surface">
                  <Cover src={p.coverUrl} alt={p.title} priority={!theme.coverUrl && i < 2} className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                </div>
                <div className="p-3.5 sm:p-5">
                  <h2 className="line-clamp-2 text-[0.95rem] font-semibold leading-snug sm:text-lg">{p.title}</h2>
                  <Price product={p} now={now} size="sm" className="mt-2 sm:[&>span:first-child]:text-lg" />
                </div>
              </StoreLink>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
