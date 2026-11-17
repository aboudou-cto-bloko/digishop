// Bénin : UTC+1 toute l'année (pas d'heure d'été)
export const TZ_OFFSET_MS = 60 * 60 * 1000;

export function dayKey(ts: number = Date.now()): string {
  return new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

export function localHour(ts: number): number {
  return new Date(ts + TZ_OFFSET_MS).getUTCHours();
}

export function slugify(input: string): string {
  // NFKD : ramène aussi les lettres « stylées » (𝗩𝗮𝗶𝗻𝗰𝗿𝗲, ｆｕｌｌｗｉｄｔｈ…) et ligatures à des lettres simples.
  // Adresse limitée à a-z, 0-9 et tirets : toujours valide dans une URL, sans encodage.
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function saleNumber(): string {
  let out = "SALE";
  for (let i = 0; i < 14; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
