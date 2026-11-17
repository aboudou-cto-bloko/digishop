"use client";

import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import { countryName } from "@/lib/geo";
import { usePublicStoreId } from "../store-id";


function ago(ts: number, now: number) {
  const m = Math.round((now - ts) / 60_000);
  if (m < 60) return `il y a ${Math.max(1, m)} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} jour${d > 1 ? "s" : ""}`;
}

/** Notification discrète « X vient d'acheter », basée uniquement sur de vraies ventes. */
export function SocialProof() {
  const storeId = usePublicStoreId();
  const items = useQuery(api.storefront.recentPurchases, storeId ? { storeId } : "skip");
  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(false);
  const [closed, setClosed] = useState(false);
  const [now, setNow] = useState(0);

  // Cycle : 6 s d'attente, 6 s affichée, 8 s cachée, puis la suivante
  useEffect(() => {
    if (!items?.length || closed) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const show = (k: number, delay: number) => {
      timers.push(
        setTimeout(() => {
          setNow(Date.now());
          setI(k % items.length);
          setVisible(true);
          timers.push(setTimeout(() => setVisible(false), 6000));
          show(k + 1, 14000);
        }, delay),
      );
    };
    show(0, 6000);
    return () => timers.forEach(clearTimeout);
  }, [items, closed]);

  const item = items?.[i];
  if (!item || closed || !visible) return null;
  const where = item.country ? countryName(item.country) : null;
  return (
    <div className="fixed bottom-24 left-3 z-40 max-w-[300px] animate-in fade-in slide-in-from-bottom-2 rounded-2xl bg-card p-3 pr-9 text-sm shadow-[0_12px_40px_rgba(0,0,0,0.15)] lg:bottom-5 lg:left-5">
      <button type="button" onClick={() => setClosed(true)} aria-label="Fermer" className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full text-muted-foreground">
        <X className="size-4" />
      </button>
      <p>
        <strong>{item.firstName}</strong>
        {where ? ` (${where})` : ""} vient d&apos;acheter <a href={`/p/${item.slug}`} className="font-semibold underline underline-offset-2">{item.productTitle}</a>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{ago(item.at, now)} · achat vérifié</p>
    </div>
  );
}
