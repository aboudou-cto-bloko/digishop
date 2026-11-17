"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus, Settings2, Store } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentStore, type StoreRow } from "@/hooks/use-current-store";
import { cn } from "@/lib/utils";

function StoreLogo({ s, className }: { s: StoreRow; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foreground text-background", className)}>
      {s.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.logoUrl} alt="" className="size-full object-cover" />
      ) : (
        <Store className="size-[18px]" />
      )}
    </span>
  );
}

/** Sélecteur de boutique (sidebar et menu Plus), façon « Mon Espace Digital » de Chariow. */
export function StoreSwitcher({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const { store, stores, select } = useCurrentStore();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Boutique : ${store.name}. Changer de boutique`}
        className={cn(
          "flex h-14 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 text-left transition hover:bg-surface",
          collapsed && "justify-center px-0",
          className,
        )}
      >
        <StoreLogo s={store} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[1.05rem] font-semibold">{store.name}</span>
              {store.status === "paused" && <span className="block text-xs font-medium text-[#92400e]">En pause</span>}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-2xl p-1.5">
        {stores.map((s) => (
          <DropdownMenuItem key={s._id} onClick={() => s._id !== store._id && select(s.slug)} className="min-h-12 gap-3 rounded-xl">
            <StoreLogo s={s} className="size-8 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{s.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.url.replace(/^https?:\/\//, "")}</span>
            </span>
            {s._id === store._id && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/admin/boutiques?nouveau=1" />} className="min-h-11 gap-3 rounded-xl font-semibold">
          <Plus className="size-4" /> Créer une boutique
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/admin/boutiques" />} className="min-h-11 gap-3 rounded-xl">
          <Settings2 className="size-4" /> Gérer les boutiques
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
