"use client";
import { PushReminder } from "@/components/admin/push-settings";

import Link from "next/link";
import { BadgePercent, Check, CircleDollarSign, PackagePlus, ShoppingBag, Store, Users } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Money, StatCard, StatusBadge, Thumb } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, waLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStoreQuery, useCurrentStore } from "@/hooks/use-current-store";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";

function greeting(h: number) {
  if (h < 5) return { hello: "Bonsoir", line: "🌙 La clarté nocturne apporte les meilleures idées : capture-les !" };
  if (h < 12) return { hello: "Bonjour", line: "☀️ Une nouvelle journée pour faire décoller tes ventes." };
  if (h < 18) return { hello: "Salut", line: "⚡ L'après-midi est parfait pour publier un nouveau contenu." };
  return { hello: "Bonsoir", line: "🌙 Les heures calmes sont parfaites pour la création concentrée." };
}

export default function AdminHome() {
  const { store } = useCurrentStore();
  const data = useStoreQuery(api.analytics.home, {});
  const settings = useStoreQuery(api.settings.adminSettings, {});
  const setup = useStoreQuery(api.settings.setupStatus, {});
  const recent = useStoreQuery(api.sales.list, { limit: 5 });
  const g = greeting(new Date().getHours());
  const first = settings?.ownerName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl">
      {setup && !Object.values(setup).every(Boolean) && <SetupCard setup={setup} />}
      <AllStoresCard />
      <div className="mb-8 empty:hidden">
        <PushReminder />
      </div>

      <h1 className="font-heading text-[2.1rem] leading-tight sm:text-5xl">
        {g.hello}
        {first ? ` ${first}` : ""} ! 🌟
      </h1>
      <p className="mt-2 text-[0.95rem] font-medium text-foreground/80">{g.line}</p>

      <div className="-mx-4 mt-5 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <QuickAction href="/admin/produits?nouveau=1" icon={<PackagePlus />}>Ajouter un produit</QuickAction>
        <QuickAction href="/admin/reductions?nouveau=1" icon={<BadgePercent />}>Créer une réduction</QuickAction>
        <QuickAction href={store.url} icon={<Store />} external>Voir ma boutique</QuickAction>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <StatCard
          className="col-span-2 lg:col-span-1"
          icon={<CircleDollarSign />}
          value={data ? <Money value={data.totalRevenue} /> : <Skeleton className="h-9 w-40" />}
          label="Revenu total"
          hint="Somme des ventes réglées depuis l'ouverture de la boutique, réductions déduites."
        />
        <StatCard
          icon={<ShoppingBag />}
          value={data ? <Money value={data.weekRevenue} /> : <Skeleton className="h-9 w-28" />}
          label="7 derniers jours"
          delta={data && data.weekRevenuePrev > 0 ? (data.weekRevenue - data.weekRevenuePrev) / data.weekRevenuePrev : undefined}
          hint="Ventes réglées sur les 7 derniers jours, comparées aux 7 jours d'avant."
        />
        <StatCard icon={<Users />} value={data ? data.customers : <Skeleton className="h-9 w-16" />} label="Clients" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-5 [&>*]:min-w-0">
        <section className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dernières ventes</h2>
            <Link href="/admin/ventes" className="inline-flex h-10 items-center rounded-full bg-brand px-4 text-sm font-semibold hover:bg-brand-hover">
              Voir tout
            </Link>
          </div>
          <div className="divide-y divide-border rounded-3xl border border-border">
            {recent === undefined &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="size-12 rounded-lg" />
                  <Skeleton className="h-5 flex-1" />
                </div>
              ))}
            {recent?.length === 0 && (
              <p className="p-6 text-center text-[0.95rem] text-muted-foreground">
                Pas encore de vente. Partage le lien d&apos;un produit sur WhatsApp ou Facebook pour démarrer.
              </p>
            )}
            {recent?.map((s) => (
              <Link key={s._id} href={`/admin/ventes?vente=${s._id}`} className="flex items-center gap-3 p-4 hover:bg-surface/60">
                <Thumb src={s.coverUrl} alt="" className="size-12" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{s.customerName}</div>
                  <div className="truncate text-sm text-muted-foreground">{s.productTitle}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Money value={s.net} className="text-sm font-semibold" />
                  <StatusBadge status={s.status} className="px-2 py-0.5 text-xs [&_svg]:size-3.5" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold">À relancer</h2>
          <p className="mb-3 text-sm text-muted-foreground">Paiements échoués ou abandonnés cette semaine. Un message WhatsApp en récupère souvent une partie.</p>
          <div className="space-y-2.5">
            {data?.toFollowUp.length === 0 && (
              <div className="rounded-3xl bg-surface p-5 text-[0.95rem] text-muted-foreground">Rien à relancer pour l&apos;instant 👌</div>
            )}
            {data?.toFollowUp.map((s) => (
              <div key={s._id} className="flex items-center gap-3 rounded-3xl bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{s.customerName}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    <Money value={s.net} /> · {s.status === "failed" ? "échoué" : "abandonné"} le {fmtDate(s.at)}
                  </div>
                </div>
                {s.customerPhone && (
                  <a
                    href={waLink(
                      s.customerPhone,
                      `Bonjour ${s.customerName.split(" ")[0]}, j'ai vu que ton paiement pour « ${s.productTitle} » n'est pas allé au bout. Je peux t'aider à finaliser ?`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-card px-4 text-sm font-semibold text-[#15803d]"
                  >
                    <WhatsAppIcon className="size-4" /> Relancer
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickAction({ href, icon, children, external }: { href: string; icon: React.ReactNode; children: React.ReactNode; external?: boolean }) {
  const cls =
    "inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full border border-border bg-card px-5 text-[0.95rem] font-medium hover:bg-surface [&_svg]:size-5 [&_svg]:stroke-[1.6] sm:bg-surface sm:border-transparent sm:hover:bg-[#eceeec]";
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={cls}>
      {icon}
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {icon}
      {children}
    </Link>
  );
}

function SetupCard({ setup }: { setup: { store: boolean; moneroo: boolean; smtp: boolean; product: boolean; pixel: boolean } }) {
  const steps = [
    { done: setup.store, label: "Nommer ta boutique", href: "/admin/parametres" },
    { done: setup.product, label: "Publier un premier produit", href: "/admin/produits" },
    { done: setup.moneroo, label: "Brancher Moneroo (clés API)", href: "/admin/parametres#paiement" },
    { done: setup.smtp, label: "Configurer l'envoi d'emails", href: "/admin/parametres#emails" },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="mb-8 rounded-[28px] bg-brand p-6 sm:p-8">
      <h2 className="font-heading text-2xl sm:text-3xl">Mets ta boutique en ligne</h2>
      <p className="mt-1 text-[0.95rem] text-foreground/80">
        {done} étape{done > 1 ? "s" : ""} sur {steps.length}. Encore quelques minutes et tu peux encaisser.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={cn("flex min-h-12 items-center gap-3 rounded-2xl bg-card/70 px-4 py-2.5 font-medium hover:bg-card", s.done && "text-foreground/50 line-through")}
          >
            <span className={cn("flex size-6 items-center justify-center rounded-full border-2 border-foreground/30", s.done && "border-foreground bg-foreground text-brand")}>
              {s.done && <Check className="size-3.5 stroke-[3]" />}
            </span>
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Résumé de toutes les boutiques (affiché dès qu'il y en a plusieurs). */
function AllStoresCard() {
  const { stores, store, select } = useCurrentStore();
  if (stores.length < 2) return null;
  const total = stores.reduce((a, s) => a + s.revenue30, 0);
  const top = [...stores].sort((a, b) => b.revenue30 - a.revenue30)[0];
  return (
    <div className="mb-8 rounded-[28px] border border-border p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Toutes mes boutiques · 30 derniers jours</h2>
        <Link href="/admin/boutiques" className="text-sm font-semibold underline-offset-4 hover:underline">
          Gérer
        </Link>
      </div>
      <div className="mt-1 text-2xl font-bold">
        <Money value={total} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {stores.map((s) => (
          <button
            key={s._id}
            type="button"
            onClick={() => s._id !== store._id && select(s.slug)}
            className={cn("inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold", s._id === store._id ? "bg-foreground text-background" : "bg-surface hover:bg-[#eceeec]")}
          >
            {s.name} · <Money value={s.revenue30} />
            {s._id === top._id && top.revenue30 > 0 && <span aria-label="Meilleure boutique">🏆</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
