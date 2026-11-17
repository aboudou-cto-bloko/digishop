/** Signature HMAC courte (liens de suivi des emails) : empêche de forger un clic ou une redirection ouverte. */
export async function sign(scope: string, value: string) {
  const secret = process.env.TRACKING_SECRET ?? process.env.UNSUBSCRIBE_SECRET ?? process.env.JWT_PRIVATE_KEY ?? "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${scope}:${value}`));
  return Array.from(new Uint8Array(sig).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparaison à temps constant. */
export function sameSig(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
