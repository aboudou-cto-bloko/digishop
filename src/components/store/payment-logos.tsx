"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { useVisitor } from "./visitor";

/** Logos des moyens de paiement réellement disponibles (catalogue Moneroo), pays du visiteur en premier. */
export function PaymentLogos({ className, max = 8, variant = "chips" }: { className?: string; max?: number; variant?: "chips" | "grid" }) {
  const v = useVisitor();
  const countries = v.country ? [v.country] : v.coverage.length ? v.coverage : undefined;
  // Pays connu : uniquement les moyens réellement encaissables (Moneroo + SasPay, refus et pannes déduits) ; sinon catalogue général
  const routed = useQuery(api.routing.methodsForCountry, v.country ? { country: v.country } : "skip");
  const general = useQuery(api.catalog.paymentMethods, countries && !v.country ? { countries } : v.country ? "skip" : {});
  const methods = v.country ? routed : general;
  if (!methods?.length) return null;
  const seen = new Set<string>();
  const unique = methods.filter((m) => {
    const key = m.iconUrl ?? m.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (variant === "grid") {
    return (
      <ul className={cn("grid grid-cols-4 gap-2", className)} aria-label="Moyens de paiement acceptés">
        {unique.slice(0, max).map((m) => (
          <li key={m.code} title={m.name} className="flex h-12 items-center justify-center rounded-xl border border-border bg-card p-1.5">
            {m.iconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.iconUrl} alt={m.name} className="max-h-full max-w-full object-contain" loading="lazy" />
            ) : (
              <span className="truncate text-[0.7rem] font-semibold">{m.name}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)} aria-label="Moyens de paiement acceptés">
      {unique.slice(0, max).map((m) => (
        <li key={m.code} title={m.name} className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5">
          {m.iconUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.iconUrl} alt="" className="size-5 rounded-full object-contain" loading="lazy" />
          )}
          <span className="text-xs font-semibold text-foreground/80">{m.name}</span>
        </li>
      ))}
    </ul>
  );
}
