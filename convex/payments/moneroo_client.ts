// Utilitaires HTTP Moneroo — repris de pixelmart/convex/payments/moneroo_client.ts

export const MONEROO_API_URL = "https://api.moneroo.io/v1";
export const MONEROO_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), MONEROO_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

export function describeFetchError(err: unknown, context: string): string {
  if (err instanceof Error && err.name === "AbortError") {
    return `Moneroo ne répond pas (${context}).`;
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

/** Lecture défensive : Moneroo peut renvoyer du HTML ou un JSON partiel. */
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
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Vérifie la signature webhook (HMAC-SHA256 hex, comparaison à temps constant). */
export async function verifyMonerooSignature(payload: string, signature: string, secret: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (computed.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) mismatch |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}
