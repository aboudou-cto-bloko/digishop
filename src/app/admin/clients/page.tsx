"use client";

import { useDeferredValue, useState } from "react";
import { Mail, Users } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { DetailSheet } from "@/components/admin/detail-sheet";
import { Avatar, EmptyState, FilterPills, KV, Money, Panel, SearchInput, StatusBadge } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, waLink } from "@/lib/format";
import { useStoreQuery } from "@/hooks/use-current-store";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";

type Period = "all" | "7" | "30" | "90";
const PERIODS: { value: Period; label: string; dot: string }[] = [
  { value: "all", label: "Tous", dot: "#141414" },
  { value: "7", label: "7 jours", dot: "#f8cb3c" },
  { value: "30", label: "30 jours", dot: "#22c55e" },
  { value: "90", label: "90 jours", dot: "#6366f1" },
];

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [selected, setSelected] = useState<Id<"customers"> | null>(null);
  const q = useDeferredValue(search);
  // Figé au montage (arrondi à l'heure) : la query reste stable entre deux rendus
  const [hour] = useState(() => Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const rows = useStoreQuery(api.customers.list, {
    search: q || undefined,
    from: period === "all" ? undefined : hour - Number(period) * 86_400_000,
  });

  const exportCsv = () => {
    if (!rows?.length) return;
    const lines = [["Nom", "Email", "Téléphone", "Achats", "Total dépensé (F CFA)", "Ajouté le"]];
    for (const c of rows) lines.push([c.name, c.email, c.phone ?? "", String(c.salesCount), String(c.totalSpent), fmtDate(c._creationTime)]);
    const csv = lines.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <h1 className="mb-4 text-[1.75rem] font-bold lg:hidden">Clients</h1>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher un nom, un email, un numéro" />
        </div>
        <FilterPills options={PERIODS} value={period} onChange={setPeriod} />
        <button type="button" onClick={exportCsv} className="hidden h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-surface lg:inline-flex">
          Exporter (CSV)
        </button>
      </div>

      {rows === undefined && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      )}
      {rows?.length === 0 && (
        <EmptyState icon={<Users />} title="Aucun client" text="Chaque personne qui lance un paiement apparaît ici, avec ses coordonnées et son historique." />
      )}
      {rows && rows.length > 0 && (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            {rows.length} client{rows.length > 1 ? "s" : ""}
          </p>
          <table className="mt-2 w-full text-left">
            <thead className="hidden lg:table-header-group">
              <tr className="border-b border-border text-[0.95rem] text-foreground/70">
                <th className="py-3 pl-4 font-semibold">Nom du client</th>
                <th className="py-3 font-semibold">Achats</th>
                <th className="py-3 font-semibold">Total dépensé</th>
                <th className="py-3 font-semibold">Date d&apos;ajout</th>
                <th className="py-3 pr-4 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c._id} onClick={() => setSelected(c._id)} className="cursor-pointer border-b border-border hover:bg-surface/70">
                  <td className="py-2.5 lg:pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{c.name}</div>
                        <div className="truncate text-sm text-muted-foreground">{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden py-2.5 font-medium lg:table-cell">{c.salesCount}</td>
                  <td className="hidden py-2.5 font-medium lg:table-cell">
                    <Money value={c.totalSpent} />
                  </td>
                  <td className="hidden py-2.5 font-medium lg:table-cell">{fmtDate(c._creationTime)}</td>
                  <td className="py-2.5 text-right lg:pr-4">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      {c.phone && (
                        <a href={waLink(c.phone)} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="flex size-11 items-center justify-center rounded-full hover:bg-card">
                          <WhatsAppIcon className="size-5" />
                        </a>
                      )}
                      <a href={`mailto:${c.email}`} aria-label="Email" className="flex size-11 items-center justify-center rounded-full hover:bg-card">
                        <Mail className="size-5 stroke-[1.6]" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <DetailSheet open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)} title="Client">
        {selected && <CustomerDetail id={selected} />}
      </DetailSheet>
    </div>
  );
}

function CustomerDetail({ id }: { id: Id<"customers"> }) {
  const c = useStoreQuery(api.customers.detail, { id });
  if (!c) return <Skeleton className="h-40 w-full rounded-3xl" />;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 pr-14">
        <Avatar name={c.name} className="size-14 text-lg" />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold">{c.name}</h2>
          <p className="text-sm text-muted-foreground">Client depuis le {fmtDate(c._creationTime)}</p>
        </div>
      </div>
      <Panel>
        <KV label="Email">{c.email}</KV>
        {c.phone && <KV label="Téléphone">{c.phone}</KV>}
        <KV label="Achats réglés">{c.salesCount}</KV>
        <KV label="Total dépensé">
          <Money value={c.totalSpent} />
        </KV>
      </Panel>
      <div>
        <h3 className="mb-3 font-semibold">Historique</h3>
        <div className="space-y-2">
          {c.sales.map((s) => (
            <a key={s._id} href={`/admin/ventes?vente=${s._id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.productTitle}</div>
                <div className="text-sm text-muted-foreground">
                  <Money value={s.net} /> · {fmtDate(s.at)}
                </div>
              </div>
              <StatusBadge status={s.status} className="px-2 py-1 text-xs [&_svg]:size-3.5" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
