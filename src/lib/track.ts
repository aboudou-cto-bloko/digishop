"use client";

import { captureAttribution, visitorId } from "./tracking";

/**
 * Tracking maison (sans outil tiers) : événements mis en file puis envoyés par lots à Convex (/t/e)
 * via navigator.sendBeacon. Pseudonyme : identifiant visiteur aléatoire, aucune valeur saisie, pas d'IP stockée.
 */

export type TrackType =
  | "page_view"
  | "product_view"
  | "scroll"
  | "time_on_page"
  | "preview_open"
  | "share"
  | "contact"
  | "checkout_open"
  | "checkout_field"
  | "bump_toggle"
  | "coupon_apply"
  | "payment_start"
  | "checkout_error";

export type CheckoutError = "invalid_name" | "invalid_email" | "invalid_phone" | "country_blocked" | "store_closed" | "out_of_stock" | "server";

type Props = { field?: "name" | "email" | "phone" | "promo" | "currency"; depth?: number; seconds?: number; file?: string; on?: boolean; ok?: boolean; error?: CheckoutError };
type QueuedEvent = { type: TrackType; path: string; productId?: string; props?: Props; at: number };

const ENDPOINT = `${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "").replace(/\/$/, "")}/t/e`;
const SESSION_KEY = "ds_sess";
const SEEN_KEY = "ds_seen";
const SESSION_IDLE_MS = 30 * 60_000;

let config: { storeId: string; base: string } | null = null;
let country: string | undefined;
const queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let isNewVisitor: boolean | null = null;

const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join("");

/** Session = visite : renouvelée après 30 min d'inactivité. */
export function sessionKey(): string {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as { key: string; last: number }) : null;
    const key = s && now - s.last < SESSION_IDLE_MS && /^[a-z0-9]{12,40}$/.test(s.key) ? s.key : rand();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ key, last: now }));
    return key;
  } catch {
    return (window as unknown as { __dsKey?: string }).__dsKey ??= rand();
  }
}

function newVisitor() {
  if (isNewVisitor !== null) return isNewVisitor;
  try {
    isNewVisitor = !localStorage.getItem(SEEN_KEY);
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    isNewVisitor = true;
  }
  return isNewVisitor;
}

export function initTracking(storeId: string, base: string) {
  config = { storeId, base };
  newVisitor();
  sessionLanding(); // page d'arrivée = première page vue de la visite
}

// Étapes clés : envoyées tout de suite (une redirection vers le paiement peut suivre immédiatement)
const URGENT = new Set<TrackType>(["page_view", "preview_open", "checkout_open", "payment_start", "checkout_error", "share", "contact"]);

export function setTrackingCountry(c: string | undefined) {
  country = c;
}

/** Chemin de la boutique, sans le préfixe /b/<slug> du mode chemin. */
export function storePath(pathname = window.location.pathname) {
  const base = config?.base ?? "";
  return base && pathname.startsWith(base) ? pathname.slice(base.length) || "/" : pathname;
}

export function track(type: TrackType, opts: { productId?: string; props?: Props; path?: string } = {}) {
  if (!config || typeof window === "undefined" || !ENDPOINT.startsWith("http")) return;
  queue.push({ type, path: (opts.path ?? storePath()).slice(0, 200), productId: opts.productId, props: opts.props, at: Date.now() });
  if (queue.length >= 40) flush();
  else if (URGENT.has(type)) {
    // Micro-lot : les événements émis dans la même fraction de seconde (page + fiche produit) partent ensemble
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 250);
  } else if (!timer) timer = setTimeout(flush, 4000);
}

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!config || !queue.length) return;
  const events = queue.splice(0, 50);
  const attr = captureAttribution();
  const body = JSON.stringify({
    storeId: config.storeId,
    key: sessionKey(),
    visitorId: visitorId(),
    isNew: newVisitor(),
    landing: (sessionLanding() ?? storePath()).slice(0, 200),
    referrer: attr.referrer?.slice(0, 300),
    source: attr.utmSource?.slice(0, 60),
    campaign: attr.utmCampaign?.slice(0, 80),
    country: country && /^[A-Z]{2}$/.test(country) ? country : undefined,
    events,
  });
  try {
    // text/plain : pas de pré-vol CORS, et le navigateur l'envoie même si la page se ferme
    const ok = navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "text/plain" }));
    if (!ok) void fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
  } catch {
    /* le suivi ne doit jamais casser la boutique */
  }
  if (queue.length) timer = setTimeout(flush, 1000);
}

function sessionLanding() {
  try {
    // Liée à la clé de session : une nouvelle visite (30 min d'inactivité) repart d'une nouvelle page d'arrivée
    const key = sessionKey();
    const raw = sessionStorage.getItem("ds_landing");
    const saved = raw ? (JSON.parse(raw) as { key: string; path: string }) : null;
    if (saved?.key === key) return saved.path;
    const path = storePath();
    sessionStorage.setItem("ds_landing", JSON.stringify({ key, path }));
    return path;
  } catch {
    return undefined;
  }
}

if (typeof window !== "undefined") {
  const onHide = () => document.visibilityState === "hidden" && flush();
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
}
