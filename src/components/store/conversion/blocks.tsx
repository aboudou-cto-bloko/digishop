import { ChevronDown, ShieldCheck, Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Testimonial = { id: string; name: string; city?: string; rating: number; text: string; photoUrl: string | null };

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-4", i <= Math.round(value) ? "fill-[#f5a524] text-[#f5a524]" : "fill-[#e3e5e3] text-[#e3e5e3]")} />
      ))}
    </span>
  );
}

export function Testimonials({ items }: { items: Testimonial[] }) {
  if (items.length === 0) return null;
  const avg = items.reduce((a, t) => a + t.rating, 0) / items.length;
  return (
    <section className="border-t border-border pt-6 sm:rounded-[28px] sm:border-0 sm:bg-card sm:p-8" aria-labelledby="avis">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="avis" className="text-xl font-bold">
          Ce qu&apos;en disent les clients
        </h2>
        <div className="flex items-center gap-2">
          <Stars value={avg} />
          <span className="text-sm font-semibold">
            {avg.toFixed(1).replace(".", ",")} · {items.length} avis
          </span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {items.map((t) => (
          <figure key={t.id} className="rounded-2xl bg-surface p-4">
            <Stars value={t.rating} />
            <blockquote className="mt-2 text-[0.95rem] leading-relaxed text-foreground/85">« {t.text} »</blockquote>
            <figcaption className="mt-3 flex items-center gap-2.5">
              {t.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.photoUrl} alt="" className="size-9 rounded-full object-cover" />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-full bg-card text-sm font-bold">{t.name.slice(0, 1).toUpperCase()}</span>
              )}
              <span className="text-sm">
                <span className="block font-semibold">{t.name}</span>
                {t.city && <span className="block text-muted-foreground">{t.city}</span>}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function Faq({ items }: { items: { id: string; question: string; answer: string }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="border-t border-border pt-6 sm:rounded-[28px] sm:border-0 sm:bg-card sm:p-8" aria-labelledby="faq">
      <h2 id="faq" className="text-xl font-bold">
        Questions fréquentes
      </h2>
      <div className="mt-4 divide-y divide-border">
        {items.map((f) => (
          <details key={f.id} className="group py-1">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
              {f.question}
              <ChevronDown className="size-5 shrink-0 transition group-open:rotate-180" />
            </summary>
            <p className="whitespace-pre-line pb-4 text-[0.98rem] leading-relaxed text-foreground/80">{f.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function Guarantee({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-[var(--success-fg)]/30 bg-[var(--success-bg)]/60 p-4">
      <ShieldCheck className="mt-0.5 size-6 shrink-0 text-[var(--success-fg)]" />
      <div>
        <div className="font-bold text-[var(--success-fg)]">Garantie</div>
        <p className="text-sm text-foreground/80">{text}</p>
      </div>
    </div>
  );
}
