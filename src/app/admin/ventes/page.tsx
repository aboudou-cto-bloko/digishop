"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";
import { CircleDollarSign, Copy, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DetailSheet } from "@/components/admin/detail-sheet";
import { SaleDetail } from "@/components/admin/sale-detail";
import { Avatar, EmptyState, FilterPills, Money, SearchInput, StatusBadge, Thumb, type SaleStatus } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { countryName, formatMoney } from "@/lib/geo";
import { useStoreQuery } from "@/hooks/use-current-store";

type Filter = "all" | SaleStatus;
const FILTERS: { value: Filter; label: string; dot: string }[] = [
  { value: "all", label: "Tout", dot: "#141414" },
  { value: "pending", label: "En attente", dot: "#eab308" },
  { value: "paid", label: "Réglé", dot: "#22c55e" },
  { value: "failed", label: "Échoué", dot: "#6366f1" },
  { value: "abandoned", label: "Abandonné", dot: "#a3a3a3" },
];

export default function SalesPage() {
  return (
    <Suspense>
      <Sales />
    </Suspense>
  );
}

function Sales() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("statut") as Filter) ?? "all");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDeferredValue(search);
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("");
  const options = useStoreQuery(api.sales.filterOptions, {});
  const rows = useStoreQuery(api.sales.list, {
    status: filter === "all" ? undefined : filter,
    search: q || undefined,
    country: country || undefined,
    currency: currency || undefined,
  });
  const selected = params.get("vente") as Id<"sales"> | null;

  const open = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("vente", id);
    else next.delete("vente");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const copyNumber = async (n: string) => {
    try {
      await navigator.clipboard.writeText(n);
      toast.success("Numéro de vente copié");
    } catch {}
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <h1 className="text-[1.75rem] font-bold lg:hidden">Ventes</h1>
        <div className="hidden flex-1 lg:block">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un client, un produit, un n° de vente" />
        </div>
        <Link
          href="/admin/revenus"
          className="ml-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-foreground px-5 font-semibold text-background lg:h-12"
        >
          <CircleDollarSign className="size-5" /> Mes revenus
        </Link>
      </div>
      <div className="mt-4 lg:hidden">
        <SearchInput value={search} onChange={setSearch} />
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex">
          <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Filtrer par pays" className="h-11 rounded-xl border border-border bg-card px-3 text-base font-medium sm:text-sm">
            <option value="">Tous les pays</option>
            {options?.countries.map((c) => (
              <option key={c.value} value={c.value}>
                {countryName(c.value)} ({c.count})
              </option>
            ))}
          </select>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Filtrer par devise" className="h-11 rounded-xl border border-border bg-card px-3 text-base font-medium sm:text-sm">
            <option value="">Toutes les devises</option>
            {options?.currencies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.count})
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows === undefined && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="size-14 rounded-lg" />
              <Skeleton className="h-6 flex-1" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {rows?.length === 0 && (
        <EmptyState
          icon={<ShoppingBag />}
          title={q ? "Aucune vente trouvée" : "Pas encore de vente ici"}
          text={q ? "Essaie avec un autre nom, email ou numéro." : "Les ventes apparaissent ici en temps réel, dès qu'un client lance un paiement."}
        />
      )}

      {/* Mobile : liste façon app Chariow */}
      {rows && rows.length > 0 && (
        <ul className="mt-4 divide-y divide-border lg:hidden">
          {rows.map((s) => (
            <li key={s._id}>
              <button type="button" onClick={() => open(s._id)} className="flex w-full items-center gap-3 py-3 text-left">
                <Thumb src={s.coverUrl} alt="" className="h-[70px] w-14" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.95rem] font-bold">{s.productTitle}</div>
                  <div className="truncate text-sm font-medium text-muted-foreground">
                    {s.charged ? formatMoney(s.charged.amount, s.charged.currency) : <Money value={s.net} />} · {s.customerName}
                  </div>
                </div>
                <StatusBadge status={s.status} className="shrink-0 px-2.5 py-1.5 text-[0.82rem]" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Desktop : tableau */}
      {rows && rows.length > 0 && (
        <div className="mt-5 hidden lg:block">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-[0.95rem] text-foreground/70">
                <th className="py-3 pl-4 font-semibold">Produit</th>
                <th className="py-3 font-semibold">Client</th>
                <th className="py-3 font-semibold">Prix</th>
                <th className="py-3 font-semibold">Statut</th>
                <th className="py-3 pr-4 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s._id} onClick={() => open(s._id)} className="cursor-pointer border-b border-border hover:bg-surface/70">
                  <td className="py-2 pl-4">
                    <div className="flex items-center gap-3">
                      <Thumb src={s.coverUrl} alt="" className="size-[52px] rounded-md" />
                      <span className="max-w-[260px] truncate font-semibold">{s.productTitle}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyNumber(s.number);
                        }}
                        className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-card"
                        aria-label="Copier le numéro de vente"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.customerName} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{s.customerName}</div>
                        <div className="truncate text-sm text-muted-foreground">{s.customerEmail}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 font-medium">
                    {s.charged ? (
                      <span>
                        {formatMoney(s.charged.amount, s.charged.currency)}
                        <span className="block text-xs text-muted-foreground">
                          <Money value={s.net} />
                        </span>
                      </span>
                    ) : (
                      <Money value={s.net} />
                    )}
                  </td>
                  <td className="py-2">
                    <StatusBadge status={s.status} className="py-1 text-[0.85rem]" />
                  </td>
                  <td className="py-2 pr-4 font-medium">{fmtDate(s._creationTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailSheet open={Boolean(selected)} onOpenChange={(o) => !o && open(null)} title="Détail de la vente">
        {selected && <SaleDetail id={selected} />}
      </DetailSheet>
    </div>
  );
}
