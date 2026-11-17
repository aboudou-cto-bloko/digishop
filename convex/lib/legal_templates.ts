import { BRAND } from "./brand";

// Modèles de départ des pages légales (droit béninois, vente de produits numériques).
// Les passages entre <mark> sont à compléter par le vendeur : ce sont des modèles, pas un avis juridique.

export type LegalKind = "cgv" | "mentions" | "confidentialite" | "remboursement";

type Ctx = { storeName: string; ownerName?: string; email?: string; whatsapp?: string; siteUrl: string };

const todo = (label: string) => `<mark>[${label}]</mark>`;

function contact(c: Ctx) {
  const parts = [c.email ? `par email à <a href="mailto:${c.email}">${c.email}</a>` : `par email à ${todo("ton email de contact")}`];
  if (c.whatsapp) parts.push(`sur WhatsApp au ${c.whatsapp}`);
  return parts.join(" ou ");
}

export const DEFAULT_PAGES: { kind: LegalKind; slug: string; title: string; order: number; build: (c: Ctx) => string }[] = [
  {
    kind: "cgv",
    slug: "cgv",
    title: "Conditions générales de vente",
    order: 1,
    build: (c) => `
<p>Les présentes conditions générales de vente (CGV) s'appliquent à tout achat effectué sur la boutique <strong>${c.storeName}</strong> (${c.siteUrl}). Passer commande implique leur acceptation pleine et entière.</p>
<h2>1. Vendeur</h2>
<p>La boutique est éditée par ${c.ownerName || todo("ton nom ou le nom de ton entreprise")}, ${todo("statut : entreprise individuelle, SARL…")}, immatriculée sous le n° RCCM ${todo("numéro RCCM")}, IFU ${todo("numéro IFU")}, dont le siège est situé ${todo("adresse complète, Cotonou, Bénin")}. Contact : ${contact(c)}.</p>
<h2>2. Produits</h2>
<p>La boutique propose des <strong>produits numériques</strong> (guides, ebooks, fichiers audio ou vidéo, formations) livrés sous forme de fichiers téléchargeables. Chaque page produit décrit son contenu, son format et son prix. Les visuels sont indicatifs.</p>
<h2>3. Prix</h2>
<p>Les prix sont indiqués en francs CFA (F CFA), toutes taxes comprises. Le prix applicable est celui affiché au moment de la commande, réduction éventuelle comprise. Les frais éventuellement prélevés par l'opérateur de paiement du client restent à sa charge.</p>
<h2>4. Commande et paiement</h2>
<p>Le client renseigne son nom, son adresse email et son numéro WhatsApp, puis paie en ligne via notre prestataire de paiement sécurisé <strong>Moneroo</strong> (Mobile Money MTN, Moov, Wave, carte bancaire selon disponibilité). La commande est définitive dès la confirmation du paiement par le prestataire. Aucune donnée bancaire ne transite par nos serveurs.</p>
<h2>5. Livraison</h2>
<p>Le produit est accessible <strong>immédiatement</strong> après confirmation du paiement : sur la page de confirmation et par un email envoyé à l'adresse indiquée lors de la commande. Le lien d'accès reste valable sans limite de durée, sauf en cas de révocation pour non-respect des présentes CGV. Le client vérifie l'exactitude de son adresse email et consulte ses courriers indésirables avant de nous contacter.</p>
<h2>6. Droit de rétractation</h2>
<p>Le contenu numérique étant fourni immédiatement après le paiement, le client reconnaît qu'il en demande l'exécution immédiate et <strong>renonce à son droit de rétractation</strong> dès le premier accès au produit. Les cas de remboursement sont détaillés dans notre <a href="/pages/remboursement">politique de remboursement</a>.</p>
<h2>7. Licence d'utilisation</h2>
<p>L'achat confère au client une licence <strong>personnelle et non transférable</strong>. Il est interdit de revendre, partager, diffuser, copier ou mettre à disposition le produit, gratuitement ou non, en tout ou partie, sans autorisation écrite. Tout manquement peut entraîner la révocation de l'accès et des poursuites.</p>
<h2>8. Responsabilité</h2>
<p>Les contenus sont fournis à titre informatif et pédagogique. Les résultats obtenus dépendent de la mise en pratique par chacun : ${c.storeName} ne peut garantir un résultat particulier. Notre responsabilité est limitée au montant payé pour le produit concerné.</p>
<h2>9. Service client et réclamations</h2>
<p>Pour toute question ou réclamation, le client peut nous joindre ${contact(c)}. Nous répondons dans un délai de ${todo("48 heures ouvrées")}.</p>
<h2>10. Droit applicable et litiges</h2>
<p>Les présentes CGV sont soumises au droit béninois, notamment à la loi n° 2017-20 du 20 avril 2018 portant Code du numérique en République du Bénin. En cas de litige, une solution amiable sera recherchée en priorité ; à défaut, les tribunaux compétents de ${todo("Cotonou")} seront seuls compétents.</p>`,
  },
  {
    kind: "mentions",
    slug: "mentions-legales",
    title: "Mentions légales",
    order: 2,
    build: (c) => `
<h2>Éditeur du site</h2>
<p><strong>${c.storeName}</strong><br>Responsable : ${c.ownerName || todo("ton nom")}<br>Statut : ${todo("entreprise individuelle, SARL…")}<br>RCCM : ${todo("numéro")} · IFU : ${todo("numéro")}<br>Adresse : ${todo("adresse complète, Bénin")}<br>Contact : ${contact(c)}</p>
<h2>Directeur de la publication</h2>
<p>${c.ownerName || todo("ton nom")}</p>
<h2>Hébergement</h2>
<p>Site : Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, États-Unis (vercel.com).<br>Données et fichiers : Convex, Inc., San Francisco, CA, États-Unis (convex.dev).</p>
<h2>Plateforme</h2>
<p>La boutique fonctionne sur ${BRAND.name}, ${BRAND.tagline.toLowerCase()}. ${BRAND.disclaimer}</p>
<h2>Paiement</h2>
<p>Les paiements sont traités par Moneroo (moneroo.io). ${c.storeName} n'a jamais accès aux numéros de carte ni aux codes Mobile Money.</p>
<h2>Propriété intellectuelle</h2>
<p>L'ensemble des contenus du site et des produits vendus (textes, visuels, fichiers, marques) est protégé par le droit de la propriété intellectuelle. Toute reproduction ou diffusion sans autorisation écrite est interdite.</p>
<h2>Données personnelles</h2>
<p>Le traitement des données des clients est décrit dans notre <a href="/pages/confidentialite">politique de confidentialité</a>.</p>`,
  },
  {
    kind: "confidentialite",
    slug: "confidentialite",
    title: "Politique de confidentialité",
    order: 3,
    build: (c) => `
<p>${c.storeName} attache une grande importance à la protection de tes données personnelles. Cette politique explique quelles données nous collectons, pourquoi, et quels sont tes droits, conformément au Livre V du Code du numérique du Bénin (loi n° 2017-20).</p>
<h2>Responsable du traitement</h2>
<p>${c.ownerName || todo("ton nom ou ton entreprise")}, ${todo("adresse")}. Contact : ${contact(c)}.</p>
<h2>Données collectées</h2>
<ul><li><p><strong>Lors d'une commande</strong> : nom, adresse email, numéro WhatsApp, produit acheté, montant, statut du paiement.</p></li><li><p><strong>Automatiquement</strong> : pays, langue, type d'appareil, adresse IP, page d'origine et paramètres de campagne (UTM), identifiant de visite anonyme.</p></li></ul>
<p>Nous ne collectons <strong>aucune donnée bancaire</strong> : le paiement est traité directement par Moneroo.</p>
<h2>Pourquoi nous les utilisons</h2>
<ul><li><p>Te livrer ton produit et t'envoyer ton lien d'accès par email (exécution de la commande).</p></li><li><p>Répondre à tes questions et t'aider en cas de problème (service client).</p></li><li><p>Mesurer l'audience de la boutique et améliorer nos pages (intérêt légitime).</p></li><li><p>Mesurer l'efficacité de nos publicités sur Facebook / Instagram et TikTok (voir « Cookies et pixels »).</p></li><li><p>T'envoyer un rappel par email (et parfois un code de réduction) si ta commande n'est pas allée au bout. Chaque rappel contient un lien de désabonnement (intérêt légitime).</p></li><li><p>Afficher sur la boutique des notifications d'achats récents, avec ton <strong>prénom et ton pays uniquement</strong>, si la boutique a activé cette option.</p></li></ul>
<h2>Destinataires</h2>
<p>Tes données ne sont jamais vendues. Elles sont transmises uniquement à nos prestataires techniques : Moneroo (paiement), notre prestataire d'envoi d'emails, l'hébergeur (Vercel, Convex) et, pour la mesure publicitaire, Meta et TikTok (email et téléphone sont transmis sous forme chiffrée irréversible, dite « hachée »). Certains de ces prestataires sont situés hors du Bénin.</p>
<h2>Cookies et pixels</h2>
<p>La boutique mesure elle-même son audience, sans outil tiers : un identifiant aléatoire stocké sur ton appareil permet de compter les visites et de comprendre le parcours jusqu'à l'achat (pages vues, temps de lecture, aperçus ouverts, étapes du paiement, type d'appareil et de navigateur, pays approximatif). <strong>Ce que tu saisis dans les formulaires n'est jamais enregistré</strong> par cette mesure, ton adresse IP n'y est pas conservée, et ces données ne sont ni vendues ni utilisées pour de la publicité. Les emails de rappel contiennent une image invisible et des liens de suivi pour savoir s'ils ont été ouverts ou cliqués.</p>
<p>La boutique utilise aussi le Pixel Meta et, le cas échéant, le Pixel TikTok, qui déposent des cookies pour mesurer les visites et les achats issus de nos publicités. Tu peux bloquer ces traceurs dans les réglages de ton navigateur ou avec un bloqueur de contenu.</p>
<h2>Durée de conservation</h2>
<p>Les données de commande sont conservées ${todo("10 ans")} (obligations comptables). Les données de navigation sont conservées ${todo("13 mois")} au maximum.</p>
<h2>Tes droits</h2>
<p>Tu disposes d'un droit d'accès, de rectification, d'effacement et d'opposition sur tes données, notamment pour ne plus recevoir de rappels. Pour l'exercer, écris-nous ${contact(c)}. Tu peux aussi saisir l'Autorité de Protection des Données à caractère Personnel (APDP) du Bénin.</p>`,
  },
  {
    kind: "remboursement",
    slug: "remboursement",
    title: "Politique de remboursement",
    order: 4,
    build: (c) => `
<p>Nos produits étant numériques et livrés immédiatement, ils ne peuvent pas être « retournés ». Nous tenons quand même à ce que chaque achat se passe bien : voici les cas où nous remboursons.</p>
<h2>Nous remboursons ou corrigeons si :</h2>
<ul><li><p>Tu as été <strong>débité deux fois</strong> pour la même commande.</p></li><li><p>Tu as payé mais <strong>tu n'as jamais reçu l'accès</strong> et nous ne parvenons pas à te le fournir.</p></li><li><p>Le fichier est <strong>défectueux ou illisible</strong> et nous ne pouvons pas te fournir une version corrigée.</p></li><li><p>Le produit reçu <strong>ne correspond manifestement pas</strong> à sa description.</p></li></ul>
<h2>Nous ne remboursons pas si :</h2>
<ul><li><p>Le produit a été téléchargé et correspond à sa description, mais ne te convient finalement pas.</p></li><li><p>Tu t'es trompé d'adresse email : nous te renvoyons simplement l'accès à la bonne adresse.</p></li></ul>
<h2>Comment faire une demande</h2>
<p>Contacte-nous ${contact(c)} dans un délai de ${todo("7 jours")} après l'achat, en indiquant ton numéro de commande (il figure dans l'email d'accès) et le problème rencontré. Nous répondons sous ${todo("48 heures ouvrées")}.</p>
<p>Un remboursement accordé est effectué sur le moyen de paiement utilisé (Mobile Money ou carte) sous ${todo("7 jours ouvrés")}, et l'accès au produit est alors désactivé.</p>`,
  },
];

export function buildDefaultPage(kind: LegalKind, ctx: Ctx) {
  const tpl = DEFAULT_PAGES.find((p) => p.kind === kind)!;
  return { ...tpl, content: tpl.build(ctx).trim().replace(/\n/g, "") };
}
