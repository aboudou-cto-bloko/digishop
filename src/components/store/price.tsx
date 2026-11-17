"use client";

import { effectivePrice, type Promo } from "../../../convex/lib/pricing";
import { formatMoney } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useVisitor } from "./visitor";

type Priced = { price: number; compareAtPrice?: number; promo?: Promo | null };

/** Prix dans la devise du visiteur (si activée par le vendeur), avec rappel en F CFA. */
export function Price({ product, now, size = "md", className, highlight }: { product: Priced; now: number; size?: "sm" | "md" | "lg"; className?: string; highlight?: boolean }) {
  const v = useVisitor();
  const { price, compareAt } = effectivePrice(product, now);
  const main = v.convert(price);
  const pct = compareAt ? Math.round((1 - price / compareAt) * 100) : 0;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("font-bold tracking-tight", highlight && compareAt && "text-[#d92d20]", size === "lg" ? "text-3xl" : size === "md" ? "text-lg" : "text-[0.95rem]")}>
        {formatMoney(main.amount, main.currency)}
      </span>
      {compareAt && <span className={cn("text-muted-foreground line-through", size === "lg" ? "text-lg" : "text-sm")}>{v.format(compareAt)}</span>}
      {compareAt && size !== "sm" && (
        <span className="rounded-full bg-[var(--success-bg)] px-2 py-0.5 text-xs font-bold text-[var(--success-fg)]">-{pct} %</span>
      )}
      {main.converted && size === "lg" && <span className="basis-full text-sm text-muted-foreground">soit {formatMoney(price, "XOF")}</span>}
    </span>
  );
}

/** Montant simple converti (barre d'achat mobile, récapitulatifs). */
export function Money({ xof, className }: { xof: number; className?: string }) {
  const v = useVisitor();
  return <span className={className}>{v.format(xof)}</span>;
}
