/** Couleurs de la vitrine : contraste WCAG et couleur de texte automatique sur l'accent. */

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function isHex(hex: string): boolean {
  return parseHex(hex) !== null;
}

function luminance([r, g, b]: [number, number, number]) {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [l1, l2] = [luminance(ca), luminance(cb)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Texte lisible sur l'accent : noir ou blanc, celui qui contraste le mieux. */
export function onColor(bg: string): string {
  return contrast(bg, "#141414") >= contrast(bg, "#ffffff") ? "#141414" : "#ffffff";
}

export function shade(hex: string, amount: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? x * (1 + amount) : x + (255 - x) * amount)));
  return `#${c.map((x) => f(x).toString(16).padStart(2, "0")).join("")}`;
}

export const ACCENT_PRESETS = [
  { name: "Soleil", value: "#f8cb3c" },
  { name: "Mangue", value: "#f97316" },
  { name: "Corail", value: "#ef4444" },
  { name: "Framboise", value: "#db2777" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Océan", value: "#0284c7" },
  { name: "Forêt", value: "#15803d" },
  { name: "Encre", value: "#141414" },
] as const;

export const BACKGROUND_PRESETS = [
  { name: "Gris doux", value: "#f3f4f3" },
  { name: "Blanc", value: "#ffffff" },
  { name: "Crème", value: "#faf6ef" },
  { name: "Ciel", value: "#f1f5f9" },
  { name: "Rosé", value: "#fdf2f4" },
] as const;

export type ThemeLike = { accent: string; background: string };

/** Variables CSS appliquées au conteneur de la boutique. */
export function themeVars(t: ThemeLike): Record<string, string> {
  const accent = isHex(t.accent) ? t.accent : "#f8cb3c";
  const bg = isHex(t.background) ? t.background : "#f3f4f3";
  return {
    "--brand": accent,
    "--brand-hover": shade(accent, -0.08),
    "--brand-foreground": onColor(accent),
    "--background": bg,
    "--surface": shade(bg, bg.toLowerCase() === "#ffffff" ? -0.035 : -0.02),
  };
}
