"use client";

import { Check, X } from "lucide-react";
import { htmlToText } from "@/lib/rich-html";
import { cn } from "@/lib/utils";

/** Aperçu d'un résultat Google + check-list SEO chiffrée (pas de boîte noire : chaque point dit quoi faire). */
export function SeoPanel({
  title,
  description,
  fallbackTitle,
  fallbackDescription,
  slug,
  storeName,
  onTitle,
  onDescription,
  checks,
  price,
  rating,
}: {
  title: string;
  description: string;
  fallbackTitle: string;
  fallbackDescription: string;
  slug: string;
  storeName: string;
  onTitle: (v: string) => void;
  onDescription: (v: string) => void;
  checks: { ok: boolean; label: string }[];
  price?: string;
  rating?: { value: number; count: number };
}) {
  const t = title.trim() || fallbackTitle;
  const d = description.trim() || htmlToText(fallbackDescription).slice(0, 160);
  const shownTitle = `${t} · ${storeName}`;
  const host = typeof window !== "undefined" ? window.location.host : "ma-boutique.com";
  const score = Math.round((checks.filter((c) => c.ok).length / Math.max(1, checks.length)) * 100);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-4" aria-label="Aperçu Google">
        <div className="flex items-center gap-2 text-xs text-[#4d5156]">
          <span className="flex size-7 items-center justify-center rounded-full bg-surface text-[0.7rem] font-bold">{storeName.slice(0, 1)}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm text-[#202124]">{storeName}</span>
            <span className="block truncate">
              https://{host} › p › {slug}
            </span>
          </span>
        </div>
        <p className={cn("mt-2 line-clamp-1 text-lg leading-snug text-[#1a0dab]", shownTitle.length > 60 && "after:content-['']")}>{shownTitle.length > 62 ? `${shownTitle.slice(0, 60)}…` : shownTitle}</p>
        {rating && rating.count > 0 && (
          <p className="mt-0.5 text-sm text-[#70757a]">
            <span className="text-[#e7711b]">{"★".repeat(Math.round(rating.value))}</span> Note : {rating.value.toFixed(1).replace(".", ",")} · {rating.count} avis{price ? ` · ${price}` : ""}
          </p>
        )}
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#4d5156]">{d || "Ajoute une description pour donner envie de cliquer."}</p>
      </div>

      <label className="block space-y-2">
        <span className="flex justify-between text-sm font-semibold">
          Titre pour Google <Count n={t.length} max={60} />
        </span>
        <input value={title} onChange={(e) => onTitle(e.target.value)} placeholder={fallbackTitle} maxLength={70} className="h-12 w-full rounded-xl border border-border px-4 text-base" />
      </label>
      <label className="block space-y-2">
        <span className="flex justify-between text-sm font-semibold">
          Description pour Google <Count n={d.length} max={155} min={70} />
        </span>
        <textarea value={description} onChange={(e) => onDescription(e.target.value)} placeholder={htmlToText(fallbackDescription).slice(0, 155)} maxLength={170} rows={3} className="w-full rounded-xl border border-border px-4 py-3 text-base" />
      </label>

      <div className="rounded-2xl bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">Score SEO</span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-bold", score >= 80 ? "bg-[var(--success-bg)] text-[var(--success-fg)]" : score >= 50 ? "bg-[#fef3c7] text-[#92400e]" : "bg-[#fde2e2] text-[#991b1b]")}>{score} / 100</span>
        </div>
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-start gap-2 text-sm">
              {c.ok ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--success-fg)]" /> : <X className="mt-0.5 size-4 shrink-0 text-[#b91c1c]" />}
              <span className={c.ok ? "text-foreground/70" : "font-medium"}>{c.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Count({ n, max, min }: { n: number; max: number; min?: number }) {
  const bad = n > max || (min !== undefined && n < min);
  return <span className={cn("font-normal tabular", bad ? "text-[#b91c1c]" : "text-muted-foreground")}>{n} / {max}</span>;
}
