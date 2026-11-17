"use client";

import { useQuery } from "convex/react";
import { createContext, use, useContext, type ReactNode } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StoreShell } from "@/components/store/store-shell";

type PreviewCtx = { storeId: Id<"stores">; slug: string };
const Ctx = createContext<PreviewCtx | null>(null);
export const usePreviewStore = () => useContext(Ctx);

/** Aperçu en direct d'une boutique (admin) : brouillon de thème, temps réel. */
export function PreviewShell({ params, children }: { params: Promise<{ store: string }>; children: ReactNode }) {
  const { store: slug } = use(params);
  const stores = useQuery(api.stores.list);
  const store = stores?.find((s) => s.slug === slug);
  const s = useQuery(api.settings.previewSettings, store ? { storeId: store._id } : "skip");
  const pages = useQuery(api.pages.publicList, store ? { storeId: store._id } : "skip");
  if (stores && !store) return <p className="p-10 text-center text-muted-foreground">Boutique introuvable.</p>;
  if (!store || !s || !pages) return <div className="min-h-dvh bg-background" />;
  return (
    <Ctx.Provider value={{ storeId: store._id, slug }}>
      <StoreShell storeId={store._id} settings={s} theme={s.theme} pages={pages} base={`/apercu/${slug}`} preview>
        {children}
      </StoreShell>
    </Ctx.Provider>
  );
}
