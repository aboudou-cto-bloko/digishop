import countries from "world-countries";

// Coordonnées des pays tirées de la bibliothèque world-countries (rien de codé en dur)
const BY_CODE = new Map(countries.map((c) => [c.cca2, c.latlng as [number, number]]));

/** [latitude, longitude] approximatives du pays (centre), ou null si inconnu. */
export function centroid(code: string): [number, number] | null {
  return BY_CODE.get(code.toUpperCase()) ?? null;
}
