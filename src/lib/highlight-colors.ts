/** Couleurs de surlignage proposées dans l'éditeur : seules valeurs acceptées par les deux nettoyeurs. */
export const HIGHLIGHT_COLORS = [
  { value: "#fdf0b0", label: "Jaune" },
  { value: "#d3f5d8", label: "Vert" },
  { value: "#d6e8ff", label: "Bleu" },
  { value: "#ffd9e6", label: "Rose" },
  { value: "#ffe1c7", label: "Orange" },
  { value: "#e6dcff", label: "Violet" },
] as const;

const ALLOWED = new Set<string>(HIGHLIGHT_COLORS.map((c) => c.value));

/** Couleur de surlignage autorisée (minuscule), sinon null. */
export function safeHighlight(color: string | null | undefined): string | null {
  const c = color?.trim().toLowerCase();
  return c && ALLOWED.has(c) ? c : null;
}
