"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Barre d'achat fixée en bas sur mobile. Elle n'apparaît que lorsque le bouton d'achat principal
 * (repère `anchorId`) est sorti de l'écran par le haut : jamais deux boutons d'achat visibles en même temps.
 */
export function MobileBuyBar({ anchorId, children }: { anchorId: string; children: ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Visible seulement si le bouton principal est passé AU-DESSUS de l'écran (pas encore atteint = on le verra en descendant)
        setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    io.observe(anchor);
    return () => io.disconnect();
  }, [anchorId]);

  return (
    <div
      aria-hidden={!show}
      inert={!show}
      className={cn(
        "glass-bar pb-safe fixed inset-x-0 bottom-0 z-30 px-4 pt-3 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none lg:hidden",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0",
      )}
    >
      <div className="mb-3 flex items-center gap-3">{children}</div>
    </div>
  );
}
