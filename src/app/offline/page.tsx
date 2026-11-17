import type { Metadata } from "next";
import { LogoMark } from "@/components/shared/logo";
import { ReloadButton } from "./reload-button";

export const metadata: Metadata = { title: "Hors connexion", robots: { index: false } };
export const dynamic = "force-static";

/** Page servie par le service worker quand le dashboard est ouvert sans réseau. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <LogoMark className="size-14" />
      <h1 className="text-2xl font-bold">Pas de connexion</h1>
      <p className="max-w-sm text-muted-foreground">Tes ventes continuent d&apos;être enregistrées. Reconnecte-toi pour les voir ; tu recevras quand même les notifications.</p>
      <ReloadButton />
    </main>
  );
}
