"use client";

import type { FunctionReturnType } from "convex/server";
import { useDeferredValue, useMemo, useState } from "react";
import { Loader2, Lock, Phone, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import { DetailSheet } from "@/components/admin/detail-sheet";
import { FilterPills, Money, SearchInput, StatusBadge, type SaleStatus } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useHideAmounts } from "@/hooks/use-hide-amounts";
import { errorMessage, fmtDate } from "@/lib/format";
import { countryName, flagUrl, formatMoney } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { useStoreQuery, useStoreAction } from "@/hooks/use-current-store";

type Overview = FunctionReturnType<typeof api.payouts.overview>;
type Filter = "all" | "success" | "pending" | "failed";
const FILTERS: { value: Filter; label: string; dot: string }[] = [
  { value: "all", label: "Tout", dot: "#141414" },
  { value: "success", label: "Payé", dot: "#22c55e" },
  { value: "pending", label: "En attente", dot: "#eab308" },
  { value: "failed", label: "Échoué", dot: "#6366f1" },
];
const toBadge = (s: string): SaleStatus => (s === "success" ? "paid" : s === "failed" ? "failed" : "pending");
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const mask = (msisdn: string) => `+${msisdn.slice(0, 3)} ${"•".repeat(Math.max(0, msisdn.length - 7))}${msisdn.slice(-4)}`;

export default function RevenuePage() {
  const data = useStoreQuery(api.payouts.overview, {});
  const monthly = useStoreQuery(api.analytics.revenue, {});
  const { hidden } = useHideAmounts();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim().toLowerCase());
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [destOpen, setDestOpen] = useState(false);
  const money = (amount: number, currency: string) => (hidden ? "•••••" : formatMoney(amount, currency));

  const rows = useMemo(
    () =>
      (data?.payouts ?? []).filter((p) => {
        if (filter === "success" && p.status !== "success") return false;
        if (filter === "pending" && !["pending", "initiated"].includes(p.status)) return false;
        if (filter === "failed" && p.status !== "failed") return false;
        return !q || p.label.toLowerCase().includes(q) || p.msisdn.includes(q) || String(p.amount).includes(q);
      }),
    [data, filter, q],
  );

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-72 rounded-[28px]" />
      </div>
    );
  }
  const pending = data.balances.reduce((a, b) => a + (b.currency === "XOF" ? b.pending : 0), 0);
  const paidOut = data.balances.reduce((a, b) => a + (b.currency === "XOF" ? b.paidOut : 0), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-5 text-[1.75rem] font-bold">Revenus</h1>

      <div className="rounded-[28px] border border-border p-5 sm:p-7">
        <p className="text-sm font-semibold text-muted-foreground">Revenus totaux</p>
        <div className="mt-3 text-[2.4rem] font-bold leading-none tracking-tight sm:text-5xl">
          <Money value={data.totalNet} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Après {hidden ? "•••" : formatMoney(data.totalFees, "XOF")} de frais Moneroo.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-[#fdf7c3] px-5 py-4">
            <p className="font-semibold text-foreground/70">Retraits en attente</p>
            <p className="mt-0.5 text-lg font-bold">{money(pending, "XOF")}</p>
          </div>
          <div className="rounded-2xl bg-[#e3f9e8] px-5 py-4">
            <p className="font-semibold text-foreground/70">Retraits payés</p>
            <p className="mt-0.5 text-lg font-bold">{money(paidOut, "XOF")}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-surface p-4">
          <p className="text-sm font-semibold">Solde disponible estimé</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.balances.every((b) => b.available <= 0) && <span className="text-sm text-muted-foreground">Rien à retirer pour l&apos;instant.</span>}
            {data.buckets
              .filter((b) => b.available > 0)
              .map((b) => (
                <span key={`${b.currency}|${b.country ?? "-"}`} className="inline-flex h-10 items-center gap-2 rounded-xl bg-card px-3 font-bold">
                  {b.country ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={flagUrl(b.country)} alt={countryName(b.country)} title={countryName(b.country)} className="h-4 w-6 rounded-[3px] object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground">Carte</span>
                  )}
                  {money(b.available, b.currency)}
                </span>
              ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ta passerelle garde l&apos;argent par pays d&apos;encaissement : chaque pays se retire vers un numéro de ce pays. Retraits attribués à cette boutique : seules ses ventes et ses retraits comptent.
            {data.storeCount > 1 ? ` Le solde réel Moneroo est partagé entre tes ${data.storeCount} boutiques.` : ""} Estimation à partir des ventes, frais et retraits (Moneroo ne fournit pas le solde par API).
          </p>
        </div>

        <button type="button" onClick={() => setWithdrawOpen(true)} className="mt-5 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-foreground font-semibold text-background">
          <Wallet className="size-5" /> Effectuer un retrait
        </button>
      </div>

      {/* Retraits */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Retraits</h2>
          <button type="button" onClick={() => setDestOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-brand-foreground">
            <Phone className="size-4" /> Numéros de retrait
          </button>
        </div>
        <SearchInput value={search} onChange={setSearch} />
        <div className="mt-3">
          <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
        </div>
        <div className="mt-3 divide-y divide-border">
          {rows.length === 0 && <p className="py-8 text-center text-muted-foreground">Aucun retrait.</p>}
          {rows.map((p) => (
            <div key={p._id} className="flex items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-bold">{money(p.amount, p.currency ?? "XOF")}</div>
                <div className="truncate text-sm font-medium text-muted-foreground">
                  {fmtDate(p._creationTime)} · {p.label} · {mask(p.msisdn)}
                </div>
                {p.status === "failed" && p.failureReason && <div className="mt-0.5 text-sm text-destructive">{p.failureReason}</div>}
              </div>
              <StatusBadge status={toBadge(p.status)} className="shrink-0" />
            </div>
          ))}
        </div>
      </section>

      {/* Pays */}
      {data.byCountry.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Revenus par pays</h2>
          <div className="divide-y divide-border rounded-3xl border border-border">
            {data.byCountry.map((c) => (
              <div key={c.country} className="flex items-center gap-3 px-5 py-3.5">
                {c.country !== "—" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flagUrl(c.country)} alt="" className="h-5 w-7 rounded-[3px] object-cover" />
                ) : (
                  <span className="h-5 w-7 rounded-[3px] bg-surface" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.country !== "—" ? countryName(c.country) : "Pays inconnu"}</div>
                  <div className="text-sm text-muted-foreground">
                    {c.sales} vente{c.sales > 1 ? "s" : ""}
                  </div>
                </div>
                <Money value={c.revenue} className="font-bold" />
              </div>
            ))}
          </div>
        </section>
      )}

      {monthly && monthly.months.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">Par mois</h2>
          <div className="divide-y divide-border rounded-3xl border border-border">
            {monthly.months.map((m) => (
              <div key={m.month} className="flex items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold capitalize">{monthFmt.format(new Date(`${m.month}-01T00:00:00Z`))}</div>
                  <div className="text-sm text-muted-foreground">
                    {m.sales} vente{m.sales > 1 ? "s" : ""} · frais <Money value={m.fees} />
                  </div>
                </div>
                <Money value={m.gross - m.fees} className="font-bold" />
              </div>
            ))}
          </div>
        </section>
      )}

      <DetailSheet open={withdrawOpen} onOpenChange={setWithdrawOpen} title="Effectuer un retrait">
        <WithdrawForm data={data} onDone={() => setWithdrawOpen(false)} onManage={() => {
          setWithdrawOpen(false);
          setDestOpen(true);
        }} />
      </DetailSheet>
      <DetailSheet open={destOpen} onOpenChange={setDestOpen} title="Numéros de retrait">
        <Destinations data={data} />
      </DetailSheet>
    </div>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Lock className="size-4" /> Ton mot de passe (confirmation)
      </span>
      <input type="password" autoComplete="current-password" value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-xl border border-border px-4 text-base" />
    </label>
  );
}

type Row = { on: boolean; destId: string; amount: string };
// Moneroo ne renvoie pas ses frais d'encaissement : on garde une marge pour que le retrait ne soit pas refusé
const FEE_MARGIN = 0.04;
const suggested = (available: number, currency: string) => {
  const v = available * (1 - FEE_MARGIN);
  return currency === "XOF" ? Math.floor(v / 100) * 100 : Math.floor(v * 100) / 100;
};

/**
 * Retrait pays par pays : la passerelle (PayDunya…) garde un solde séparé pour chaque pays d'encaissement —
 * vérifié en prod : un numéro MTN Bénin ne reçoit que l'argent encaissé au Bénin. Une confirmation = un retrait par pays.
 */
function WithdrawForm({ data, onDone, onManage }: { data: Overview; onDone: () => void; onManage: () => void }) {
  const batch = useStoreAction(api.payouts.requestBatch);
  const buckets = data.buckets.filter((b) => b.available > 0);
  const keyOf = (b: { currency: string; country: string | null }) => `${b.currency}|${b.country ?? "-"}`;
  const destsFor = (b: (typeof buckets)[number]) =>
    data.destinations.filter((d) => {
      const m = data.payoutMethods.find((x) => x.code === d.method);
      return m && m.currency === b.currency && m.country === b.country;
    });
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(
      buckets.map((b) => {
        const dests = destsFor(b);
        const amount = suggested(b.available, b.currency);
        return [keyOf(b), { on: Boolean(b.country) && dests.length > 0 && (b.currency !== "XOF" || amount >= 500), destId: dests[0]?.id ?? "", amount: String(amount) }];
      }),
    ),
  );
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<{ label: string; ok: boolean; error?: string }[] | null>(null);
  const set = (k: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [k]: { ...r[k], ...patch } }));

  const selected = buckets
    .map((b) => ({ b, row: rows[keyOf(b)], value: Number(rows[keyOf(b)]?.amount.replace(",", ".")) || 0 }))
    .filter((x) => x.b.country && x.row?.on && x.row.destId && x.value > 0);
  const invalid = selected.some((x) => x.value > x.b.available || (x.b.currency === "XOF" && x.value < 500));

  const submit = async () => {
    setPending(true);
    setResults(null);
    try {
      const out = await batch({ password, items: selected.map((x) => ({ destinationId: x.row.destId, amount: x.value, currency: x.b.currency })) });
      const res = out.map((o, i) => ({ label: selected[i]?.b.country ? countryName(selected[i].b.country!) : "?", ok: o.ok, error: o.error }));
      setResults(res);
      if (res.every((r) => r.ok)) {
        toast.success(res.length > 1 ? `${res.length} retraits demandés : ils passeront en « payé » dès confirmation de Moneroo.` : "Retrait demandé : il passera en « payé » dès confirmation de Moneroo.");
        onDone();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  if (buckets.length === 0) {
    return (
      <div className="space-y-3 pr-12 pt-2">
        <h2 className="text-xl font-bold">Effectuer un retrait</h2>
        <p className="text-muted-foreground">Rien à retirer pour l&apos;instant.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="pr-12">
        <h2 className="text-xl font-bold">Effectuer un retrait</h2>
        <p className="mt-1 text-sm text-muted-foreground">Ta passerelle de paiement garde l&apos;argent séparément pour chaque pays : chaque pays se retire vers un numéro de ce pays. Une seule confirmation lance tous les retraits.</p>
      </div>

      <ul className="space-y-3">
        {buckets.map((b) => {
          const k = keyOf(b);
          const row = rows[k];
          const dests = destsFor(b);
          const value = Number(row?.amount.replace(",", ".")) || 0;
          return (
            <li key={k} className={cn("rounded-2xl border-2 p-4", row?.on ? "border-foreground" : "border-border")}>
              <div className="flex items-center gap-3">
                {b.country ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flagUrl(b.country)} alt="" className="h-5 w-7 shrink-0 rounded-[3px] object-cover" />
                ) : (
                  <span className="h-5 w-7 shrink-0 rounded-[3px] bg-surface" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{b.country ? countryName(b.country) : "Carte bancaire / crypto"}</p>
                  <p className="text-sm text-muted-foreground">Encaissé disponible : {formatMoney(b.available, b.currency)}</p>
                </div>
                {b.country && dests.length > 0 && (
                  <input type="checkbox" checked={row?.on ?? false} onChange={(e) => set(k, { on: e.target.checked })} aria-label={`Retirer ${countryName(b.country)}`} className="size-6 accent-[#141414]" />
                )}
              </div>

              {!b.country ? (
                <p className="mt-3 text-sm text-muted-foreground">Encaissé par carte ou crypto : à retirer depuis ton tableau de bord Moneroo ou ta passerelle (virement).</p>
              ) : dests.length === 0 ? (
                <div className="mt-3 space-y-2">
                  <button type="button" onClick={onManage} className="inline-flex h-11 items-center gap-2 rounded-xl bg-surface px-4 text-sm font-semibold">
                    <Plus className="size-4" /> Ajouter un numéro {countryName(b.country)}
                  </button>
                  <p className="text-xs text-muted-foreground">Sans numéro dans ce pays, retire cet argent depuis ton compte PayDunya (virement bancaire).</p>
                </div>
              ) : (
                row?.on && (
                  <div className="mt-3 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
                      <select value={row.destId} onChange={(e) => set(k, { destId: e.target.value })} aria-label="Numéro de retrait" className="h-12 rounded-xl border border-border bg-card px-3 text-base">
                        {dests.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label} · {mask(d.msisdn)}
                          </option>
                        ))}
                      </select>
                      <input inputMode="decimal" value={row.amount} onChange={(e) => set(k, { amount: e.target.value.replace(/[^\d.,]/g, "") })} aria-label={`Montant ${countryName(b.country)}`} className="h-12 rounded-xl border border-border px-3 text-lg font-bold" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Montant proposé : encaissé moins ~{Math.round(FEE_MARGIN * 100)} % de frais de passerelle (non communiqués).{" "}
                      <button type="button" onClick={() => set(k, { amount: String(b.currency === "XOF" ? Math.floor(b.available) : b.available) })} className="font-semibold underline underline-offset-2">
                        Tout le solde
                      </button>
                    </p>
                    {(value > b.available || (b.currency === "XOF" && value < 500)) && <p className="text-sm text-destructive">{value > b.available ? "Supérieur à l'argent encaissé dans ce pays." : "Minimum 500 F CFA."}</p>}
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>

      <PasswordField value={password} onChange={setPassword} />
      {results && (
        <ul className="space-y-1.5 text-sm" role="status">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-[var(--success-fg)]" : "text-destructive"}>
              {r.ok ? "✓" : "✗"} {r.label} : {r.ok ? "retrait envoyé" : r.error}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={pending || selected.length === 0 || invalid || !password}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-lg font-semibold text-background disabled:opacity-50"
      >
        {pending && <Loader2 className="size-5 animate-spin" />} {selected.length > 1 ? `Retirer ${selected.length} pays` : "Confirmer le retrait"}
      </button>
    </div>
  );
}

function Destinations({ data }: { data: Overview }) {
  const add = useStoreAction(api.payouts.addDestination);
  const remove = useStoreAction(api.payouts.removeDestination);
  const countries = useMemo(() => [...new Set(data.payoutMethods.flatMap((m) => m.countries))].sort((a, b) => countryName(a).localeCompare(countryName(b), "fr")), [data.payoutMethods]);
  const [country, setCountry] = useState(countries.includes("BJ") ? "BJ" : (countries[0] ?? ""));
  const methods = data.payoutMethods.filter((m) => m.countries.includes(country));
  const [method, setMethod] = useState("");
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<{ id: string; password: string } | null>(null);
  const current = methods.find((m) => m.code === method) ?? methods[0];

  const onAdd = async () => {
    if (!current) return;
    setBusy(true);
    try {
      await add({ password, method: current.code, phone, label });
      toast.success("Numéro enregistré");
      setPhone("");
      setLabel("");
      setPassword("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pt-2">
      <div className="pr-12">
        <h2 className="text-xl font-bold">Numéros de retrait</h2>
        <p className="mt-1 text-sm text-muted-foreground">Un numéro par pays où tu encaisses (8 maximum). Ajouter ou retirer un numéro demande ton mot de passe.</p>
      </div>
      <div className="space-y-2">
        {data.destinations.length === 0 && <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">Aucun numéro enregistré.</p>}
        {data.destinations.map((d) => {
          const m = data.payoutMethods.find((x) => x.code === d.method);
          return (
            <div key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3.5">
              {m?.iconUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.iconUrl} alt="" className="size-8 rounded-full" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{d.label}</div>
                <div className="text-sm text-muted-foreground">
                  {m?.name ?? d.method} · {mask(d.msisdn)}
                </div>
              </div>
              <button
                type="button"
                aria-label="Supprimer"
                onClick={() => setRemoving(removing?.id === d.id ? null : { id: d.id, password: "" })}
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-5" />
              </button>
              {removing?.id === d.id && (
                <div className="flex basis-full flex-wrap items-center gap-2 pt-1">
                  <input
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    placeholder="Mot de passe"
                    value={removing.password}
                    onChange={(e) => setRemoving({ id: d.id, password: e.target.value })}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-base"
                    aria-label="Mot de passe pour confirmer la suppression"
                  />
                  <button
                    type="button"
                    disabled={!removing.password}
                    onClick={async () => {
                      try {
                        await remove({ password: removing.password, id: d.id });
                        toast.success("Numéro retiré");
                        setRemoving(null);
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                    className="h-11 rounded-xl bg-destructive px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Retirer
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data.destinations.length < 8 && (
        <div className="space-y-4 rounded-3xl border border-border p-4">
          <h3 className="font-semibold">Ajouter un numéro</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Pays</span>
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setMethod("");
                }}
                className="h-12 w-full rounded-xl border border-border bg-card px-3 text-base"
              >
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {countryName(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold">Opérateur</span>
              <select value={current?.code ?? ""} onChange={(e) => setMethod(e.target.value)} className="h-12 w-full rounded-xl border border-border bg-card px-3 text-base">
                {methods.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.name} ({m.currency})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Numéro Mobile Money</span>
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+229 01 00 00 00 00" className="h-12 w-full rounded-xl border border-border px-4 text-base" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">Nom (optionnel)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mon MoMo perso" className="h-12 w-full rounded-xl border border-border px-4 text-base" />
          </label>
          <PasswordField value={password} onChange={setPassword} />
          <button type="button" onClick={onAdd} disabled={busy || !phone || !password || !current} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground font-semibold text-background disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />} Enregistrer le numéro
          </button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Catalogue Moneroo : {data.payoutMethods.length} moyens de retrait dans {countries.length} pays.</p>
    </div>
  );
}
