import { v } from "convex/values";

// ── Vitrine ─────────────────────────────────────────────────────────────
export const LAYOUTS = ["grid", "editorial", "spotlight"] as const;
export const FONT_PAIRS = ["moderne", "net", "doux", "rond", "elegant", "tech"] as const;

export const themeV = v.object({
  layout: v.union(v.literal("grid"), v.literal("editorial"), v.literal("spotlight")),
  accent: v.string(),
  background: v.string(),
  font: v.union(...FONT_PAIRS.map((f) => v.literal(f))),
  coverId: v.optional(v.id("_storage")),
  coverTitle: v.optional(v.string()),
  coverSubtitle: v.optional(v.string()),
  featuredProductId: v.optional(v.id("products")),
});

// ── Relance des paniers abandonnés ──────────────────────────────────────
export const recoveryPromoV = v.union(
  v.object({ kind: v.literal("none") }),
  v.object({ kind: v.literal("existing"), couponId: v.id("coupons") }),
  v.object({
    kind: v.literal("unique"),
    type: v.union(v.literal("percent"), v.literal("fixed")),
    value: v.number(),
    validHours: v.number(),
  }),
);

export const recoveryStepV = v.object({
  id: v.string(),
  enabled: v.boolean(),
  delay: v.number(),
  unit: v.union(v.literal("minutes"), v.literal("hours"), v.literal("days")),
  subject: v.string(),
  message: v.string(),
  promo: recoveryPromoV,
});

export const recoveryV = v.object({
  enabled: v.boolean(),
  maxAgeDays: v.number(),
  steps: v.array(recoveryStepV),
});

// ── Retraits ────────────────────────────────────────────────────────────
export const payoutDestinationV = v.object({
  id: v.string(),
  label: v.string(),
  method: v.string(), // mtn_bj, moov_bj…
  msisdn: v.string(), // 229XXXXXXXXXX
});

// ── Conversion (produit) ────────────────────────────────────────────────
export const testimonialV = v.object({
  id: v.string(),
  name: v.string(),
  city: v.optional(v.string()),
  rating: v.number(),
  text: v.string(),
  photoId: v.optional(v.id("_storage")),
});

export const faqItemV = v.object({ id: v.string(), question: v.string(), answer: v.string() });

export const promoV = v.object({
  price: v.number(),
  startsAt: v.optional(v.number()),
  endsAt: v.number(),
  label: v.optional(v.string()),
  showCountdown: v.boolean(),
});

export const orderBumpV = v.object({
  productId: v.id("products"),
  price: v.number(),
  pitch: v.string(),
});

/** Événements des notifications push du dashboard. */
export const pushEventV = v.union(v.literal("sale"), v.literal("recovered"), v.literal("failed"), v.literal("payout"));

/** Événements du tracking maison (navigateur + serveur pour « purchase »). */
export const TRACK_EVENTS = [
  "page_view",
  "product_view",
  "scroll",
  "time_on_page",
  "preview_open",
  "share",
  "contact",
  "checkout_open",
  "checkout_field",
  "bump_toggle",
  "coupon_apply",
  "payment_start",
  "checkout_error",
  "purchase",
] as const;
export type TrackEvent = (typeof TRACK_EVENTS)[number];
export const trackEventV = v.union(...TRACK_EVENTS.map((t) => v.literal(t)));
