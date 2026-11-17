"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Check, Globe, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { allCountries, countryName, currencyName, currencyOfCountry, flagUrl } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useVisitor } from "./visitor";

/** Badge drapeau + devise dans l'en-tête : le visiteur voit son pays et peut le changer. */
export function CountryBadge({ labeled = false }: { labeled?: boolean }) {
  const v = useVisitor();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const list = useMemo(() => {
    const base = v.coverage.length ? v.coverage.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name, "fr")) : allCountries();
    return query ? base.filter((c) => c.name.toLowerCase().includes(query) || c.code.toLowerCase() === query) : base;
  }, [v.coverage, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={v.country ? `Pays : ${countryName(v.country)}, devise ${v.currency}. Changer` : "Choisir mon pays"}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-card px-3 text-sm font-semibold"
      >
        {v.country ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flagUrl(v.country)} alt="" className="h-4 w-6 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" />
        ) : (
          <Globe className="size-4" />
        )}
        {labeled && v.country ? <span>{countryName(v.country)}</span> : null}
        {labeled && v.country ? <span className="text-muted-foreground">· Changer</span> : <span>{v.currency}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="border-b border-border p-3">
          <p className="mb-2 text-sm text-muted-foreground">
            Prix affichés en <strong className="text-foreground">{currencyName(v.currency)}</strong>
          </p>
          <label className="flex h-11 items-center gap-2 rounded-xl bg-surface px-3">
            <Search className="size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un pays" className="h-full flex-1 bg-transparent text-base outline-none" />
          </label>
        </div>
        <ul className="max-h-72 overflow-y-auto p-1.5">
          {list.map((c) => {
            const cur = currencyOfCountry(c.code);
            const local = cur && v.acceptedCurrencies.includes(cur) ? cur : "XOF";
            return (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => {
                    v.setCountry(c.code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-[0.95rem] hover:bg-surface",
                    v.country === c.code && "bg-surface font-semibold",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(c.code)} alt="" loading="lazy" className="h-4 w-6 shrink-0 rounded-[3px] object-cover" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{local}</span>
                  {v.country === c.code && <Check className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
