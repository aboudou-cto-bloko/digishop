import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { LogoMark } from "@/components/shared/logo";
import { themeVars } from "@/lib/color";
import { waLink } from "@/lib/format";
import { fontStyle } from "@/lib/store-fonts";
import { cn } from "@/lib/utils";
import { CountryBadge } from "./country-badge";
import { PaymentLogos } from "./payment-logos";
import { SocialProof } from "./conversion/social-proof";
import type { PublicSettings } from "./types";
import { VisitorProvider } from "./visitor";
import { StoreIdProvider } from "./store-id";
import type { Id } from "../../../convex/_generated/dataModel";
import { BRAND } from "../../../convex/lib/brand";
import { WhatsAppIcon } from "@/components/shared/whatsapp-icon";

/**
 * Cadre commun de la boutique : thème (couleurs + police), en-tête, pied de page, contexte visiteur.
 * Utilisé tel quel par la boutique publique et par l'aperçu en direct du dashboard.
 */
export function StoreShell({
  storeId,
  settings,
  theme,
  pages,
  initialCountry,
  base = "",
  preview,
  children,
}: {
  storeId: Id<"stores">;
  settings: Pick<PublicSettings, "storeName" | "logoUrl" | "whatsapp" | "currencies" | "countries" | "socialProofPopup">;
  theme: { accent: string; background: string; font: PublicSettings["theme"]["font"] };
  pages: { slug: string; title: string }[];
  initialCountry?: string;
  base?: string;
  preview?: boolean;
  children: ReactNode;
}) {
  const font = fontStyle(theme.font);
  const href = (path: string) => (preview ? undefined : `${base}${path}`);
  return (
    <StoreIdProvider storeId={storeId} base={base}>
    <VisitorProvider initialCountry={initialCountry} acceptedCurrencies={settings.currencies} coverage={settings.countries}>
      <div className={cn("flex min-h-dvh flex-col bg-background font-sans text-foreground", font.className)} style={{ ...themeVars(theme), ...font.style }}>
        <header className="sticky top-0 z-20 bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
            <Link href={`${base}/`} className="flex min-w-0 flex-1 items-center gap-2.5">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={settings.logoUrl} alt="" className="size-9 shrink-0 rounded-xl object-cover" />
              ) : (
                <LogoMark className="size-8 shrink-0" />
              )}
              <span className="truncate text-lg font-semibold">{settings.storeName}</span>
            </Link>
            <CountryBadge />
            {settings.whatsapp && (
              <a
                href={preview ? undefined : waLink(settings.whatsapp, "Bonjour, j'ai une question sur un produit.")}
                target="_blank"
                rel="noreferrer"
                aria-label="Poser une question sur WhatsApp"
                className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-card px-3.5 text-sm font-semibold sm:px-4"
              >
                <WhatsAppIcon className="size-[18px]" />
                <span className="hidden sm:inline">Une question ?</span>
                <span className="sm:hidden">Aide</span>
              </a>
            )}
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="mt-16 border-t border-border">
          <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-sm text-muted-foreground">
            <div className="space-y-3">
              <p className="flex items-center gap-2 font-semibold text-foreground/80">
                <Lock className="size-4" /> Paiement sécurisé par Mobile Money et carte bancaire
              </p>
              <PaymentLogos />
            </div>
            {pages.length > 0 && (
              <nav aria-label="Informations légales" className="flex flex-wrap gap-x-5 gap-y-1">
                {pages.map((p) => (
                  <a key={p.slug} href={href(`/pages/${p.slug}`)} className="inline-flex min-h-11 items-center font-medium text-foreground/75 hover:text-foreground">
                    {p.title}
                  </a>
                ))}
              </nav>
            )}
            <div className="space-y-1">
              <p>
                © {new Date().getFullYear()} {settings.storeName} · Boutique propulsée par {BRAND.name}
              </p>
              <p className="text-xs">{BRAND.disclaimer}</p>
            </div>
          </div>
        </footer>
        {settings.socialProofPopup && !preview && <SocialProof />}
      </div>
    </VisitorProvider>
    </StoreIdProvider>
  );
}
