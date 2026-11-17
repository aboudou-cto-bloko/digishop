"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis, Plus } from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";

const MORE_PATHS = ["/admin/plus", "/admin/produits", "/admin/clients", "/admin/revenus", "/admin/reductions", "/admin/parametres", "/admin/pages", "/admin/vitrine", "/admin/automatisations", "/admin/compte"];

const isActive = (pathname: string, href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

/**
 * Barre d'onglets mobile façon iOS 26 « Liquid Glass » : pilule de verre flottante, toujours fixée en bas
 * (rendue dans <body> pour qu'aucun conteneur ne casse le position: fixed), qui se compacte quand on défile vers le bas.
 */
export function MobileTabBar({ pathname }: { pathname: string }) {
  const [mounted, setMounted] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portail : rendu seulement après montage
    setMounted(true);
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        // Compacte en descendant (au-delà de 80 px), reprend sa taille en remontant ou en haut de page
        if (y < 80 || y < last - 6) setCompact(false);
        else if (y > last + 6) setCompact(true);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Changement de page : la barre revient en taille normale
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation à la navigation
    setCompact(false);
  }, [pathname]);

  if (!mounted) return null;

  const tabs = [NAV[0], NAV[1], NAV[5], { href: "/admin/plus", label: "Plus", icon: Ellipsis }];

  return createPortal(
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),12px)] lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center gap-2.5">
        <div
          className={cn(
            "glass flex min-w-0 flex-1 items-center justify-around rounded-full px-1.5 transition-[height] duration-300 ease-out motion-reduce:transition-none",
            compact ? "h-14" : "h-[68px]",
          )}
        >
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = href === "/admin/plus" ? MORE_PATHS.some((p) => pathname.startsWith(p)) : isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 font-medium transition-all duration-300 ease-out motion-reduce:transition-none",
                  compact ? "h-11" : "h-[56px]",
                  active ? "bg-white/75 text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12),inset_0_1px_0_rgb(255_255_255/0.9)]" : "text-foreground/70",
                )}
              >
                <Icon className={cn("size-6 stroke-[1.6]", active && "stroke-[2.1]")} />
                <span className={cn("overflow-hidden text-[0.7rem] leading-none transition-all duration-300 motion-reduce:transition-none", compact ? "h-0 opacity-0" : "h-3 opacity-100")}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
        <Link
          href="/admin/produits?nouveau=1"
          aria-label="Ajouter un produit"
          className={cn("glass flex shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-out motion-reduce:transition-none", compact ? "size-14" : "size-[68px]")}
        >
          <span className={cn("flex items-center justify-center rounded-full bg-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] transition-all duration-300", compact ? "size-10" : "size-12")}>
            <Plus className="size-6 stroke-[2.2]" />
          </span>
        </Link>
      </div>
    </nav>,
    document.body,
  );
}
