// Palette identique à la boutique (Chariow-like) — valeurs en dur : les clients mail ignorent les variables CSS.
export const c = {
  bg: "#f3f4f3",
  card: "#ffffff",
  ink: "#141414",
  text: "#3f433f",
  muted: "#7a7f7a",
  border: "#e6e8e6",
  surface: "#f4f5f4",
  brand: "#f8cb3c",
  successBg: "#dcfce7",
  successFg: "#166534",
  whatsapp: "#25d366",
};

export const font = "'Outfit', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const nf = new Intl.NumberFormat("fr-FR");
export const fcfa = (n: number) => `${nf.format(n).replace(/[  ]/g, " ")} F CFA`;

export const dateTime = (ts: number) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Porto-Novo" }).format(ts);

export function fileSize(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} Mo`;
  return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} Go`;
}

export const waLink = (phone: string, text?: string) =>
  `https://wa.me/${phone.replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
