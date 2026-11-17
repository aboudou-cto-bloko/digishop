import type { Metadata, Viewport } from "next";
import { Outfit, DM_Serif_Display } from "next/font/google";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { Toaster } from "@/components/ui/sonner";
import { NavProgress } from "@/components/shared/nav-progress";
import { siteUrl } from "@/lib/seo";
import "./globals.css";

const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const display = DM_Serif_Display({ variable: "--font-display", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Boutique", template: "%s" },
  description: "Produits digitaux",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f3f4f3",
  width: "device-width",
  initialScale: 1,
  // Contenu sous l'encoche / la barre d'accueil iOS : les marges sûres (env(safe-area-inset-*)) sont gérées par l'app
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="fr" className={`${outfit.variable} ${display.variable} h-full antialiased`}>
        <body className="min-h-full bg-background">
          <NavProgress />
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <Toaster position="top-center" richColors />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
