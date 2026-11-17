import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function requireAdmin(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Non autorisé");
  return userId;
}

export async function isAdmin(ctx: QueryCtx) {
  return (await getAuthUserId(ctx)) !== null;
}

/** Une boutique sans propriétaire (antérieure au multi-tenant) reste accessible à tout admin jusqu'à rattachement. */
export function canAccessStore(store: Doc<"stores">, userId: Id<"users">): boolean {
  return !store.ownerId || store.ownerId === userId;
}

/** Admin connecté + boutique existante dont il est propriétaire. Toutes les fonctions du dashboard passent par ici. */
export async function requireStore(ctx: QueryCtx, storeId: Id<"stores">): Promise<Doc<"stores">> {
  const userId = await requireAdmin(ctx);
  const store = await ctx.db.get(storeId);
  // Même message qu'une boutique absente : on ne révèle pas l'existence des boutiques des autres
  if (!store || !canAccessStore(store, userId)) throw new ConvexError("Boutique introuvable");
  return store;
}

/** Vérifie qu'un document appartient bien à la boutique courante (anti-mélange entre boutiques). */
export function ownedBy<T extends { storeId: Id<"stores"> }>(doc: T | null, storeId: Id<"stores">, label = "Élément"): T {
  if (!doc || doc.storeId !== storeId) throw new ConvexError(`${label} introuvable dans cette boutique.`);
  return doc;
}
