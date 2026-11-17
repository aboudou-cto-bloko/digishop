import type { Id } from "../_generated/dataModel";

/** Page de livraison, sur le domaine de la boutique de la vente. Commune à tous les prestataires. */
export function thankYouUrl(baseUrl: string, saleId: Id<"sales">, accessKey: string) {
  return `${baseUrl.replace(/\/$/, "")}/merci/${saleId}?k=${accessKey}`;
}
