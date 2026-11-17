/** Seules les images de NOTRE stockage Convex sont acceptées dans les contenus riches (pas de pixel espion externe). */
export function isOwnImage(src: string | null | undefined): boolean {
  const base = (process.env.NEXT_PUBLIC_CONVEX_URL ?? "").replace(/\/$/, "");
  if (!src || !base) return false;
  return src.startsWith(`${base}/api/storage/`) && !/["'<>\s]/.test(src);
}

/** Dimension d'image saine (attribut width/height), sinon null. */
export function safeDim(value: string | null | undefined): string | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 10_000 ? String(n) : null;
}
