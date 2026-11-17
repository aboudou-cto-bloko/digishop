# API OdiN

Liaison entre Chairow et OdiN (outil de vente automatique). Tout passe par l'adresse HTTP de Convex :
`https://<déploiement>.convex.site/api/v1` (affichée dans **Paramètres → OdiN**).

## Authentification
`Authorization: Bearer chw_…` : clé créée dans Paramètres → OdiN, montrée une seule fois, stockée hachée (SHA-256).
Une clé donne accès à **toutes les boutiques** de son propriétaire, et à elles seules.

## Routes
| Méthode | Route | Rôle |
|---|---|---|
| GET | `/me` | Boutiques du propriétaire (`id`, `name`, `url`) |
| POST | `/upload-url` | `{ upload_url }` : y envoyer le fichier brut en POST (`Content-Type` du fichier) → `{ storageId }` |
| POST | `/products` | `{ store_id, title, …champs }` → crée une fiche en brouillon |
| GET | `/products/<id>` | Fiche : statut, `url`, `checkout_url`, `sales_count` |
| POST | `/products/<id>` | Met à jour la fiche (mêmes règles que le dashboard) |
| POST | `/products/<id>/publish` · `/unpublish` | Publie (prix ≥ 200 F et au moins un fichier) ou repasse en brouillon |
| GET | `/sales?store_id=&since=<ms>&status=paid\|failed\|abandoned\|pending\|refunded&limit=` | Ventes, les plus récentes d'abord |
| POST | `/sales/<id>/refund` | `{ amount?, reason? }` : note le remboursement, coupe l'accès, retire des revenus |

Champs de fiche : `title`, `tagline`, `description` (HTML de l'éditeur), `price`, `compare_at_price`, `cover_storage_id`,
`gallery` (`[{ storageId, mime, width?, height? }]`, GIF acceptés, 12 max), `files` (`[{ storageId, name, size, mime }]`),
`faq` (`[{ id, question, answer }]`), `guarantee` (`{ enabled, text }`), `testimonials`, `promo`, `countries`, `cta`,
`seo_title`, `seo_description`, `preview_pages`, `stock_limit`, `show_sales_count`, `slug`.
Les images de la description doivent être hébergées par la boutique (envoyées par `/upload-url`) : les autres sont retirées à l'affichage.

Erreurs : `{ error: "message en français" }` avec 400, 401 ou 404.

## Webhooks
Paramètres → OdiN : adresse `https://…`, évènements choisis, secret `whsec_…`.
- Évènements : `sale.paid`, `sale.failed`, `sale.abandoned`, `sale.refunded` (et `test` via le bouton).
- Corps : `{ id, event, created, data: <vente> }` ; `id` est unique par vente et évènement (dédoublonner avec).
- En-têtes : `X-Chairow-Event`, `X-Chairow-Timestamp` (secondes), `X-Chairow-Signature: sha256=<hex>`
  = HMAC-SHA256(secret, `<timestamp>.<corps brut>`). Refuser si l'écart d'heure dépasse 5 minutes.
- Réessais : jusqu'à 6 envois (0 s, 30 s, 2 min, 10 min, 1 h, 6 h) tant que la réponse n'est pas 2xx.
- La vente contient `customer.whatsapp_consent` : n'écrire sur WhatsApp qu'aux clients qui l'ont accepté.

## Pixels
Paramètres → Pixels : pixel principal + jusqu'à 10 pixels supplémentaires (un par compte publicitaire).
Chaque pixel reçoit les évènements du navigateur ; ceux qui ont un jeton reçoivent aussi l'achat par l'API Conversions (même `event_id`).
