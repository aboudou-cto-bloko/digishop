import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type PublicProduct = FunctionReturnType<typeof api.products.listPublished>[number];
export type PublicSettings = FunctionReturnType<typeof api.settings.publicSettings>;
export type StoreTheme = PublicSettings["theme"];

export type LayoutProps = {
  settings: Pick<PublicSettings, "storeName" | "tagline" | "logoUrl" | "whatsapp">;
  theme: Pick<StoreTheme, "layout" | "coverUrl" | "coverTitle" | "coverSubtitle" | "featuredProductId">;
  products: PublicProduct[];
  now: number;
  /** Aperçu admin : liens de paiement désactivés */
  preview?: boolean;
  /** Préfixe des liens (« /apercu » dans l'aperçu) */
  base?: string;
};
