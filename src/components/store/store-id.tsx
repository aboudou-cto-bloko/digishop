"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

type Ctx = { storeId: Id<"stores">; base: string };
const StoreCtx = createContext<Ctx | null>(null);

/** Boutique courante côté navigateur (vitrine et aperçu) + préfixe des liens ("" ou "/b/<slug>"). */
export function StoreIdProvider({ storeId, base = "", children }: { storeId: Id<"stores">; base?: string; children: ReactNode }) {
  return <StoreCtx.Provider value={{ storeId, base }}>{children}</StoreCtx.Provider>;
}

export function usePublicStoreId(): Id<"stores"> | null {
  return useContext(StoreCtx)?.storeId ?? null;
}

/** Préfixe à ajouter devant les liens internes de la boutique. */
export function useStoreBase(): string {
  return useContext(StoreCtx)?.base ?? "";
}
