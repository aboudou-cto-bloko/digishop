"use client";

import { useQuery } from "convex/react";
import { useDeferredValue, useMemo, useState } from "react";
import { Check, ChevronDown, CreditCard, Minus, Search } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { countryName, currencyName, flagUrl } from "@/lib/geo";
import { cn } from "@/lib/utils";

/**
 * Sélection des pays de vente. La liste vient du catalogue Moneroo (pays avec un moyen de paiement local),
 * regroupée par devise d'encaissement : rien n'est codé en dur.
 *  - value = [] → « Partout » (paiement par carte), ou « comme la boutique » pour un produit (inheritLabel)
 *  - restrictTo : limite les choix (ex. un produit ne peut viser que les pays de la boutique)
 */
export function CountryPicker({
  value,
  onChange,
  restrictTo,
  inheritLabel,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  restrictTo?: string[];
  inheritLabel?: string;
}) {
  const data = useQuery(api.catalog.marketCountries);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const selected = useMemo(() => new Set(value), [value]);
  const everywhere = value.length === 0;

  const groups = useMemo(() => {
    const rows = (data?.countries ?? [])
      .filter((c) => !restrictTo?.length || restrictTo.includes(c.code))
      .map((c) => ({ ...c, name: countryName(c.code) }))
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    const map = new Map<string, typeof rows>();
    for (const r of rows) map.set(r.currency, [...(map.get(r.currency) ?? []), r]);
    // Zones monétaires (plusieurs pays) d'abord, XOF en tête ; les devises d'un seul pays sont réunies dans « Autres pays »
    const zones = [...map.entries()]
      .filter(([, c]) => c.length > 1)
      .map(([currency, countries]) => ({ key: currency, label: currencyName(currency), currency: currency as string | null, countries }))
      .sort((a, b) => (a.currency === "XOF" ? -1 : b.currency === "XOF" ? 1 : b.countries.length - a.countries.length));
    const others = [...map.values()].filter((c) => c.length === 1).flat().sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return others.length ? [...zones, { key: "_autres", label: "Autres pays", currency: null, countries: others }] : zones;
  }, [data, restrictTo]);

  if (!data) return <Skeleton className="h-48 rounded-2xl" />;
  if (groups.length === 0) {
    return <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">Catalogue Moneroo pas encore synchronisé : clique sur « Actualiser » dans Paramètres → Marchés.</p>;
  }

  const toggle = (code: string) => onChange(selected.has(code) ? value.filter((c) => c !== code) : [...value, code]);
  const setGroup = (codes: string[], on: boolean) => onChange(on ? [...new Set([...value, ...codes])] : value.filter((c) => !codes.includes(c)));

  return (
    <div className="space-y-3">
      {/* Mode : partout / pays choisis */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={everywhere}
          className={cn("flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold", everywhere ? "bg-card shadow-sm" : "text-muted-foreground")}
        >
          {inheritLabel ?? (
            <>
              <CreditCard className="size-4" /> Partout
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => !value.length && onChange(groups[0].countries.map((c) => c.code))}
          aria-pressed={!everywhere}
          className={cn("h-11 rounded-lg text-sm font-semibold", !everywhere ? "bg-card shadow-sm" : "text-muted-foreground")}
        >
          Pays choisis{!everywhere ? ` (${value.length})` : ""}
        </button>
      </div>
      {everywhere && !inheritLabel && (
        <p className="text-sm text-muted-foreground">
          {data.globalCard ? "Tous les pays : paiement par carte partout, Mobile Money là où Moneroo le propose." : "Tous les pays où Moneroo propose un moyen de paiement."}
        </p>
      )}

      {!everywhere && (
        <>
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border px-3">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un pays" className="h-full flex-1 bg-transparent text-base outline-none" />
          </label>

          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {groups.map(({ key, label, currency, countries }) => {
              const shown = query ? countries.filter((c) => c.name.toLowerCase().includes(query)) : countries;
              if (shown.length === 0) return null;
              const codes = countries.map((c) => c.code);
              const n = codes.filter((c) => selected.has(c)).length;
              const all = n === codes.length;
              const expanded = Boolean(query) || (open[key] ?? (currency === "XOF" || n > 0));
              return (
                <div key={key}>
                  <div className="flex items-center gap-3 bg-surface/60 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setGroup(codes, !all)}
                      aria-label={all ? `Retirer tous les pays ${currency ?? label}` : `Ajouter tous les pays ${currency ?? label}`}
                      className={cn("flex size-6 shrink-0 items-center justify-center rounded-md border-2", n ? "border-foreground bg-foreground text-background" : "border-[#c9ccc9] bg-card")}
                    >
                      {all ? <Check className="size-4 stroke-[3]" /> : n ? <Minus className="size-4 stroke-[3]" /> : null}
                    </button>
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [key]: !expanded }))} className="flex min-h-11 flex-1 items-center justify-between gap-2 text-left">
                      <span>
                        <span className="font-semibold first-letter:uppercase">{label}</span>
                        <span className="text-sm text-muted-foreground">
                          {" "}
                          · {currency ? `${currency} · ` : ""}
                          {n ? `${n}/${codes.length}` : codes.length} pays
                        </span>
                      </span>
                      <ChevronDown className={cn("size-4 shrink-0 transition", expanded && "rotate-180")} />
                    </button>
                  </div>
                  {expanded && (
                    <ul>
                      {shown.map((c) => (
                        <li key={c.code}>
                          <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface/50">
                            <input type="checkbox" checked={selected.has(c.code)} onChange={() => toggle(c.code)} className="size-5 shrink-0 accent-[#141414]" />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={flagUrl(c.code)} alt="" className="h-4 w-6 shrink-0 rounded-[3px] object-cover" />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {c.name}
                              {!currency && <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{c.currency}</span>}
                            </span>
                            <span className="flex shrink-0 -space-x-1.5" title={c.methods.map((m) => m.name).join(", ")}>
                              {c.methods.slice(0, 4).map((m) =>
                                m.iconUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img key={m.code} src={m.iconUrl} alt="" className="size-6 rounded-full border-2 border-card bg-card" />
                                ) : null,
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {value.length} pays · devises : {[...new Set((data.countries ?? []).filter((c) => selected.has(c.code)).map((c) => c.currency))].join(", ") || "—"}
            </span>
            <button type="button" onClick={() => onChange([])} className="font-semibold underline-offset-4 hover:underline">
              {inheritLabel ? "Revenir aux pays de la boutique" : "Vendre partout"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
