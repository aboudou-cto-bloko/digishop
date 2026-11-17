@AGENTS.md

# Digishop

Boutiques de produits digitaux façon Chariow (un admin, plusieurs boutiques). Prod : https://digishop-bj.vercel.app (chemins `/b/<slug>`).
Stack : Next.js 16 · TypeScript · Convex (+ `@convex-dev/auth`) · Tailwind · shadcn **Base UI** · Zod · Moneroo (paiement) · SMTP nodemailer (failover SMTP_1..5) · Vercel.

## Commandes
```bash
CHOKIDAR_USEPOLLING=1 npx convex dev   # backend (watchers inotify limités sur cette machine)
npm run dev                            # Next.js
npx tsc --noEmit && npm run lint       # vérification (pas de script typecheck)
npx convex deploy                      # DÉPLOIEMENT : demander confirmation
```

## Où lire (charger seulement ce qui sert)
| Besoin | Fichier |
|--------|---------|
| Vue d'ensemble, flux, conventions du repo | `docs/ARCHITECTURE.md` |
| Index de la doc | `docs/INDEX.md` |
| Pièges Next 16 / Base UI / paiements / géo | skill `stack-gotchas` |

## Workflow
- `/feature`, `/fix`, `/verify`, `/ship` (agents `architect`, `backend-dev`, `frontend-dev`, `reviewer`).
- Branche `feat/` ou `fix/`, jamais de push sur `main` ; commits en français `type(scope): description`.
- Lire avant d'éditer. Pas de déploiement, push ni suppression de données sans confirmation.

## Règles propres au projet
- Pas de `any` (`unknown` + type guards) ; Zod / validators `v.*` à toutes les frontières ; aucun secret en dur.
- Messages d'erreur destinés au client : toujours `ConvexError` (les `Error` simples sont masqués en prod).
- Pays / devises / indicatifs / taux : bibliothèques déjà installées (`i18n-iso-countries`, `libphonenumber-js`, `country-to-currency`…), **jamais de table maison**.
- `cn` vient du paquet npm `cn` (`src/lib/utils.ts`) : ne pas « corriger ».
- Webhook Moneroo = sous-ensemble de la transaction → toujours re-vérifier via `GET /payments/{id}/verify`.
- Côté Convex : noms de cron en ASCII, fichiers de modules sans tiret, `requireStore`/`ownedBy` pour tout accès par boutique ; le nombre de ventes n'est jamais envoyé au navigateur s'il est masqué.
- shadcn Base UI : pas d'`asChild` (prop `render`).
- `ua-parser-js` reste en **v1** (v2 = AGPL).
