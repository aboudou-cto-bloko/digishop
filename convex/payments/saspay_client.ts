// Utilitaires HTTP pour le prestataire d'encaissement/décaissement Cameroun — repris de moneroo_client.ts

export const SASPAY_API_URL = "https://api.saspay.me/api/v1";
export const SASPAY_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), SASPAY_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

export function describeFetchError(err: unknown, context: string): string {
  if (err instanceof Error && err.name === "AbortError") {
    return `Le prestataire CEMAC ne répond pas (${context}).`;
  }
  return err instanceof Error ? err.message : String(err);
}

export function buildAuthHeaders(secretKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secretKey}`,
    Accept: "application/json",
  };
}

/** Lecture défensive : la réponse peut être enveloppée dans {success,data,code} ou plate. */
export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

function get(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function str(obj: unknown, path: string[]): string | undefined {
  const v = get(obj, path);
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function num(obj: unknown, path: string[]): number | undefined {
  const v = get(obj, path);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * Vérifie la signature webhook : HMAC-SHA256 hex de `timestamp + "." + corps brut`, comparaison
 * à temps constant, et rejet si l'horodatage dévie de plus de 5 minutes (anti-replay).
 */
export async function verifySignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string,
  maxSkewSeconds = 300,
): Promise<boolean> {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > maxSkewSeconds) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${timestamp}.${rawBody}`));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

// ── Zones monétaires ──────────────────────────────────────────────────────
// Appartenance CEMAC / CEDEAO : liste des pays membres (UEMOA+CEDEAO élargie / CEMAC),
// quasiment invariante — pas d'API publique pour ça. À distinguer des taux/devises, qui
// restent toujours lus depuis fxRates ou le catalogue réseaux, jamais codés en dur ici.
const CEMAC = new Set(["CM", "TD", "CF", "CG", "GA", "GQ"]);
const CEDEAO = new Set(["BJ", "BF", "CI", "GH", "GN", "GW", "LR", "ML", "NE", "NG", "SN", "SL", "TG", "CV", "GM"]);

export type MonetaryZone = "CEMAC" | "CEDEAO";

export function monetaryZoneOf(country: string | null | undefined): MonetaryZone | null {
  if (!country) return null;
  const c = country.toUpperCase();
  if (CEMAC.has(c)) return "CEMAC";
  if (CEDEAO.has(c)) return "CEDEAO";
  return null;
}

export function zoneLabel(zone: MonetaryZone | null): string {
  if (zone === "CEMAC") return "Zone CEMAC (XAF)";
  if (zone === "CEDEAO") return "Zone CEDEAO (XOF)";
  return "Hors zone";
}

/**
 * Catalogue des réseaux mobile money couverts, repris de la documentation (pas d'endpoint de
 * synchronisation documenté). Seuls les pays CEMAC y passent par ce prestataire pour l'instant ;
 * les pays CEDEAO restent sur Moneroo. À étendre ici si d'autres pays CEMAC sont activés côté API.
 */
export const SASPAY_NETWORKS: Record<string, { name: string; country: string; currency: string }> = {
  mtn_cm: { name: "MTN Mobile Money Cameroun", country: "CM", currency: "XAF" },
  orange_cm: { name: "Orange Money Cameroun", country: "CM", currency: "XAF" },
};

export function isSaspayMethod(code: string): boolean {
  return code in SASPAY_NETWORKS;
}
