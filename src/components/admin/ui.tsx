"use client";

import { CircleCheck, CircleX, Circle, Clock, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHideAmounts } from "@/hooks/use-hide-amounts";
import { fcfa } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SaleStatus = "pending" | "paid" | "failed" | "abandoned";

/** Montant qui respecte le bouton « masquer les montants ». */
export function Money({ value, className }: { value: number; className?: string }) {
  const { hidden } = useHideAmounts();
  return <span className={cn("tabular", className)}>{hidden ? "••••• F CFA" : fcfa(value)}</span>;
}

/** Carte KPI façon Chariow : grand chiffre gras, libellé gris, ⓘ à droite. */
export function StatCard({
  icon,
  value,
  label,
  hint,
  delta,
  className,
  tone = "muted",
}: {
  icon?: ReactNode;
  value: ReactNode;
  label: string;
  hint?: string;
  delta?: number | null;
  className?: string;
  tone?: "muted" | "white" | "yellow" | "green";
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl p-5 sm:p-6",
        tone === "muted" && "bg-surface",
        tone === "white" && "bg-card",
        tone === "yellow" && "bg-[#fdf7c3]",
        tone === "green" && "bg-[#e3f9e8]",
        className,
      )}
    >
      {icon && <div className="mb-4 text-muted-foreground [&_svg]:size-6 [&_svg]:stroke-[1.5]">{icon}</div>}
      <div className="text-[1.75rem] font-bold leading-tight tracking-tight sm:text-[2rem]">{value}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[0.95rem] font-medium text-muted-foreground">
          {label}
          {typeof delta === "number" && Number.isFinite(delta) && <Delta value={delta} />}
        </span>
        {hint && (
          <Tooltip>
            <TooltipTrigger
              className="-m-2 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              aria-label={`À propos : ${label}`}
            >
              <Info className="size-[18px] stroke-[1.6]" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-sm">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function Delta({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span
      className={cn(
        "ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 align-middle text-xs font-semibold",
        up ? "bg-[var(--success-bg)] text-[var(--success-fg)]" : "bg-[#fde2e2] text-[#991b1b]",
      )}
      title="Par rapport à la période précédente"
    >
      {up ? "↑" : "↓"} {Math.abs(Math.round(value * 100))} %
    </span>
  );
}

const STATUS: Record<SaleStatus, { label: string; cls: string; icon: ReactNode }> = {
  paid: {
    label: "Réglé",
    cls: "bg-[var(--success-bg)] text-[var(--success-fg)]",
    icon: <CircleCheck className="size-[18px] stroke-[1.8]" />,
  },
  pending: {
    label: "En attente",
    cls: "bg-[var(--warning-bg)] text-[var(--warning-fg)]",
    icon: <Clock className="size-[18px] stroke-[1.8]" />,
  },
  failed: {
    label: "Échoué",
    cls: "bg-[var(--danger-bg)] text-[var(--danger-fg)]",
    icon: <CircleX className="size-[18px] stroke-[1.8]" />,
  },
  abandoned: {
    label: "Abandonné",
    cls: "bg-[var(--neutral-bg)] text-[var(--neutral-fg)]",
    icon: <Circle className="size-[18px] stroke-[1.8]" />,
  },
};

/** Badge de statut : couleur + icône + libellé (jamais la couleur seule). */
export function StatusBadge({ status, className }: { status: SaleStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold", s.cls, className)}>
      {s.icon}
      {s.label}
    </span>
  );
}

export function PublishBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--success-bg)] px-2.5 py-1 text-sm font-semibold text-[var(--success-fg)]">
      <CircleCheck className="size-3.5" /> Publié
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--neutral-bg)] px-2.5 py-1 text-sm font-semibold text-[var(--neutral-fg)]">
      <Circle className="size-3.5" /> Brouillon
    </span>
  );
}

/** Pastilles de filtre avec point coloré (Tout / Brouillon / Publié…). */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; dot: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[0.95rem] font-medium transition sm:h-10",
              active ? "bg-[#e3e5e3] text-foreground" : "bg-surface text-foreground/80 hover:bg-[#eceeec]",
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: o.dot }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Rechercher",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex h-12 items-center gap-3 rounded-2xl bg-surface px-4 focus-within:ring-2 focus-within:ring-foreground/10 sm:h-11 sm:rounded-xl sm:border sm:border-border sm:bg-card">
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-[0.95rem]"
        type="search"
      />
    </label>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface text-muted-foreground [&_svg]:size-7 [&_svg]:stroke-[1.5]">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-[0.95rem] text-muted-foreground">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionTitle({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border pb-4 pt-2 [&_svg]:size-6 [&_svg]:stroke-[1.5]">
      {icon}
      <h3 className="text-[1.02rem] font-semibold">{children}</h3>
    </div>
  );
}

/** Ligne libellé / valeur des panneaux de détail (Prix, Réduction, Montant net…). */
export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2.5">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-3xl border border-border bg-card px-5 py-2", className)}>{children}</div>;
}

export function Thumb({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn("size-14 shrink-0 rounded-lg object-cover", className)} loading="lazy" />
  ) : (
    <div className={cn("flex size-14 shrink-0 items-center justify-center rounded-lg bg-surface text-xs text-muted-foreground", className)}>
      PDF
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#e9ebe9] text-sm font-semibold", className)}>
      {letters || "?"}
    </span>
  );
}
