import { DM_Sans, DM_Serif_Display, Fraunces, Manrope, Outfit, Playfair_Display, Plus_Jakarta_Sans, Poppins, Space_Grotesk } from "next/font/google";

// Polices de la vitrine. preload:false → seule la paire choisie est réellement téléchargée.
const outfit = Outfit({ subsets: ["latin"], variable: "--sf-outfit", preload: false });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--sf-dmserif", preload: false });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--sf-jakarta", preload: false });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--sf-dmsans", preload: false });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--sf-fraunces", preload: false });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sf-poppins", preload: false });
const manrope = Manrope({ subsets: ["latin"], variable: "--sf-manrope", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--sf-playfair", preload: false });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--sf-grotesk", preload: false });

export type FontPair = "moderne" | "net" | "doux" | "rond" | "elegant" | "tech";

export const FONT_PAIRS: Record<FontPair, { label: string; hint: string; body: string; heading: string; classes: string }> = {
  moderne: { label: "Moderne", hint: "Outfit + DM Serif", body: "var(--sf-outfit)", heading: "var(--sf-dmserif)", classes: `${outfit.variable} ${dmSerif.variable}` },
  net: { label: "Net", hint: "Plus Jakarta Sans", body: "var(--sf-jakarta)", heading: "var(--sf-jakarta)", classes: jakarta.variable },
  doux: { label: "Doux", hint: "DM Sans + Fraunces", body: "var(--sf-dmsans)", heading: "var(--sf-fraunces)", classes: `${dmSans.variable} ${fraunces.variable}` },
  rond: { label: "Rond", hint: "Poppins", body: "var(--sf-poppins)", heading: "var(--sf-poppins)", classes: poppins.variable },
  elegant: { label: "Élégant", hint: "Manrope + Playfair", body: "var(--sf-manrope)", heading: "var(--sf-playfair)", classes: `${manrope.variable} ${playfair.variable}` },
  tech: { label: "Tech", hint: "Space Grotesk", body: "var(--sf-grotesk)", heading: "var(--sf-grotesk)", classes: grotesk.variable },
};

/** Classes + variables pour appliquer une paire de polices à un conteneur. */
export function fontStyle(pair: FontPair | undefined) {
  const f = FONT_PAIRS[pair ?? "moderne"] ?? FONT_PAIRS.moderne;
  return {
    className: f.classes,
    // Tailwind (@theme inline) résout font-sans → var(--font-outfit) et font-heading → var(--font-display)
    style: { "--font-outfit": f.body, "--font-display": f.heading, fontFamily: f.body } as Record<string, string>,
  };
}
