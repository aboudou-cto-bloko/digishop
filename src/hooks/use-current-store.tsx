"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type StoreRow = FunctionReturnType<typeof api.stores.list>[number];

type Ctx = { store: StoreRow; stores: StoreRow[]; select: (slug: string, goTo?: string) => void };
const StoreCtx = createContext<Ctx | null>(null);
const KEY = "ds_current_store";

/**
 * Boutique courante du dashboard. Priorité : ?boutique=slug (liens des emails) > dernier choix (localStorage) > 1re boutique.
 * Les enfants ne sont rendus qu'une fois la boutique connue : useStoreId() est donc toujours défini.
 */
export function CurrentStoreProvider({ children, fallback, empty }: { children: ReactNode; fallback: ReactNode; empty: ReactNode }) {
  const stores = useQuery(api.stores.list);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    const fromUrl = params.get("boutique");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture après hydratation (URL / localStorage)
    setSlug(fromUrl ?? saved);
    if (fromUrl) {
      try {
        localStorage.setItem(KEY, fromUrl);
      } catch {}
    }
  }, [params]);

  const select = useCallback(
    (next: string, goTo?: string) => {
      setSlug(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {}
      // On revient à l'accueil de la boutique choisie (les pages de détail n'existent pas dans l'autre boutique)
      router.push(goTo ?? (pathname.startsWith("/admin/boutiques") ? pathname : "/admin"));
    },
    [router, pathname],
  );

  const value = useMemo<Ctx | null>(() => {
    if (!stores?.length) return null;
    const store = stores.find((s) => s.slug === slug) ?? stores[0];
    return { store, stores, select };
  }, [stores, slug, select]);

  if (stores && stores.length === 0) return <>{empty}</>;
  if (!value) return <>{fallback}</>;
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useCurrentStore(): Ctx {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useCurrentStore hors de CurrentStoreProvider");
  return ctx;
}

export function useStoreId(): Id<"stores"> {
  return useCurrentStore().store._id;
}

// ── Hooks Convex « scopés » : injectent automatiquement storeId ──────────

type WithStore = { storeId: Id<"stores"> };
type Without<R extends FunctionReference<"query" | "mutation" | "action">> = Omit<FunctionArgs<R>, "storeId">;

export function useStoreQuery<Q extends FunctionReference<"query">>(ref: Q, args: Without<Q> | "skip"): FunctionReturnType<Q> | undefined {
  const storeId = useStoreId();
  return useQuery(ref, (args === "skip" ? "skip" : { ...args, storeId }) as FunctionArgs<Q> & WithStore);
}

export function useStoreMutation<M extends FunctionReference<"mutation">>(ref: M) {
  const storeId = useStoreId();
  const mutate = useMutation(ref);
  return useCallback((args: Without<M>) => mutate({ ...args, storeId } as FunctionArgs<M>), [mutate, storeId]);
}

export function useStoreAction<A extends FunctionReference<"action">>(ref: A) {
  const storeId = useStoreId();
  const run = useAction(ref);
  return useCallback((args: Without<A>) => run({ ...args, storeId } as FunctionArgs<A>), [run, storeId]);
}
