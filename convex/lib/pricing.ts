// Prix effectif d'un produit (promo programmée par le vendeur). Partagé serveur + boutique.

export type Promo = { price: number; startsAt?: number; endsAt: number; label?: string; showCountdown: boolean };

export function activePromo(p: { price: number; promo?: Promo | null }, now: number): Promo | null {
  const promo = p.promo;
  if (!promo) return null;
  if (promo.endsAt <= now) return null;
  if (promo.startsAt !== undefined && promo.startsAt > now) return null;
  if (promo.price >= p.price) return null;
  return promo;
}

/** Prix à payer + prix barré à afficher. */
export function effectivePrice(p: { price: number; compareAtPrice?: number; promo?: Promo | null }, now: number) {
  const promo = activePromo(p, now);
  if (promo) {
    return { price: promo.price, compareAt: Math.max(p.price, p.compareAtPrice ?? 0), promo };
  }
  return { price: p.price, compareAt: p.compareAtPrice && p.compareAtPrice > p.price ? p.compareAtPrice : undefined, promo: null };
}
