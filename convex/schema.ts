import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { faqItemV, orderBumpV, payoutDestinationV, promoV, recoveryV, testimonialV, themeV, trackEventV } from "./lib/validators";

export const saleStatus = v.union(
  v.literal("pending"),
  v.literal("paid"),
  v.literal("failed"),
  v.literal("abandoned"),
);

export default defineSchema({
  ...authTables,

  // Boutiques : un seul admin, plusieurs boutiques, mêmes clés Moneroo
  stores: defineTable({
    name: v.string(),
    slug: v.string(), // sous-domaine : slug.ROOT_DOMAIN
    customDomain: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("paused")),
    createdAt: v.number(),
    // Propriétaire (multi-tenant). Absent = boutique d'avant le passage multi-propriétaires (accessible à tout admin).
    ownerId: v.optional(v.id("users")),
  })
    .index("by_slug", ["slug"])
    .index("by_domain", ["customDomain"])
    .index("by_owner", ["ownerId"]),

  products: defineTable({
    storeId: v.id("stores"),
    title: v.string(),
    slug: v.string(),
    tagline: v.optional(v.string()),
    description: v.string(),
    coverId: v.optional(v.id("_storage")),
    // Galerie de la page de vente (images et GIF animés), affichée sous l'image principale
    gallery: v.optional(v.array(v.object({ storageId: v.id("_storage"), mime: v.string(), width: v.optional(v.number()), height: v.optional(v.number()) }))),
    // Créé par OdiN via l'API (sert au suivi, aucun effet sur la vitrine)
    source: v.optional(v.string()),
    price: v.number(), // XOF, entier
    compareAtPrice: v.optional(v.number()),
    status: v.union(v.literal("draft"), v.literal("published")),
    files: v.array(
      v.object({
        storageId: v.id("_storage"),
        name: v.string(),
        size: v.number(),
        mime: v.string(),
        // Aperçu gratuit (PDF) : N premières pages copiées dans un fichier séparé, seul exposé publiquement
        pages: v.optional(v.number()),
        previewId: v.optional(v.id("_storage")),
        previewStatus: v.optional(v.union(v.literal("pending"), v.literal("ready"), v.literal("none"), v.literal("failed"))),
      }),
    ),
    previewPages: v.optional(v.number()), // 0 = pas d'aperçu ; absent = 3
    stockLimit: v.optional(v.number()), // nombre d'exemplaires en vente (absent = illimité)
    cta: v.optional(v.string()), // texte du bouton d'achat (absent = « Acheter maintenant »)
    salesCount: v.number(),
    updatedAt: v.number(),
    // Conversion
    testimonials: v.optional(v.array(testimonialV)),
    faq: v.optional(v.array(faqItemV)),
    guarantee: v.optional(v.object({ enabled: v.boolean(), text: v.string() })),
    promo: v.optional(promoV),
    showSalesCount: v.optional(v.boolean()),
    orderBump: v.optional(orderBumpV),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    countries: v.optional(v.array(v.string())), // pays où le produit est vendu ([] ou absent = ceux de la boutique)
  })
    .index("by_store_status", ["storeId", "status"])
    .index("by_store_slug", ["storeId", "slug"]),

  // Notifications push du dashboard : chaque appareil appartient à un compte et ne reçoit que les boutiques de celui-ci
  // Invitations d'administrateurs : un compte supplémentaire n'est accepté que s'il a été invité
  adminInvites: defineTable({
    email: v.string(),
    invitedBy: v.id("users"),
    createdAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_email", ["email"]),

  pushSubscriptions: defineTable({
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    device: v.string(),
    events: v.array(v.union(v.literal("sale"), v.literal("recovered"), v.literal("failed"), v.literal("payout"))),
    createdAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    userId: v.optional(v.id("users")),
  })
    .index("by_endpoint", ["endpoint"])
    .index("by_user", ["userId"]),

  customers: defineTable({
    storeId: v.id("stores"),
    email: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    country: v.optional(v.string()),
    totalSpent: v.number(),
    salesCount: v.number(),
    lastPurchaseAt: v.optional(v.number()),
    marketingOptOut: v.optional(v.boolean()),
  })
    .index("by_store_email", ["storeId", "email"]),

  sales: defineTable({
    storeId: v.id("stores"),
    number: v.string(),
    productId: v.id("products"),
    customerId: v.id("customers"),
    // Copies figées au moment de l'achat : le dashboard reste juste même si le produit change
    productTitle: v.string(),
    customerName: v.string(),
    customerEmail: v.string(),
    customerPhone: v.optional(v.string()),
    // L'acheteur accepte d'être contacté sur WhatsApp (case cochée au paiement)
    whatsappConsent: v.optional(v.boolean()),
    // Remboursement : l'argent est rendu par le vendeur (Mobile Money), l'accès est coupé
    refund: v.optional(v.object({ at: v.number(), amount: v.number(), reason: v.optional(v.string()), by: v.optional(v.string()) })),
    price: v.number(),
    discount: v.number(),
    net: v.number(),
    couponId: v.optional(v.id("coupons")),
    couponCode: v.optional(v.string()),
    status: saleStatus,
    // Prestataire d'encaissement : absent = Moneroo (historique). SasPay sert le Cameroun (CEMAC).
    provider: v.optional(v.union(v.literal("moneroo"), v.literal("saspay"))),
    monerooPaymentId: v.optional(v.string()),
    saspaySessionId: v.optional(v.string()), // id de la checkout-session créée à l'initialisation
    saspayTransactionId: v.optional(v.string()), // connu seulement une fois le paiement tenté ; relie le webhook à la vente
    method: v.optional(v.string()),
    fees: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    accessKey: v.string(), // secret des liens de livraison (page merci + téléchargements)
    accessRevoked: v.boolean(),
    downloads: v.number(),
    bump: v.optional(v.object({ productId: v.id("products"), title: v.string(), price: v.number() })),
    promoApplied: v.optional(v.boolean()),
    // Montant réellement facturé par Moneroo, dans la devise de l'acheteur (net reste en XOF)
    charged: v.optional(v.object({ currency: v.string(), amount: v.number(), rate: v.number() })),
    methodCode: v.optional(v.string()),
    requestedMethod: v.optional(v.string()), // moyen choisi par l'acheteur AVANT le paiement (sert au routage et à la santé des moyens)
    recovery: v.optional(
      v.object({
        stepsSent: v.array(v.string()), // ids des étapes envoyées
        lastSentAt: v.number(),
        whatsappDoneAt: v.optional(v.number()),
      }),
    ),
    recoveredBySaleId: v.optional(v.id("sales")), // vente réglée issue de cette relance
    recoveredFromSaleId: v.optional(v.id("sales")),
    context: v.object({
      country: v.optional(v.string()),
      lang: v.optional(v.string()),
      device: v.optional(v.string()),
      referrer: v.optional(v.string()),
      utmSource: v.optional(v.string()),
      utmCampaign: v.optional(v.string()),
      ip: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      fbp: v.optional(v.string()),
      fbc: v.optional(v.string()),
      sessionKey: v.optional(v.string()),
    }),
  })
    .index("by_status", ["status"])
    .index("by_customer", ["customerId"])
    .index("by_number", ["number"])
    .index("by_payment", ["monerooPaymentId"])
    .index("by_saspay_session", ["saspaySessionId"])
    .index("by_saspay_transaction", ["saspayTransactionId"])
    .index("by_product", ["productId"])
    .index("by_store", ["storeId"])
    .index("by_store_status", ["storeId", "status"]),

  coupons: defineTable({
    storeId: v.id("stores"),
    code: v.string(),
    type: v.union(v.literal("percent"), v.literal("fixed")),
    value: v.number(),
    maxUses: v.optional(v.number()),
    uses: v.number(),
    expiresAt: v.optional(v.number()),
    productId: v.optional(v.id("products")),
    active: v.boolean(),
    saleId: v.optional(v.id("sales")), // code unique généré par une relance
  })
    .index("by_store_code", ["storeId", "code"]),

  // Une ligne par visiteur et par jour et par page : visites uniques sans exploser la table
  pageviews: defineTable({
    storeId: v.id("stores"),
    day: v.string(), // YYYY-MM-DD (UTC)
    path: v.string(),
    productId: v.optional(v.id("products")),
    visitorId: v.string(),
    source: v.optional(v.string()),
    country: v.optional(v.string()), // pays du visiteur (ISO), pour le filtre et le globe
    count: v.number(),
  })
    .index("by_visitor_day_path", ["visitorId", "day", "path"])
    .index("by_store_day", ["storeId", "day"]),

  // Tracking maison : une session = une visite (30 min d'inactivité max), pseudonyme, sans IP
  sessions: defineTable({
    storeId: v.id("stores"),
    key: v.string(), // identifiant aléatoire généré par le navigateur
    visitorId: v.string(),
    isNew: v.boolean(),
    startedAt: v.number(),
    lastSeenAt: v.number(),
    pages: v.number(),
    lastPath: v.string(),
    landing: v.string(),
    device: v.string(), // mobile | tablette | ordinateur
    browser: v.optional(v.string()),
    os: v.optional(v.string()),
    country: v.optional(v.string()),
    source: v.optional(v.string()),
    campaign: v.optional(v.string()),
    saleId: v.optional(v.id("sales")),
  })
    .index("by_key", ["key"])
    .index("by_store_last", ["storeId", "lastSeenAt"])
    .index("by_store_started", ["storeId", "startedAt"])
    .index("by_last", ["lastSeenAt"])
    .index("by_visitor", ["visitorId", "startedAt"]),

  events: defineTable({
    storeId: v.id("stores"),
    sessionId: v.id("sessions"),
    visitorId: v.string(),
    type: trackEventV,
    path: v.string(),
    productId: v.optional(v.id("products")),
    props: v.optional(
      v.object({
        field: v.optional(v.string()), // nom du champ (jamais sa valeur)
        depth: v.optional(v.number()),
        seconds: v.optional(v.number()),
        file: v.optional(v.string()),
        on: v.optional(v.boolean()),
        ok: v.optional(v.boolean()),
        amount: v.optional(v.number()),
        error: v.optional(v.string()), // code court d'erreur de paiement vue par l'acheteur
      }),
    ),
    at: v.number(),
  })
    .index("by_store_at", ["storeId", "at"])
    .index("by_session", ["sessionId", "at"])
    .index("by_at", ["at"]),

  checkoutStarts: defineTable({
    storeId: v.id("stores"),
    day: v.string(),
    productId: v.id("products"),
    visitorId: v.string(),
    country: v.optional(v.string()),
  })
    .index("by_store_day", ["storeId", "day"]),

  emailLog: defineTable({
    storeId: v.id("stores"),
    to: v.string(),
    template: v.union(v.literal("purchase"), v.literal("seller_sale"), v.literal("recovery")),
    stepId: v.optional(v.string()),
    meta: v.optional(v.object({ couponCode: v.optional(v.string()), expiresAt: v.optional(v.number()) })),
    saleId: v.id("sales"),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed")),
    provider: v.optional(v.string()),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    // Suivi des relances : ouverture (pixel) et clic (lien signé)
    openedAt: v.optional(v.number()),
    opens: v.optional(v.number()),
    clickedAt: v.optional(v.number()),
    clicks: v.optional(v.number()),
  })
    .index("by_sale", ["saleId"])
    .index("by_store_template", ["storeId", "template"]),

  metaEvents: defineTable({
    storeId: v.id("stores"),
    eventName: v.string(),
    eventId: v.string(),
    saleId: v.optional(v.id("sales")),
    status: v.union(v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    response: v.optional(v.string()),
  }).index("by_event_id", ["eventId"]),

  // Pages de contenu : CGV, mentions légales, confidentialité, remboursement, pages libres
  pages: defineTable({
    storeId: v.id("stores"),
    slug: v.string(),
    title: v.string(),
    content: v.string(), // HTML de l'éditeur
    kind: v.union(
      v.literal("cgv"),
      v.literal("mentions"),
      v.literal("confidentialite"),
      v.literal("remboursement"),
      v.literal("custom"),
    ),
    published: v.boolean(),
    order: v.number(),
    updatedAt: v.number(),
  })
    .index("by_store_slug", ["storeId", "slug"])
    .index("by_store_order", ["storeId", "order"]),

  settings: defineTable({
    storeId: v.id("stores"),
    storeName: v.string(),
    ownerName: v.string(),
    tagline: v.optional(v.string()),
    logoId: v.optional(v.id("_storage")),
    whatsapp: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    notifyEmail: v.optional(v.string()),
    fbPixelId: v.optional(v.string()),
    fbAccessToken: v.optional(v.string()),
    fbTestEventCode: v.optional(v.string()),
    // Pixels Facebook supplémentaires (un par compte pub, ex. chaque membre de l'équipe OdiN)
    extraPixels: v.optional(v.array(v.object({ pixelId: v.string(), accessToken: v.optional(v.string()), label: v.optional(v.string()) }))),
    tiktokPixelId: v.optional(v.string()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    theme: v.optional(themeV),
    // Brouillon de la vitrine, affiché uniquement dans l'aperçu admin (/apercu)
    themeDraft: v.optional(v.object({ theme: themeV, socialProofPopup: v.boolean() })),
    socialProofPopup: v.optional(v.boolean()),
    recovery: v.optional(recoveryV),
    payoutDestinations: v.optional(v.array(payoutDestinationV)),
    // Devises proposées aux acheteurs (XOF toujours incluse) et pays couverts ([] = tous)
    currencies: v.optional(v.array(v.string())),
    countries: v.optional(v.array(v.string())),
  })
    .index("by_store", ["storeId"]),

  // Taux de change (base XOF), synchronisés chaque jour
  fxRates: defineTable({
    base: v.string(),
    rates: v.record(v.string(), v.number()),
    fetchedAt: v.number(),
    source: v.string(),
  }),

  // Catalogue Moneroo (GET /utils/payment|payout/methods), synchronisé chaque jour
  monerooMethods: defineTable({
    kind: v.union(v.literal("payment"), v.literal("payout")),
    code: v.string(),
    name: v.string(),
    iconUrl: v.optional(v.string()),
    currency: v.string(),
    countries: v.array(v.string()),
    enabled: v.boolean(),
    fields: v.array(v.object({ name: v.string(), label: v.string(), type: v.string() })),
  })
    .index("by_kind", ["kind"])
    .index("by_kind_code", ["kind", "code"]),

  // Réseaux Mobile Money encaissables via SasPay (synchronisés depuis son API : jamais saisis à la main)
  saspayNetworks: defineTable({
    code: v.string(),
    name: v.string(),
    country: v.string(), // ISO
    currency: v.string(),
    active: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_country", ["country"]),

  // Mémoire du routage : un moyen refusé par Moneroo (« not enabled ») n'est pas ré-essayé à chaque achat pendant quelques heures
  providerProbes: defineTable({
    provider: v.union(v.literal("moneroo"), v.literal("saspay")),
    code: v.string(),
    enabled: v.boolean(),
    checkedAt: v.number(),
    reason: v.optional(v.string()),
  }).index("by_provider_code", ["provider", "code"]),

  // File d'envoi WhatsApp automatique (un seul numéro pour la plateforme, géré par le worker ~/projects/digishop-whatsapp)
  whatsappQueue: defineTable({
    storeId: v.id("stores"),
    saleId: v.id("sales"),
    customerId: v.id("customers"),
    to: v.string(), // chiffres seuls, indicatif compris (ex. 22961234567)
    kind: v.union(v.literal("failed"), v.literal("cart"), v.literal("link"), v.literal("ack")),
    status: v.union(v.literal("queued"), v.literal("sending"), v.literal("sent"), v.literal("failed"), v.literal("skipped")),
    scheduledFor: v.number(),
    attempts: v.number(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    repliedAt: v.optional(v.number()),
  })
    .index("by_status_time", ["status", "scheduledFor"])
    .index("by_sent", ["status", "sentAt"])
    .index("by_to", ["to", "sentAt"])
    .index("by_sale", ["saleId"])
    .index("by_store", ["storeId", "scheduledFor"]),

  // État du worker WhatsApp (une seule ligne, key = "main")
  whatsappState: defineTable({
    key: v.string(),
    warmupStartedAt: v.optional(v.number()),
    paused: v.boolean(),
    pauseReason: v.optional(v.string()),
    nextAllowedAt: v.number(),
    connected: v.boolean(),
    phone: v.optional(v.string()),
    lastHeartbeatAt: v.optional(v.number()),
  }).index("by_key", ["key"]),

  // Clés d'API (OdiN) : seul le hachage SHA-256 est gardé, la clé n'est montrée qu'une fois
  apiKeys: defineTable({
    ownerId: v.id("users"),
    label: v.string(),
    hash: v.string(),
    prefix: v.string(), // début de la clé, pour la reconnaître dans la liste
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_owner", ["ownerId"]),

  // Webhooks sortants signés (HMAC-SHA256) : ventes réglées, échouées, abandonnées, remboursées
  webhooks: defineTable({
    ownerId: v.id("users"),
    url: v.string(),
    secret: v.string(),
    events: v.array(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    lastAt: v.optional(v.number()),
    lastStatus: v.optional(v.string()),
    failures: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  payouts: defineTable({
    storeId: v.id("stores"),
    amount: v.number(),
    currency: v.optional(v.string()), // devise du moyen de retrait (XOF par défaut)
    method: v.string(),
    country: v.optional(v.string()), // pays du moyen de retrait : le solde est cloisonné par pays chez chaque prestataire
    msisdn: v.string(),
    label: v.string(),
    status: v.union(v.literal("initiated"), v.literal("pending"), v.literal("success"), v.literal("failed")),
    // Prestataire de décaissement : absent = Moneroo (historique). L'autre prestataire sert le Cameroun (CEMAC, XAF).
    provider: v.optional(v.union(v.literal("moneroo"), v.literal("saspay"))),
    monerooPayoutId: v.optional(v.string()),
    saspayPayoutId: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_moneroo", ["monerooPayoutId"])
    .index("by_saspay", ["saspayPayoutId"])
    .index("by_store", ["storeId"])
    .index("by_store_status", ["storeId", "status"]),
});
