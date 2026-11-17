import { mutation, query, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin, requireStore } from "./lib/auth";
import { themeV } from "./lib/validators";
import type { Doc, Id } from "./_generated/dataModel";

const DEFAULTS = {
  storeName: "Ma boutique",
  ownerName: "",
};

export const DEFAULT_THEME: NonNullable<Doc<"settings">["theme"]> = {
  layout: "grid",
  accent: "#f8cb3c",
  background: "#f3f4f3",
  font: "moderne",
};

/** Devises proposées aux acheteurs : XOF toujours en premier. */
export function storeCurrencies(s: Doc<"settings"> | null | undefined): string[] {
  return ["XOF", ...(s?.currencies ?? []).filter((c) => c !== "XOF")];
}

/** Réglages d'une boutique (un document par boutique). */
export async function loadSettings(ctx: QueryCtx, storeId: Id<"stores">) {
  return await ctx.db
    .query("settings")
    .withIndex("by_store", (q) => q.eq("storeId", storeId))
    .first();
}

/** Réglages de la boutique, créés à la volée s'ils n'existent pas encore. */
export async function ensureSettings(ctx: MutationCtx, storeId: Id<"stores">): Promise<Doc<"settings">> {
  const existing = await loadSettings(ctx, storeId);
  if (existing) return existing;
  const store = await ctx.db.get(storeId);
  const id = await ctx.db.insert("settings", { ...DEFAULTS, storeName: store?.name ?? DEFAULTS.storeName, storeId });
  return (await ctx.db.get(id))!;
}

async function publicTheme(ctx: QueryCtx, t: Doc<"settings">["theme"]) {
  const theme = { ...DEFAULT_THEME, ...t };
  return {
    layout: theme.layout,
    accent: theme.accent,
    background: theme.background,
    font: theme.font,
    coverId: theme.coverId,
    coverUrl: theme.coverId ? await ctx.storage.getUrl(theme.coverId) : null,
    coverTitle: theme.coverTitle,
    coverSubtitle: theme.coverSubtitle,
    featuredProductId: theme.featuredProductId,
  };
}

/** Infos publiques d'une boutique (aucun secret). */
export const publicSettings = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const s = await loadSettings(ctx, storeId);
    const store = await ctx.db.get(storeId);
    return {
      storeName: s?.storeName ?? store?.name ?? DEFAULTS.storeName,
      tagline: s?.tagline,
      logoUrl: s?.logoId ? await ctx.storage.getUrl(s.logoId) : null,
      whatsapp: s?.whatsapp,
      supportEmail: s?.supportEmail,
      fbPixelId: s?.fbPixelId,
      // Tous les pixels Facebook à initialiser dans le navigateur (principal + supplémentaires)
      fbPixelIds: [...new Set([s?.fbPixelId, ...(s?.extraPixels ?? []).map((x) => x.pixelId)].filter((x): x is string => Boolean(x)))],
      tiktokPixelId: s?.tiktokPixelId,
      seoTitle: s?.seoTitle,
      seoDescription: s?.seoDescription,
      theme: await publicTheme(ctx, s?.theme),
      socialProofPopup: s?.socialProofPopup ?? false,
      currencies: storeCurrencies(s),
      countries: s?.countries ?? [],
    };
  },
});

/**
 * Pays couverts par la boutique ([] = partout). Les devises proposées en sont déduites automatiquement :
 * celles que Moneroo encaisse dans ces pays (et pour lesquelles un taux de change existe).
 */
export const updateMarkets = mutation({
  args: { storeId: v.id("stores"), countries: v.array(v.string()) },
  handler: async (ctx, { storeId, countries }) => {
    await requireStore(ctx, storeId);
    const ctr = [...new Set(countries.map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))];
    const methods = (
      await ctx.db
        .query("monerooMethods")
        .withIndex("by_kind", (q) => q.eq("kind", "payment"))
        .collect()
    ).filter((m) => m.enabled && m.countries.length <= 10);
    const fx = await ctx.db.query("fxRates").first();
    const currencies = [...new Set(methods.filter((m) => m.countries.some((c) => ctr.includes(c))).map((m) => m.currency))].filter(
      (c) => c !== "XOF" && Boolean(fx?.rates[c]),
    );
    const s = await ensureSettings(ctx, storeId);
    await ctx.db.patch(s._id, { currencies, countries: ctr });
    return { currencies };
  },
});

/** Enregistre le brouillon (aperçu en direct), sans toucher à la boutique publique. */
export const saveThemeDraft = mutation({
  args: { storeId: v.id("stores"), theme: themeV, socialProofPopup: v.boolean() },
  handler: async (ctx, { storeId, ...draft }) => {
    await requireStore(ctx, storeId);
    const s = await ensureSettings(ctx, storeId);
    await ctx.db.patch(s._id, { themeDraft: draft });
  },
});

/** Réglages de la boutique avec le thème brouillon (pour /apercu). */
export const previewSettings = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const store = await requireStore(ctx, storeId);
    const s = await loadSettings(ctx, storeId);
    const draft = s?.themeDraft;
    return {
      storeName: s?.storeName ?? store.name,
      tagline: s?.tagline,
      logoUrl: s?.logoId ? await ctx.storage.getUrl(s.logoId) : null,
      whatsapp: s?.whatsapp,
      currencies: storeCurrencies(s),
      countries: s?.countries ?? [],
      socialProofPopup: draft?.socialProofPopup ?? s?.socialProofPopup ?? false,
      theme: await publicTheme(ctx, draft?.theme ?? s?.theme),
    };
  },
});

/** Publie le thème de la vitrine (layout, couleurs, police, couverture). */
export const updateTheme = mutation({
  args: { storeId: v.id("stores"), theme: themeV, socialProofPopup: v.optional(v.boolean()) },
  handler: async (ctx, { storeId, theme, socialProofPopup }) => {
    await requireStore(ctx, storeId);
    if (!/^#[0-9a-f]{6}$/i.test(theme.accent) || !/^#[0-9a-f]{6}$/i.test(theme.background)) {
      throw new ConvexError("Couleur invalide (format #RRGGBB).");
    }
    if (theme.featuredProductId) {
      const p = await ctx.db.get(theme.featuredProductId);
      if (!p || p.storeId !== storeId) throw new ConvexError("Produit mis en avant introuvable dans cette boutique.");
    }
    const clean = {
      ...theme,
      coverTitle: theme.coverTitle?.trim().slice(0, 90) || undefined,
      coverSubtitle: theme.coverSubtitle?.trim().slice(0, 200) || undefined,
    };
    const s = await ensureSettings(ctx, storeId);
    const prevCover = s.theme?.coverId;
    if (prevCover && prevCover !== clean.coverId) await ctx.storage.delete(prevCover);
    await ctx.db.patch(s._id, { theme: clean, themeDraft: undefined, ...(socialProofPopup !== undefined ? { socialProofPopup } : {}) });
  },
});

export const adminSettings = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    const store = await requireStore(ctx, storeId);
    const s = await loadSettings(ctx, storeId);
    return {
      ...DEFAULTS,
      storeName: store.name,
      ...s,
      logoUrl: s?.logoId ? await ctx.storage.getUrl(s.logoId) : null,
      fbAccessToken: undefined,
      hasFbAccessToken: Boolean(s?.fbAccessToken),
      // 4 derniers caractères seulement : permet de vérifier ce qui est stocké sans exposer le jeton
      fbAccessTokenHint: s?.fbAccessToken ? s.fbAccessToken.slice(-4) : undefined,
      theme: await publicTheme(ctx, s?.theme),
    };
  },
});

/** Pixels supplémentaires (un par compte publicitaire). Le jeton CAPI n'est jamais renvoyé au navigateur. */
export const extraPixels = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const s = await loadSettings(ctx, storeId);
    return (s?.extraPixels ?? []).map((x) => ({ pixelId: x.pixelId, label: x.label ?? "", hasToken: Boolean(x.accessToken) }));
  },
});

export const saveExtraPixels = mutation({
  args: {
    storeId: v.id("stores"),
    // accessToken : "" = effacer, absent = garder l'ancien
    pixels: v.array(v.object({ pixelId: v.string(), label: v.optional(v.string()), accessToken: v.optional(v.string()) })),
  },
  handler: async (ctx, { storeId, pixels }) => {
    await requireStore(ctx, storeId);
    if (pixels.length > 10) throw new ConvexError("10 pixels supplémentaires maximum.");
    const s = await ensureSettings(ctx, storeId);
    const old = new Map((s.extraPixels ?? []).map((x) => [x.pixelId, x]));
    const seen = new Set<string>([s.fbPixelId ?? ""]);
    const next: { pixelId: string; label?: string; accessToken?: string }[] = [];
    for (const p of pixels) {
      const id = p.pixelId.trim();
      if (!/^\d{10,20}$/.test(id)) throw new ConvexError(`Pixel « ${id} » : l'ID ne contient que des chiffres.`);
      if (seen.has(id)) continue;
      seen.add(id);
      const token = p.accessToken === undefined ? old.get(id)?.accessToken : p.accessToken.trim() || undefined;
      next.push({ pixelId: id, ...(p.label?.trim() ? { label: p.label.trim().slice(0, 40) } : {}), ...(token ? { accessToken: token } : {}) });
    }
    await ctx.db.patch(s._id, { extraPixels: next });
  },
});

export const internalSettings = internalQuery({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => await loadSettings(ctx, storeId),
});

const optStr = v.optional(v.string());

export const updateSettings = mutation({
  args: {
    storeId: v.id("stores"),
    storeName: optStr,
    ownerName: optStr,
    tagline: optStr,
    logoId: v.optional(v.union(v.id("_storage"), v.null())),
    whatsapp: optStr,
    supportEmail: optStr,
    notifyEmail: optStr,
    fbPixelId: optStr,
    fbAccessToken: optStr, // "" = effacer, undefined = ne pas toucher
    fbTestEventCode: optStr,
    tiktokPixelId: optStr,
    seoTitle: optStr,
    seoDescription: optStr,
  },
  handler: async (ctx, { storeId, ...args }) => {
    await requireStore(ctx, storeId);
    if (args.fbPixelId && !/^\d{10,20}$/.test(args.fbPixelId.trim())) {
      throw new ConvexError("L'ID Pixel Facebook ne contient que des chiffres (15-16 en général).");
    }
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(args)) {
      if (val === undefined) continue;
      if (k === "logoId") {
        patch.logoId = val === null ? undefined : val;
        continue;
      }
      const str = typeof val === "string" ? val.trim() : val;
      patch[k] = str === "" ? undefined : str;
    }
    const s = await ensureSettings(ctx, storeId);
    if (s.logoId && "logoId" in patch && patch.logoId !== s.logoId) await ctx.storage.delete(s.logoId);
    await ctx.db.patch(s._id, patch);
    // Le nom affiché de la boutique suit le nom saisi dans les réglages
    if (typeof patch.storeName === "string") await ctx.db.patch(storeId, { name: patch.storeName });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Checklist de mise en route affichée sur l'accueil tant qu'elle n'est pas complète. */
export const setupStatus = query({
  args: { storeId: v.id("stores") },
  handler: async (ctx, { storeId }) => {
    await requireStore(ctx, storeId);
    const s = await loadSettings(ctx, storeId);
    const published = await ctx.db
      .query("products")
      .withIndex("by_store_status", (q) => q.eq("storeId", storeId).eq("status", "published"))
      .first();
    return {
      store: Boolean(s?.ownerName && s.storeName && s.storeName !== DEFAULTS.storeName),
      moneroo: Boolean(process.env.MONEROO_SECRET_KEY && process.env.MONEROO_WEBHOOK_SECRET),
      cameroonPayin: Boolean(process.env.SASPAY_SECRET_KEY && process.env.SASPAY_WEBHOOK_SECRET),
      smtp: Boolean(process.env.SMTP_1_HOST && process.env.SMTP_1_USER && process.env.SMTP_1_PASS),
      product: Boolean(published),
      pixel: Boolean(s?.fbPixelId),
    };
  },
});
