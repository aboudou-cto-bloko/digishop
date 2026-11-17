import { cn } from "@/lib/utils";

/** Icône de la plateforme (public/brand/icon.png, fond transparent). */
export function LogoMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/icon.png" alt="" aria-hidden width={64} height={64} decoding="async" className={cn("size-7 shrink-0 object-contain", className)} />
  );
}

export function Logo({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-[1.35rem] leading-none">{name}</span>
    </span>
  );
}
