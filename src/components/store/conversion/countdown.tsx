"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

/** Compte à rebours réel vers la date de fin choisie par le vendeur (jamais réinitialisé). */
export function Countdown({ endsAt, label }: { endsAt: number; label?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <div className="h-[72px]" aria-hidden />;
  const left = Math.max(0, endsAt - now);
  if (left === 0) return null;
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  const cells = [
    ...(d > 0 ? [{ v: d, l: d > 1 ? "jours" : "jour" }] : []),
    { v: h, l: "h" },
    { v: m, l: "min" },
    { v: s, l: "s" },
  ];
  return (
    <div className="rounded-2xl bg-foreground p-3.5 text-background" role="timer" aria-live="off">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Timer className="size-4 text-brand" /> {label || "Offre limitée"} · se termine dans
      </div>
      <div className="flex gap-2">
        {cells.map((c) => (
          <div key={c.l} className="min-w-14 flex-1 rounded-xl bg-background/10 py-1.5 text-center">
            <div className="text-xl font-bold tabular leading-tight">{String(c.v).padStart(2, "0")}</div>
            <div className="text-[0.7rem] uppercase tracking-wide text-background/70">{c.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
