"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Barre de progression en haut de l'écran dès qu'on touche un lien interne : sur mobile (réseau lent),
 * sans ce retour immédiat on croit que le tap n'a pas marché et on retape.
 */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [active, setActive] = useState(false);

  // Navigation terminée : la barre se replie
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fin de navigation détectée via l'URL
    setActive(false);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActive(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]">
      <div className={active ? "h-full animate-[nav-progress_8s_cubic-bezier(.1,.6,.2,1)_forwards] bg-brand" : "h-full w-0 bg-brand opacity-0 transition-opacity duration-300"} />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
