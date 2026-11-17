import Link from "next/link";
import type { ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lien de boutique. Dans l'aperçu admin (preview), la navigation reste possible (préfixe /apercu),
 * seuls les liens vers le paiement sont désactivés pour ne pas créer de vraies ventes.
 */
export function StoreLink({ href, preview, base = "", className, children }: { href: string; preview?: boolean; base?: string; className?: string; children: ReactNode }) {
  if (preview && href.startsWith("/checkout")) return <span className={className} title="Désactivé dans l'aperçu">{children}</span>;
  href = `${base}${href}`;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** Image de vitrine : alt descriptif (SEO + accessibilité), priorité de chargement pour la 1re image visible. */
export function Cover({ src, alt = "", priority, className }: { src: string | null | undefined; alt?: string; priority?: boolean; className?: string }) {
  if (!src)
    return (
      <div className={cn(className, "flex items-center justify-center bg-surface text-foreground/25")} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        <ImageOff className="size-10 stroke-[1.3]" aria-hidden />
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />
  );
}

export function EmptyStore() {
  return <div className="rounded-3xl bg-card p-10 text-center text-muted-foreground">La boutique ouvre très bientôt.</div>;
}
