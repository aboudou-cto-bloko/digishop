const nf = new Intl.NumberFormat("fr-FR");

/** 2500 → "2 500 F CFA" (espace normale, comme Chariow) */
export function fcfa(n: number): string {
  return `${nf.format(n).replace(/[  ]/g, " ")} F CFA`;
}

export function num(n: number): string {
  return nf.format(n).replace(/[  ]/g, " ");
}

export function pct(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits).replace(".", ",").replace(/,0$/, "")} %`;
}

const dateLong = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Porto-Novo" });
const dateTime = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Porto-Novo",
});

export const fmtDate = (ts: number) => dateLong.format(ts);
export const fmtDateTime = (ts: number) => dateTime.format(ts);

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1).replace(".", ",")} Mo`;
  return `${(bytes / 1024 ** 3).toFixed(2).replace(".", ",")} Go`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function waLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data: unknown }).data;
    if (typeof data === "string") return data;
  }
  if (err instanceof Error) {
    const m = err.message.match(/Uncaught (?:ConvexError|Error): (.+?)(?:\n|$)/);
    return m?.[1] ?? "Une erreur est survenue. Réessaie.";
  }
  return "Une erreur est survenue. Réessaie.";
}
