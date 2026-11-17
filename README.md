# Digishop

Boutique mono-vendeur de produits digitaux (ebooks, PDF, audios, vidéos), avec une UX calquée sur Chariow.
Paiement par Moneroo, livraison automatique (page + email), dashboard vendeur en temps réel.

**Stack** : Next.js 16 · Convex (base, fichiers, auth, cron) · Tailwind 4 · shadcn/ui (Base UI) · Moneroo · nodemailer.

## Démarrer en local

```bash
npm install
npx convex dev            # crée le déploiement et écrit .env.local
npm run dev               # http://localhost:3000
```

Si le système manque de watchers de fichiers (`OS file watch limit reached`) :
`CHOKIDAR_USEPOLLING=1 npx convex dev`, et `npm run build && npm start` côté Next.

### Variables Convex

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set ADMIN_EMAIL toi@exemple.com
# Clés Convex Auth : https://labs.convex.dev/auth/setup/manual (JWT_PRIVATE_KEY + JWKS)
npx convex env set MONEROO_SECRET_KEY …
npx convex env set MONEROO_WEBHOOK_SECRET …
npx convex env set SMTP_1_HOST smtp.gmail.com
npx convex env set SMTP_1_PORT 587
npx convex env set SMTP_1_USER …
npx convex env set SMTP_1_PASS …      # mot de passe d'application
# Optionnel : SMTP_2_* = compte de secours (Brevo, Zoho…)
```

Première connexion : `/login` → « Première connexion ? Crée ton mot de passe » avec `ADMIN_EMAIL`.

### Webhook Moneroo

Dans Moneroo → Développeurs → Webhooks, ajouter `https://<deployment>.convex.site/webhooks/moneroo`
(l'URL exacte est affichée dans Paramètres → Paiement). Le webhook ne fait que déclencher une
re-vérification `GET /payments/{id}/verify` : la page de retour fait la même chose, donc une vente
est confirmée même si le webhook se perd.

## Parcours

| Client | Vendeur (`/admin`) |
|---|---|
| `/` boutique → `/p/[slug]` page de vente → `/checkout/[slug]` | Accueil : KPI, dernières ventes, **à relancer** (WhatsApp) |
| Moneroo (MoMo, Moov, Wave, carte) | Ventes : filtres, détail, révoquer l'accès, renvoyer l'email, lien WhatsApp |
| `/merci/[id]?k=…` : statut en direct, téléchargements | Produits, Clients (export CSV), Revenus, Réductions |
| Email avec le même lien (valable à vie, révocable) | Analytiques : entonnoir, réussite paiement, sources, heures, produits |

## Tracking Facebook

- Pixel navigateur : `PageView`, `ViewContent`, `InitiateCheckout`, `Purchase` (XOF).
- API Conversions (serveur) : `InitiateCheckout` + `Purchase`, avec le **même `event_id`** que le pixel
  (`purchase_<saleId>`) → Facebook dédoublonne. Email/téléphone/nom hachés SHA-256, IP, user-agent, `_fbp`/`_fbc`.
- Configurer dans Paramètres → Pixels et Tracking. Le code d'événement test permet de valider dans
  le Gestionnaire d'événements.
- Ajouter `?utm_source=facebook&utm_campaign=…` aux liens de pub pour le rapport « sources ».

## Lot 2

| Bloc | Où | Points clés |
|---|---|---|
| Vitrine | `/admin/vitrine` | 3 layouts (Grille, Éditorial, Produit vedette), 8 couleurs + libre (contraste WCAG contrôlé), 6 paires de polices, logo, couverture. **Aperçu en direct = la vraie boutique** (`/apercu`, admin seulement), scrollable et navigable, brouillon auto-enregistré, bouton Publier |
| Conversion | Éditeur produit → « Conversion » | Promo programmée (prix appliqué côté serveur, compte à rebours réel), avis clients, FAQ, garantie, compteur de ventes (≥ 5 réelles), offre complémentaire au checkout, notification d'achats récents (réels, prénom + pays) |
| Multi-pays / devises | Paramètres → Marchés et devises | Pays couverts (boutique + par produit), devises affichées et facturées. Pays visiteur : géo IP de l'hébergeur → fuseau horaire → choix manuel (drapeau). Libs : `i18n-iso-countries`, `Intl.DisplayNames`, `libphonenumber-js`, `countries-and-timezones`, `country-to-currency`, `country-flag-icons`. Taux : open.er-api.com (sync quotidienne) |
| Moneroo | `convex/catalog.ts` | Catalogue `GET https://api.moneroo.io/utils/{payment,payout}/methods` synchronisé chaque jour : logos des moyens de paiement par pays, opérateurs de retrait |
| Relances | `/admin/automatisations` | 1 à 5 étapes réglables (délai min/h/j, promo : aucune / code existant / code unique à usage unique avec validité), objet + message avec variables `{prénom} {produit} {prix} {code} {expiration}`, aperçu, stats « revenu récupéré », file WhatsApp 1 clic, désabonnement |
| Retraits | `/admin/revenus` | `POST /v1/payouts/initialize` vers des **numéros enregistrés uniquement**, mot de passe exigé (ajout/suppression de numéro et retrait), 1 retrait à la fois, solde **estimé** par devise (Moneroo n'a pas d'endpoint solde), vérification `GET /payouts/{id}/verify` + webhook `payout.*` |
| SEO | partout | canonical, Open Graph + Twitter, images de partage générées (`opengraph-image`), JSON-LD (OnlineStore, WebSite, Product/Offer/AggregateRating/Review, FAQPage, BreadcrumbList, ItemList), `sitemap.xml` (avec images), `robots.txt`, manifest, SEO par produit avec aperçu Google + score |
| Pages légales | `/admin/pages` | CGV, mentions, confidentialité, remboursement pré-remplies (droit béninois), éditeur Tiptap, passages à compléter surlignés |
| Emails | `emails/*.tsx` | React Email (achat, vente, relance, test), aperçu : `npm run email` |

Variables ajoutées : `NEXT_PUBLIC_SITE_URL` (Next) ; `UNSUBSCRIBE_SECRET` optionnel (Convex).

## Lot 3 : plusieurs boutiques

- **Domaine racine** (`NEXT_PUBLIC_ROOT_DOMAIN` côté Next, `ROOT_DOMAIN` côté Convex) : le dashboard (`/` → `/admin`).
- **Chaque boutique** : `slug.ROOT_DOMAIN` (local : `slug.localhost:3000`) ou domaine personnalisé. Résolution dans `src/proxy.ts` → en-tête `x-store-host` → `getStore()` (`src/lib/store-context.ts`).
- **Données** : `storeId` obligatoire sur produits, ventes, clients, codes promo, pages, réglages, visites, emails, événements Meta, retraits. Catalogue Moneroo et taux de change restent globaux.
- **Dashboard** : sélecteur de boutique (sidebar / menu Plus), page `/admin/boutiques`. Les hooks `useStoreQuery` / `useStoreMutation` / `useStoreAction` (`src/hooks/use-current-store.tsx`) injectent la boutique courante ; côté Convex, `requireStore` + `ownedBy` (`convex/lib/auth.ts`) refusent tout mélange entre boutiques.
- **Moneroo** : un compte, un webhook ; `metadata.store_id` + `return_url` sur le domaine de la boutique.
- **Retraits attribués** : solde, numéros de retrait et « un retrait en cours » par boutique. Le solde réel Moneroo est partagé entre les boutiques.
- **Aperçu vitrine** : `/apercu/<slug>`.
- **Migration** : `npx convex run migrations:assignDefaultStore` (idempotente) puis `migrations:check`.

## Points de conception

- Le prix est toujours recalculé côté serveur (coupon compris), jamais repris du navigateur.
- `markPaid` est idempotent : webhook + page de retour peuvent arriver tous les deux, un seul email part.
- Un montant reçu inférieur au prix ne valide pas la vente.
- Les ventes `pending` depuis plus d'une heure sont re-vérifiées puis passées en `abandoned` (cron 10 min).
- Emails : comptes SMTP essayés dans l'ordre, journalisés par vente, retentés à 5 min / 30 min / 2 h.
- Devise : les prix restent en XOF ; la conversion se fait côté serveur (taux stocké), Moneroo est appelé dans la devise de l'acheteur et le montant reçu est vérifié dans cette devise.
- Relances : le cron compare à la configuration courante ; pas de rattrapage en rafale (seule l'étape échue la plus avancée part), 1 h minimum entre deux envois, arrêt au paiement ou au désabonnement.
