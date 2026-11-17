"use client";

/** Identifiant visiteur anonyme (analytics maison) + attribution first-touch (UTM / referrer). */

const VID = "ds_vid";
const ATTR = "ds_attr";

export function visitorId(): string {
  try {
    let id = localStorage.getItem(VID);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(VID, id);
    }
    return id;
  } catch {
    return "anon" + Math.random().toString(36).slice(2, 12);
  }
}

export type Attribution = { utmSource?: string; utmCampaign?: string; referrer?: string; fbclid?: string };

/** À appeler à chaque page : garde la première source de la session. */
export function captureAttribution(): Attribution {
  try {
    const existing = sessionStorage.getItem(ATTR);
    if (existing) return JSON.parse(existing) as Attribution;
    const url = new URL(window.location.href);
    const ref = document.referrer && !document.referrer.startsWith(window.location.origin) ? document.referrer : undefined;
    const attr: Attribution = {
      utmSource: url.searchParams.get("utm_source") ?? (url.searchParams.get("fbclid") ? "facebook" : undefined) ?? undefined,
      utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
      referrer: ref,
      fbclid: url.searchParams.get("fbclid") ?? undefined,
    };
    sessionStorage.setItem(ATTR, JSON.stringify(attr));
    return attr;
  } catch {
    return {};
  }
}

function cookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];
}

/** Cookies Meta pour l'API Conversions (meilleur taux de correspondance). */
export function metaCookies(attr: Attribution): { fbp?: string; fbc?: string } {
  const fbp = cookie("_fbp");
  let fbc = cookie("_fbc");
  if (!fbc && attr.fbclid) fbc = `fb.1.${Date.now()}.${attr.fbclid}`;
  return { fbp, fbc };
}

export function deviceLabel(ua: string): string {
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ipod/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Autre";
  const kind = /mobi|android|iphone/i.test(ua) ? "Mobile" : "Ordinateur";
  return `${kind} · ${os}`;
}

// ── Pixels navigateur ────────────────────────────────────────────────────

type Fbq = (...args: unknown[]) => void;
type Ttq = { track: (event: string, data?: Record<string, unknown>, opts?: Record<string, unknown>) => void; page: () => void };

export function fbTrack(event: string, data?: Record<string, unknown>, eventId?: string) {
  const fbq = (window as unknown as { fbq?: Fbq }).fbq;
  if (!fbq) return;
  fbq("track", event, data ?? {}, eventId ? { eventID: eventId } : undefined);
}

export function ttTrack(event: string, data?: Record<string, unknown>, eventId?: string) {
  const ttq = (window as unknown as { ttq?: Ttq }).ttq;
  if (!ttq) return;
  ttq.track(event, data, eventId ? { event_id: eventId } : undefined);
}

export function newEventId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
