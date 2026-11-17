"use client";

import Link from "next/link";
import { BadgePercent, CircleDollarSign, Copy, FileText, Palette, Zap, Package, Settings, Store, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { StoreSwitcher } from "@/components/admin/store-switcher";
import { useCurrentStore } from "@/hooks/use-current-store";

const ITEMS = [
  [
    { href: "/admin/produits", label: "Produits", icon: Package },
    { href: "/admin/clients", label: "Clients", icon: Users },
    { href: "/admin/revenus", label: "Revenus", icon: CircleDollarSign },
    { href: "/admin/reductions", label: "Réductions", icon: BadgePercent },
  ],
  [
    { href: "/admin/vitrine", label: "Vitrine", icon: Palette },
    { href: "/admin/automatisations", label: "Automatisations", icon: Zap },
  ],
  [
    { href: "/admin/boutiques", label: "Mes boutiques", icon: Store },
    { href: "/admin/pages", label: "Pages de contenu", icon: FileText },
    { href: "/admin/parametres", label: "Paramètres", icon: Settings },
    { href: "/admin/compte", label: "Mon compte", icon: UserRound },
  ],
];

/** Menu « Plus » de l'app mobile (comme Chariow). */
export default function MorePage() {
  const { store } = useCurrentStore();
  const copy = () =>
    navigator.clipboard.writeText(store.url).then(
      () => toast.success("Lien de la boutique copié"),
      () => toast.error("Copie impossible"),
    );
  return (
    <div className="mx-auto max-w-lg">
      <StoreSwitcher className="mb-6" />
      {ITEMS.map((group, i) => (
        <div key={i} className="border-b border-border py-3 last:border-0">
          {group.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex min-h-14 items-center gap-4 rounded-2xl px-2 font-semibold hover:bg-surface">
              <span className="flex size-10 items-center justify-center rounded-xl bg-surface">
                <Icon className="size-5 stroke-[1.6]" />
              </span>
              {label}
            </Link>
          ))}
        </div>
      ))}
      <div className="mt-6 flex h-14 overflow-hidden rounded-2xl bg-[#e9ebe9]">
        <a href={store.url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 text-lg font-semibold">
          <Store className="size-5" /> Ma boutique
        </a>
        <button type="button" onClick={copy} aria-label="Copier le lien" className="flex w-16 items-center justify-center border-l border-[#d6d9d6]">
          <Copy className="size-5" />
        </button>
      </div>
    </div>
  );
}
