"use client";

import { useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { captureAttribution, visitorId } from "@/lib/tracking";
import { initTracking, setTrackingCountry, track } from "@/lib/track";
import { usePublicStoreId, useStoreBase } from "@/components/store/store-id";
import { useVisitor } from "@/components/store/visitor";

/**
 * Mesure d'audience de la boutique : visite du jour (compteurs) + événements détaillés
 * (page vue, fiche produit, profondeur de lecture, temps passé).
 */
export function ViewTracker({ productId }: { productId?: Id<"products"> }) {
  const base = useStoreBase();
  const rawPath = usePathname();
  // En mode chemin (/b/<slug>), on enregistre le chemin de la boutique sans le préfixe
  const pathname = base && rawPath.startsWith(base) ? rawPath.slice(base.length) || "/" : rawPath;
  const trackView = useMutation(api.analytics.trackView);
  const storeId = usePublicStoreId();
  const { country } = useVisitor();
  // Les pages produit ont leur propre tracker (avec productId)
  const active = Boolean(storeId) && (Boolean(productId) || !pathname.startsWith("/p/"));

  useEffect(() => {
    if (storeId) initTracking(storeId, base);
  }, [storeId, base]);
  useEffect(() => setTrackingCountry(country), [country]);

  useEffect(() => {
    if (!active || !storeId) return;
    const attr = captureAttribution();
    let source = attr.utmSource;
    if (!source && attr.referrer) {
      try {
        source = new URL(attr.referrer).hostname;
      } catch {}
    }
    trackView({ storeId, path: pathname, productId, visitorId: visitorId(), source, country }).catch(() => {});
    track("page_view", { path: pathname, productId });
    if (productId) track("product_view", { path: pathname, productId });

    // Profondeur de lecture (25/50/75/90 %), une fois par palier
    const marks = [25, 50, 75, 90];
    const reached = new Set<number>();
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const pct = h <= 0 ? 100 : Math.round((window.scrollY / h) * 100);
      for (const m of marks) {
        if (pct >= m && !reached.has(m)) {
          reached.add(m);
          track("scroll", { path: pathname, productId, props: { depth: m } });
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Temps passé, onglet visible uniquement
    let visibleSince = document.visibilityState === "visible" ? Date.now() : 0;
    let total = 0;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (visibleSince) total += Date.now() - visibleSince;
        visibleSince = 0;
        report();
      } else visibleSince = Date.now();
    };
    const report = () => {
      const seconds = Math.min(1800, Math.round(total / 1000));
      total = 0;
      if (seconds >= 2) track("time_on_page", { path: pathname, productId, props: { seconds } });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      if (visibleSince) total += Date.now() - visibleSince;
      report();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- le pays sert au comptage, pas à relancer la mesure
  }, [active, pathname, productId, trackView, storeId]);
  return null;
}
