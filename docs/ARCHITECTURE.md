# Architecture Digishop

## Couches
- **Frontend** `src/app` : `(store)` = vitrine publique d'une boutique (`/b/<slug>`, produit, `/merci`), `admin` = tableau de bord (PWA, push), `apercu` = aperçu live du thème brouillon (`themeDraft`), `login`. `src/proxy.ts` = routage (Next 16, remplace `middleware`).
- **Composants** `src/components` : `ui` (shadcn Base UI), `store` (vitrine), `admin`, `shared`, `providers`.
- **Utilitaires** `src/lib` : formatage (`format.ts`), géo (`geo.ts`, via bibliothèques), SEO (`seo.tsx`), tracking (`tracking.ts`, `track.ts`), sanitation HTML (`sanitize*.ts`), contexte boutique (`store-context.ts`, `store-lookup.ts`, `store-from-headers.ts`). Hooks admin `useStoreQuery/useStoreMutation` dans `src/hooks`.
- **Backend** `convex/` (un module par domaine) : `products`, `catalog`, `checkout`, `sales`, `customers`, `coupons`, `payouts`, `stores`, `storefront`, `pages`, `analytics`, `tracking`, `seo`, `push`/`pushNode`, `whatsapp`, `recovery` (relances), `crons`, `http` (webhooks + `/t/e`), `schema.ts`.
  - `payments/` : `moneroo*.ts` (client + actions), `saspay*.ts`, `webhooks.ts`, `shared.ts`.
  - `email/` : `send.ts` (SMTP failover), `data.ts`, `log.ts`. `meta/capi.ts` : API Conversions Facebook.
  - `lib/` : `auth.ts`, `stores.ts` (`requireStore`, `ownedBy`), `validators.ts`, `pricing.ts`, `fx.ts`, `sign.ts`.

## Flux principaux
1. **Achat** : vitrine → `checkout` (mutation) → action Moneroo (appel externe, jamais en mutation) → redirection paiement → webhook `http.ts` → re-vérification `GET /payments/{id}/verify` → vente marquée payée (idempotent) → e-mail avec lien à clé secrète (`accessKey`, révocable) + page `/merci`. Pas de compte client.
2. **Livraison** : accès par clé secrète ; aperçu PDF = N premières pages (`pdf-lib`), jamais plus de la moitié.
3. **Retraits** : attribués par boutique, via Moneroo (numéros enregistrés + mot de passe).
4. **Tracking maison** : `sendBeacon` → Convex `/t/e` → tables sessions/events ; `isbot` filtre les robots.
5. **Relances** : `recovery` + `crons`, délais et promos configurables par le vendeur.

## Multi-boutiques
Un admin, plusieurs boutiques, mêmes clés Moneroo. Toute requête admin passe par `requireStore`/`ownedBy`. Routage par chemin `/b/<slug>` (`STORE_ROUTING=path`) ou sous-domaine / domaine perso si configuré.

## Pour aller plus loin
Pièges et gotchas : skill `stack-gotchas`. Docs Next 16 : `node_modules/next/dist/docs/`.
