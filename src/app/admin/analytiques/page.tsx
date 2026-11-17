"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownUp, CalendarDays, ChartColumn, Check, ChevronDown, Eye, Globe2, X, Filter, MousePointerClick, Package, Radio, ShoppingBag } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { Money, StatCard } from "@/components/admin/ui";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useHideAmounts } from "@/hooks/use-hide-amounts";
import { fcfa, num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { countryName, flagUrl } from "@/lib/geo";
import { CountriesGlobe } from "@/components/admin/countries-globe";
import { useStoreQuery } from "@/hooks/use-current-store";

type Tab = "resume" | "direct" | "ventes" | "visites" | "comportement" | "produits" | "conversion";
const TABS: { value: Tab; label: string; icon: ReactNode; tint: string }[] = [
  { value: "resume", label: "Résumé", icon: <ChartColumn />, tint: "bg-[#e9ebe9]" },
  { value: "direct", label: "En direct", icon: <Radio />, tint: "bg-[#fde8e7]" },
  { value: "ventes", label: "Ventes", icon: <ShoppingBag />, tint: "bg-[#e3f9e8]" },
  { value: "visites", label: "Visites", icon: <Eye />, tint: "bg-[#e3ecfb]" },
  { value: "comportement", label: "Comportement", icon: <MousePointerClick />, tint: "bg-[#ede9fe]" },
  { value: "produits", label: "Produits", icon: <Package />, tint: "bg-[#eef6f0]" },
  { value: "conversion", label: "Taux de conversion", icon: <Filter />, tint: "bg-[#fdf7c3]" },
];

const DAY = 86_400_000;
const PRESETS = [
  { label: "7 derniers jours", days: 7 },
  { label: "30 derniers jours", days: 30 },
  { label: "90 derniers jours", days: 90 },
  { label: "12 derniers mois", days: 365 },
];

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("resume");
  const [range, setRange] = useState(() => {
    const to = startOfDay(Date.now()) + DAY;
    return { from: to - 30 * DAY, to };
  });
  const [country, setCountry] = useState<string | null>(null);
  const data = useStoreQuery(api.analytics.overview, { ...range, country: country ?? undefined });
  const k = data?.kpis;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-4 text-[1.75rem] font-bold lg:hidden">Analytiques</h1>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-72">
          <RangePicker range={range} onChange={setRange} />
        </div>
        <CountryFilter value={country} onChange={setCountry} countries={data?.countries ?? []} />
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            aria-pressed={tab === t.value}
            className={cn(
              "inline-flex h-12 shrink-0 items-center gap-2 rounded-full px-5 font-medium transition [&_svg]:size-5 [&_svg]:stroke-[1.6] sm:h-10",
              tab === t.value ? "bg-foreground text-background" : cn(t.tint, "hover:brightness-95"),
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "direct" ? (
        <LivePanel country={country} />
      ) : tab === "comportement" ? (
        <BehaviorPanel days={Math.max(1, Math.round((range.to - range.from) / DAY))} country={country} />
      ) : !data || !k ? (
        <div className="mt-6 grid grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {(tab === "resume" || tab === "ventes") && (
            <Block title="Ventes">
              <div className="grid grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2">
                <StatCard tone="white" value={<Money value={k.revenue} />} label="Revenu total" delta={data.deltas.revenue} hint="Ventes réglées sur la période, réductions déduites. Comparé à la période précédente de même durée." />
                <StatCard tone="white" value={<Money value={k.avgBasket} />} label="Panier moyen" delta={data.deltas.avgBasket} hint="Revenu ÷ nombre de ventes réglées." />
                <StatCard tone="white" value={num(k.paidCount)} label="Ventes réglées" delta={data.deltas.paidCount} hint="Paiements confirmés par Moneroo." />
                <StatCard tone="white" value={num(k.totalSales)} label="Total des ventes" hint="Toutes les tentatives de paiement : réglées, en attente, échouées et abandonnées." />
              </div>
              <ChartCard title="Revenu par jour">
                <RevenueChart series={data.series} />
              </ChartCard>
            </Block>
          )}

          {tab === "ventes" && (
            <Block title="Paiements">
              <div className="grid grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-3">
                <StatCard tone="white" value={pct(k.paymentSuccessRate)} label="Taux de réussite" hint="Ventes réglées ÷ (réglées + échouées + abandonnées). Sous 60 %, vérifie les moyens de paiement proposés." />
                <StatCard tone="white" value={num(k.failedCount + k.abandonedCount)} label="Échecs et abandons" />
                <StatCard tone="white" value={<Money value={k.lostRevenue} />} label="Revenu à récupérer" hint="Montant des paiements échoués ou abandonnés : à relancer sur WhatsApp depuis l'accueil." />
              </div>
              <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-2">
                <ChartCard title="Moyens de paiement">
                  <HBars rows={data.methods.map((m) => ({ label: m.method, value: m.count, display: `${m.count} vente${m.count > 1 ? "s" : ""}` }))} empty="Aucune vente réglée sur la période." />
                </ChartCard>
                <ChartCard title="Heures des ventes" subtitle="Heure du Bénin : programme tes publications juste avant les pics.">
                  <HoursChart hours={data.hours} />
                </ChartCard>
              </div>
            </Block>
          )}

          {(tab === "resume" || tab === "visites") && (
            <Block title="Visites">
              <div className="grid grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2">
                <StatCard tone="white" value={num(k.visitors)} label="Visiteurs uniques" delta={data.deltas.visitors} hint="Personnes différentes ayant vu ta boutique (une par appareil et par jour)." />
                <StatCard tone="white" value={pct(k.conversion)} label="Taux de conversion" delta={data.deltas.conversion} hint="Ventes réglées ÷ visiteurs uniques. Entre 1 et 3 % est courant pour des produits digitaux." />
              </div>
              {tab === "visites" && (
                <>
                  <ChartCard title="Visiteurs par jour">
                    <VisitorsChart series={data.series} />
                  </ChartCard>
                  <ChartCard title="D'où viennent tes clients" subtitle="Source = lien UTM ou site d'origine. Ajoute ?utm_source=facebook à tes liens de pub.">
                    <SourcesTable rows={data.sources} />
                  </ChartCard>
                </>
              )}
            </Block>
          )}

          {(tab === "resume" || tab === "visites" || tab === "ventes") && (
            <Block title="Pays">
              <CountriesBlock rows={data.countries} unknown={data.unknownVisitors} selected={country} onSelect={setCountry} />
            </Block>
          )}

          {(tab === "produits" || tab === "resume") && (
            <Block title="Produits">
              <ProductsTable rows={data.products} />
            </Block>
          )}

          {(tab === "conversion" || tab === "resume") && (
            <Block title="Entonnoir de conversion">
              <ChartCard title="Du visiteur à la vente" subtitle="Où perds-tu tes acheteurs ? La plus grosse chute est ton chantier prioritaire.">
                <Funnel steps={data.funnel} />
              </ChartCard>
              {tab === "conversion" && <ProductFunnels days={Math.max(1, Math.round((range.to - range.from) / DAY))} country={country} />}
            </Block>
          )}
        </div>
      )}
    </div>
  );
}

function RangePicker({ range, onChange }: { range: { from: number; to: number }; onChange: (r: { from: number; to: number }) => void }) {
  const [open, setOpen] = useState(false);
  const toInput = (ts: number) => new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-14 w-full items-center gap-3 rounded-2xl bg-surface px-5 text-left font-semibold hover:bg-[#eceeec] sm:h-12 sm:rounded-xl sm:border sm:border-border sm:bg-card">
        <CalendarDays className="size-5 stroke-[1.6]" />
        {dateFmt.format(range.from)} - {dateFmt.format(range.to - 1)}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-2xl p-3">
        <div className="space-y-1">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => {
                const to = startOfDay(Date.now()) + DAY;
                onChange({ from: to - p.days * DAY, to });
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center rounded-xl px-3 text-left font-medium hover:bg-surface"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
          <label className="space-y-1 text-sm font-medium">
            Du
            <input
              type="date"
              value={toInput(range.from)}
              onChange={(e) => e.target.value && onChange({ ...range, from: startOfDay(new Date(`${e.target.value}T00:00`).getTime()) })}
              className="h-11 w-full rounded-lg border border-border px-2"
            />
          </label>
          <label className="space-y-1 text-sm font-medium">
            Au
            <input
              type="date"
              value={toInput(range.to - 1)}
              onChange={(e) => e.target.value && onChange({ ...range, to: startOfDay(new Date(`${e.target.value}T00:00`).getTime()) + DAY })}
              className="h-11 w-full rounded-lg border border-border px-2"
            />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-[28px] bg-surface p-4 sm:p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-5">
      <h3 className="font-semibold">{title}</h3>
      {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const axis = { fontSize: 12, fill: "#6f746f" };
const INK = "#141414";

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { value: number }[]; label?: string; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-lg">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold">{format(payload[0].value)}</div>
    </div>
  );
}

function useDays<T extends { day: string }>(series: T[]) {
  return useMemo(() => series.map((s) => ({ ...s, label: shortDay.format(new Date(`${s.day}T00:00:00Z`)) })), [series]);
}

function RevenueChart({ series }: { series: { day: string; revenue: number }[] }) {
  const { hidden } = useHideAmounts();
  const rows = useDays(series);
  if (series.every((s) => s.revenue === 0)) return <Empty text="Aucun revenu sur la période." />;
  return (
    <div className="h-64" role="img" aria-label="Revenu par jour">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8cb3c" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#f8cb3c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#eceeec" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={hidden ? 8 : 56} tickCount={4} allowDecimals={false} tickFormatter={(v: number) => (hidden ? "" : v >= 1000 ? `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}k` : String(Math.round(v)))} />
          <Tooltip cursor={{ stroke: "#c9ccc9" }} content={<ChartTooltip format={(v) => (hidden ? "•••" : fcfa(v))} />} />
          <Area type="monotone" dataKey="revenue" stroke={INK} strokeWidth={2} fill="url(#rev)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function VisitorsChart({ series }: { series: { day: string; visitors: number }[] }) {
  const rows = useDays(series);
  if (series.every((s) => s.visitors === 0)) return <Empty text="Aucune visite enregistrée sur la période." />;
  return (
    <div className="h-56" role="img" aria-label="Visiteurs par jour">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="#eceeec" />
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tick={axis} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f3f4f3" }} content={<ChartTooltip format={(v) => `${num(v)} visiteur${v > 1 ? "s" : ""}`} />} />
          <Bar dataKey="visitors" fill={INK} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HoursChart({ hours }: { hours: { hour: number; sales: number }[] }) {
  if (hours.every((h) => h.sales === 0)) return <Empty text="Pas encore assez de ventes." />;
  const rows = hours.map((h) => ({ ...h, label: `${h.hour}h` }));
  return (
    <div className="h-48" role="img" aria-label="Ventes par heure">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: 0, right: 0, top: 8 }}>
          <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={3} />
          <YAxis hide allowDecimals={false} />
          <Tooltip cursor={{ fill: "#f3f4f3" }} content={<ChartTooltip format={(v) => `${v} vente${v > 1 ? "s" : ""}`} />} />
          <Bar dataKey="sales" fill={INK} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function HBars({ rows, empty }: { rows: { label: string; value: number; display: string }[]; empty: string }) {
  if (rows.length === 0) return <Empty text={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-medium">{r.label}</span>
            <span className="text-muted-foreground">{r.display}</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Palette validée (dataviz/validate_palette.js, surface blanche) : bleu → violet → orange → vert.
// Le vert est à 2,8:1 sur blanc : les valeurs sont donc écrites dans des pastilles, jamais en couleur sur couleur.
const FUNNEL_COLORS = ["#2a78d6", "#4a3aa7", "#eb6834", "#1baf7a"];

/** Entonnoir horizontal et curviligne : la bande se resserre en courbes douces d'une étape à l'autre. */
function Funnel({ steps }: { steps: { step: string; value: number }[] }) {
  if (!steps.length || steps[0].value === 0) return <Empty text="Pas encore de visites sur la période." />;
  const W = 1000;
  const H = 240;
  const cy = H / 2;
  const maxH = 220;
  const minH = 36;
  const top = Math.max(steps[0].value, 1);
  const n = steps.length;
  const seg = W / n;
  const h = (v: number) => minH + (maxH - minH) * Math.min(1, v / top);
  const heights = [...steps.map((s) => h(s.value)), h(steps[n - 1].value) * 0.82];
  const rates = steps.map((s, i) => (i === 0 ? null : steps[i - 1].value ? s.value / steps[i - 1].value : 0));
  const worst = rates.reduce<number | null>((w, r, i) => (r === null ? w : w === null || r < (rates[w] ?? 1) ? i : w), null);

  // Segment i : de x0 (hauteur h0) à x1 (hauteur h1), bords en S (courbe de Bézier cubique)
  const path = (i: number) => {
    const x0 = i * seg;
    const x1 = (i + 1) * seg;
    const h0 = heights[i] / 2;
    const h1 = heights[i + 1] / 2;
    const k = seg * 0.55;
    return [
      `M ${x0} ${cy - h0}`,
      `C ${x0 + k} ${cy - h0}, ${x1 - k} ${cy - h1}, ${x1} ${cy - h1}`,
      `L ${x1} ${cy + h1}`,
      `C ${x1 - k} ${cy + h1}, ${x0 + k} ${cy + h0}, ${x0} ${cy + h0}`,
      "Z",
    ].join(" ");
  };

  return (
    <div>
      <div>
        <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Entonnoir de conversion">
          {steps.map((s, i) => (
            <g key={s.step}>
              <title>{`${s.step} : ${num(s.value)}`}</title>
              <path d={path(i)} fill={FUNNEL_COLORS[i]} stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" />
            </g>
          ))}
        </svg>
        {/* Valeurs en HTML (lisibles quelle que soit la largeur) */}
        {steps.map((s, i) => (
          <span
            key={s.step}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2.5 py-0.5 text-sm font-bold tabular shadow-sm sm:px-3.5 sm:py-1 sm:text-lg"
            style={{ left: `${((i + 0.5) / n) * 100}%` }}
          >
            {num(s.value)}
          </span>
        ))}
        </div>

        {/* Libellés sous chaque étape */}
        <div className="mt-3 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {steps.map((s, i) => (
            <div key={s.step} className="px-2 text-center">
              <div className="flex flex-col items-center justify-center gap-1 text-xs font-semibold leading-tight sm:flex-row sm:gap-1.5 sm:text-[0.95rem]">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: FUNNEL_COLORS[i] }} aria-hidden />
                {s.step}
              </div>
              <div className="mt-0.5 text-[0.7rem] text-muted-foreground sm:text-sm">
                {i === 0 ? "100 %" : pct(s.value / top, 1)}
                <span className="hidden sm:inline"> des visiteurs</span>
              </div>
            </div>
          ))}
        </div>

        {/* Passages entre étapes, centrés sur chaque jonction */}
        <div className="relative mt-3 h-14">
          {steps.slice(1).map((s, j) => {
            const i = j + 1;
            const rate = rates[i] ?? 0;
            const lost = steps[i - 1].value - s.value;
            return (
              <div
                key={s.step}
                className={cn(
                  "absolute top-0 -translate-x-1/2 rounded-xl px-2 py-1 text-center text-[0.7rem] font-semibold sm:px-2.5 sm:py-1.5 sm:text-xs",
                  i === worst && rate < 1 ? "bg-[#fde2e2] text-[#991b1b]" : "bg-surface text-muted-foreground",
                )}
                style={{ left: `${(i / n) * 100}%` }}
              >
                <div className="whitespace-nowrap">
                  → {pct(rate, 0)}
                  <span className="hidden sm:inline"> passent</span>
                </div>
                <div className="whitespace-nowrap">
                  {i === worst && rate < 1 ? "⚠ " : ""}−{num(lost)}
                  <span className="hidden sm:inline"> perdu{lost > 1 ? "s" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <table className="sr-only">
        <caption>Entonnoir de conversion</caption>
        <tbody>
          {steps.map((s, i) => (
            <tr key={s.step}>
              <th>{s.step}</th>
              <td>{s.value}</td>
              <td>{rates[i] === null ? "" : pct(rates[i] ?? 0, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourcesTable({ rows }: { rows: { source: string; visitors: number; sales: number; revenue: number }[] }) {
  if (rows.length === 0) return <Empty text="Pas encore de données de trafic." />;
  return (
    <table className="w-full text-left text-[0.95rem]">
      <thead>
        <tr className="border-b border-border text-sm text-muted-foreground">
          <th className="py-2 font-semibold">Source</th>
          <th className="py-2 text-right font-semibold">Visiteurs</th>
          <th className="py-2 text-right font-semibold">Ventes</th>
          <th className="hidden py-2 text-right font-semibold sm:table-cell">Revenu</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.source} className="border-b border-border last:border-0">
            <td className="py-3 font-medium">{r.source}</td>
            <td className="py-3 text-right tabular">{num(r.visitors)}</td>
            <td className="py-3 text-right tabular">{num(r.sales)}</td>
            <td className="hidden py-3 text-right sm:table-cell">
              <Money value={r.revenue} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProductsTable({ rows }: { rows: { productId: string; title: string; revenue: number; sales: number; visitors: number; conversion: number }[] }) {
  if (rows.length === 0) return <div className="rounded-3xl bg-card p-5"><Empty text="Aucune activité produit sur la période." /></div>;
  return (
    <div className="overflow-hidden rounded-3xl bg-card">
      {rows.map((r, i) => (
        <a key={r.productId} href={`/admin/produits/${r.productId}`} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0 hover:bg-surface/60">
          <span className="w-5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{r.title}</div>
            <div className="text-sm text-muted-foreground">
              {num(r.visitors)} visiteur{r.visitors > 1 ? "s" : ""} · {num(r.sales)} vente{r.sales > 1 ? "s" : ""} · conversion {pct(r.conversion)}
            </div>
          </div>
          <Money value={r.revenue} className="font-bold" />
        </a>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

// ── Tracking maison : temps réel, comportement, entonnoir par produit ─────

function useNow(every: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / every) * every);
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / every) * every), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function since(ts: number, now: number) {
  const m = Math.max(0, Math.round((now - ts) / 60_000));
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : `depuis ${timeFmt.format(ts)}`;
}

function LivePanel({ country }: { country: string | null }) {
  const now = useNow(15_000);
  const live = useStoreQuery(api.tracking.live, { now, country: country ?? undefined });
  if (!live) return <Skeleton className="mt-6 h-64 rounded-3xl" />;
  return (
    <div className="mt-6 space-y-6">
      <Block title="En ce moment">
        <div className="grid grid-cols-1 gap-3 [&>*]:min-w-0 sm:grid-cols-2">
          <StatCard
            tone="white"
            value={
              <span className="inline-flex items-center gap-3">
                <span className="relative flex size-3">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#1baf7a] opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-3 rounded-full bg-[#1baf7a]" />
                </span>
                {num(live.count)}
              </span>
            }
            label="Visiteurs actifs"
            hint="Personnes actives sur ta boutique ces 5 dernières minutes. Mis à jour en continu."
          />
          <StatCard tone="white" value={num(live.inCheckout)} label="Sur la page de paiement" hint="Visiteurs en train de remplir le formulaire de paiement." />
        </div>
        <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-2">
          <ChartCard title="Pages consultées">
            <HBars rows={live.pages.map((p) => ({ label: p.label, value: p.n, display: `${p.n} visiteur${p.n > 1 ? "s" : ""}` }))} empty="Personne sur la boutique pour l'instant." />
          </ChartCard>
          <ChartCard title="Visiteurs" subtitle="Les plus récents en premier.">
            {live.visitors.length === 0 ? (
              <Empty text="Personne sur la boutique pour l'instant." />
            ) : (
              <ul className="divide-y divide-border">
                {live.visitors.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2.5">
                    {v.country ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={flagUrl(v.country)} alt={countryName(v.country)} title={countryName(v.country)} className="h-4 w-6 shrink-0 rounded-[3px] object-cover" />
                    ) : (
                      <span className="h-4 w-6 shrink-0 rounded-[3px] bg-surface" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{v.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {v.device} · {v.source} · {v.pages} page{v.pages > 1 ? "s" : ""}
                        {v.isNew ? " · nouveau" : " · déjà venu"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{since(v.since, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </ChartCard>
        </div>
      </Block>
    </div>
  );
}

function duration(ms: number) {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} jours`;
}

function BehaviorPanel({ days, country }: { days: number; country: string | null }) {
  const b = useStoreQuery(api.tracking.behavior, { days, country: country ?? undefined });
  if (!b) return <Skeleton className="mt-6 h-64 rounded-3xl" />;
  const share = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)} %` : "—");
  const rows = (list: { label: string; value: number }[]) => list.map((r) => ({ label: r.label, value: r.value, display: `${share(r.value, b.sessions)} · ${num(r.value)}` }));
  return (
    <div className="mt-6 space-y-6">
      <Block title="Visites">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard tone="white" value={num(b.sessions)} label="Visites" hint="Une visite se termine après 30 minutes d'inactivité." />
          <StatCard tone="white" value={share(b.newVisitors, b.sessions)} label="Nouveaux visiteurs" hint={`${num(b.newVisitors)} nouveaux, ${num(b.returning)} déjà venus.`} />
          <StatCard tone="white" value={String(b.pagesPerSession).replace(".", ",")} label="Pages par visite" />
          <StatCard
            tone="white"
            value={b.medianToPurchaseMs !== null ? duration(b.medianToPurchaseMs) : "—"}
            label="Délai avant achat"
            hint={b.purchases ? `Temps médian entre la 1re visite et l'achat (${b.purchases} achat${b.purchases > 1 ? "s" : ""} suivis).` : "Apparaît après les premiers achats suivis."}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-3">
          <ChartCard title="Appareils">
            <HBars rows={rows(b.devices)} empty="Pas encore de visites." />
          </ChartCard>
          <ChartCard title="Navigateurs">
            <HBars rows={rows(b.browsers)} empty="Pas encore de visites." />
          </ChartCard>
          <ChartCard title="Systèmes">
            <HBars rows={rows(b.os)} empty="Pas encore de visites." />
          </ChartCard>
        </div>
      </Block>

      <Block title="Fiches produit">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard tone="white" value={b.avgTimeOnProduct ? `${b.avgTimeOnProduct} s` : "—"} label="Temps moyen" hint="Temps passé sur une fiche, onglet visible uniquement." />
          <StatCard tone="white" value={share(b.scroll50, b.productViews)} label="Lisent la moitié" hint="Visiteurs qui font défiler au moins 50 % de la fiche." />
          <StatCard tone="white" value={share(b.scroll90, b.productViews)} label="Lisent jusqu'au bout" hint="Au moins 90 % de la fiche. Bas ? Remonte ton argument principal et le bouton." />
          <StatCard tone="white" value={num(b.previewOpens)} label="Aperçus ouverts" hint="Clics sur « Aperçu » d'un fichier." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard tone="white" value={num(b.shares)} label="Partages" />
          <StatCard tone="white" value={num(b.contacts)} label="Contacts WhatsApp" hint="Clics sur « Contact » depuis une fiche." />
        </div>
      </Block>

      <Block title="Paiement">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard tone="white" value={num(b.checkoutOpened)} label="Pages de paiement ouvertes" />
          <StatCard tone="white" value={share(b.checkoutNoStart, b.checkoutOpened)} label="Abandon avant de payer" hint="Ont ouvert le paiement sans cliquer sur « Payer »." />
          <StatCard tone="white" value={b.couponTries ? `${b.couponOk}/${b.couponTries}` : "—"} label="Codes promo valides" hint="Codes acceptés / codes essayés." />
        </div>
        <ChartCard title="Dernier champ rempli avant l'abandon" subtitle="Le champ où les acheteurs s'arrêtent. Le contenu saisi n'est jamais enregistré.">
          <HBars rows={b.fieldDrop.map((r) => ({ label: r.label, value: r.value, display: `${num(r.value)} visite${r.value > 1 ? "s" : ""}` }))} empty="Aucun abandon sur la période." />
        </ChartCard>
        <ChartCard title="Erreurs rencontrées au paiement" subtitle="Ce que les acheteurs ont vu s'afficher : numéro refusé, boutique fermée, pays non couvert… (sessions touchées).">
          <HBars rows={b.checkoutErrors.map((r) => ({ label: r.label, value: r.value, display: `${num(r.value)} visite${r.value > 1 ? "s" : ""}` }))} empty="Aucune erreur enregistrée sur la période." />
        </ChartCard>
      </Block>
      {b.truncated && <p className="text-sm text-muted-foreground">Période très chargée : seuls les 60 000 événements les plus anciens sont analysés. Réduis la période pour un détail complet.</p>}
    </div>
  );
}

function ProductFunnels({ days, country }: { days: number; country: string | null }) {
  const rows = useStoreQuery(api.tracking.productFunnels, { days, country: country ?? undefined });
  if (!rows) return <Skeleton className="h-40 rounded-3xl" />;
  const cols = [
    { key: "views", label: "Vues" },
    { key: "previews", label: "Aperçu" },
    { key: "checkouts", label: "Paiement ouvert" },
    { key: "payments", label: "Paiement lancé" },
    { key: "purchases", label: "Achats" },
  ] as const;
  return (
    <ChartCard title="Entonnoir par produit" subtitle="Visites uniques à chaque étape. Le % indique la part des vues qui atteint l'étape.">
      {rows.length === 0 ? (
        <Empty text="Pas encore de visites suivies sur tes produits." />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Produit</th>
                {cols.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-right font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.productId}>
                  <td className="max-w-[220px] truncate py-2.5 pr-3 font-medium">{r.title}</td>
                  {cols.map((c) => (
                    <td key={c.key} className="px-2 py-2.5 text-right tabular">
                      <span className="font-semibold">{num(r[c.key])}</span>
                      {c.key !== "views" && r.views > 0 && <span className="ml-1 text-xs text-muted-foreground">{Math.round((r[c.key] / r.views) * 100)} %</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ── Pays : filtre, globe et tableau triable ───────────────────────────────

type CountryRow = { code: string; visitors: number; sales: number; revenue: number; latlng: [number, number] | null };

function CountryFilter({ value, onChange, countries }: { value: string | null; onChange: (c: string | null) => void; countries: CountryRow[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = countries
    .map((c) => ({ ...c, name: countryName(c.code) }))
    .filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.visitors + b.sales * 10 - (a.visitors + a.sales * 10));
  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className="inline-flex h-14 items-center gap-2 rounded-2xl bg-surface px-4 font-semibold hover:bg-[#eceeec] sm:h-12 sm:rounded-xl sm:border sm:border-border sm:bg-card">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={flagUrl(value)} alt="" className="h-4 w-6 rounded-[3px] object-cover" />
          ) : (
            <Globe2 className="size-5 stroke-[1.6]" />
          )}
          {value ? countryName(value) : "Tous les pays"}
          <ChevronDown className="size-4" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          {countries.length > 6 && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un pays" className="mb-2 h-11 w-full rounded-xl border border-border bg-card px-3 text-base outline-none" />
          )}
          <ul className="max-h-80 overflow-y-auto">
            <li>
              <button type="button" onClick={() => (onChange(null), setOpen(false))} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface">
                <Globe2 className="size-4" /> <span className="flex-1">Tous les pays</span> {!value && <Check className="size-4" />}
              </button>
            </li>
            {list.map((c) => (
              <li key={c.code}>
                <button type="button" onClick={() => (onChange(c.code), setOpen(false))} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left hover:bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(c.code)} alt="" className="h-4 w-6 rounded-[3px] object-cover" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{num(c.visitors)} vis.</span>
                  {value === c.code && <Check className="size-4" />}
                </button>
              </li>
            ))}
            {countries.length === 0 && <li className="px-2 py-3 text-sm text-muted-foreground">Aucun pays détecté sur la période.</li>}
          </ul>
        </PopoverContent>
      </Popover>
      {value && (
        <button type="button" onClick={() => onChange(null)} aria-label="Retirer le filtre pays" className="flex size-11 items-center justify-center rounded-full hover:bg-surface">
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

type SortKey = "revenue" | "sales" | "visitors" | "conversion";

function CountriesBlock({ rows, unknown, selected, onSelect }: { rows: CountryRow[]; unknown: number; selected: string | null; onSelect: (c: string | null) => void }) {
  const [metric, setMetric] = useState<"visitors" | "sales">("visitors");
  const [sort, setSort] = useState<SortKey>("revenue");
  const conv = (r: CountryRow) => (r.visitors ? Math.min(1, r.sales / r.visitors) : 0);
  const sorted = [...rows].sort((a, b) => (sort === "conversion" ? conv(b) - conv(a) : b[sort] - a[sort]) || b.visitors - a.visitors);
  if (rows.length === 0) return <Empty text="Aucun pays détecté sur la période. Les nouvelles visites enregistrent le pays du visiteur." />;
  const head = (key: SortKey, label: string) => (
    <th className="px-2 py-2 text-right font-medium">
      <button type="button" onClick={() => setSort(key)} aria-pressed={sort === key} className={cn("inline-flex min-h-9 items-center gap-1", sort === key ? "font-semibold text-foreground" : "")}>
        {label}
        <ArrowDownUp className={cn("size-3.5", sort === key ? "opacity-100" : "opacity-40")} />
      </button>
    </th>
  );
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="overflow-hidden rounded-3xl bg-card p-4 sm:p-5">
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-surface p-1 text-sm">
          {(["visitors", "sales"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m} className={cn("h-10 rounded-lg font-semibold", metric === m ? "bg-card shadow-sm" : "text-muted-foreground")}>
              {m === "visitors" ? "Visiteurs" : "Ventes"}
            </button>
          ))}
        </div>
        <CountriesGlobe points={rows.map((r) => ({ code: r.code, latlng: r.latlng, value: r[metric] }))} selected={selected} />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Taille des points ∝ {metric === "visitors" ? "visiteurs" : "ventes"}. Clique un pays du tableau pour filtrer toute la page.
        </p>
      </div>
      <div className="overflow-hidden rounded-3xl bg-card p-4 sm:p-5">
        {/* Mobile : liste compacte, tri par pastilles (pas de défilement horizontal) */}
        <div className="sm:hidden">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1">
            {(
              [
                ["revenue", "Revenu"],
                ["visitors", "Visiteurs"],
                ["sales", "Ventes"],
                ["conversion", "Conv."],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={cn("h-10 min-w-0 truncate rounded-lg px-1 text-[0.8rem] font-semibold", sort === key ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="mt-2 divide-y divide-border">
            {sorted.map((r) => (
              <li key={r.code}>
                <button
                  type="button"
                  onClick={() => onSelect(selected === r.code ? null : r.code)}
                  aria-pressed={selected === r.code}
                  className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl px-1 py-2 text-left", selected === r.code && "bg-surface")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(r.code)} alt="" className="h-4 w-6 shrink-0 rounded-[3px] object-cover" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{countryName(r.code)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {num(r.visitors)} visiteur{r.visitors > 1 ? "s" : ""} · {num(r.sales)} vente{r.sales > 1 ? "s" : ""} · {pct(conv(r))}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular">
                    <Money value={r.revenue} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="-mx-5 hidden overflow-x-auto px-5 sm:block">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Pays</th>
                {head("visitors", "Visiteurs")}
                {head("sales", "Ventes")}
                {head("revenue", "Revenu")}
                {head("conversion", "Conversion")}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => (
                <tr key={r.code} onClick={() => onSelect(selected === r.code ? null : r.code)} className={cn("cursor-pointer hover:bg-surface/60", selected === r.code && "bg-surface")}>
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2 font-medium">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={flagUrl(r.code)} alt="" className="h-4 w-6 shrink-0 rounded-[3px] object-cover" />
                      {countryName(r.code)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular">{num(r.visitors)}</td>
                  <td className="px-2 py-2.5 text-right tabular">{num(r.sales)}</td>
                  <td className="px-2 py-2.5 text-right tabular">
                    <Money value={r.revenue} />
                  </td>
                  <td className="px-2 py-2.5 text-right tabular">{pct(conv(r))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unknown > 0 && <p className="mt-3 text-xs text-muted-foreground">{num(unknown)} visiteur{unknown > 1 ? "s" : ""} sans pays détecté (visites anciennes ou localisation indisponible).</p>}
      </div>
    </div>
  );
}
