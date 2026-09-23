// Publishes version 1 of the three legal documents (mentions légales,
// politique de confidentialité, CGU) so the CGU gate doesn't block every
// user with an empty document on first deploy, and Gestion > Légal has a
// real starting point instead of a blank page. Safe to re-run: each call
// only creates a NEW version if you edit the text below and re-run it
// (publishLegalDocument always adds the next version number, never
// overwrites) -- so running this twice with unchanged text just adds a
// redundant version 2/3 identical to version 1. Meant to run once, right
// after the migration that adds the User/LegalDocument/CguAcceptance models.
//
//   node prisma/seed-legal-docs.mjs
//
// The mentions légales contain [À COMPLÉTER] placeholders (association not
// yet officially declared at the time this was written) -- edit them for
// real from Gestion > Légal once the BDE has a SIRET/RNA number.
import { db } from '../server/db.js';

const MENTIONS_LEGALES = `Éditeur du site

Le présent site est édité par [NOM DE L'ASSOCIATION] (association loi 1901 en cours de déclaration), dont le siège est situé [ADRESSE À COMPLÉTER].
Numéro SIRET / RNA : [À COMPLÉTER]
Directeur de la publication : [À COMPLÉTER — nom du président ou responsable en exercice]
Contact : mira.42perpignan@gmail.com

Hébergement

Le site est auto-hébergé sur une infrastructure personnelle et rendu accessible publiquement via un tunnel sécurisé fourni par :
Cloudflare, Inc. — 101 Townsend St, San Francisco, CA 94107, États-Unis — https://www.cloudflare.com

Propriété intellectuelle

L'ensemble des éléments du site (textes, logos, mise en page) est la propriété de [NOM DE L'ASSOCIATION] ou de ses membres, sauf mention contraire. Toute reproduction non autorisée est interdite.

Ce document contient des informations provisoires ([À COMPLÉTER]) qui seront mises à jour dès la déclaration officielle de l'association.`;

const POLITIQUE_CONFIDENTIALITE = `1. Responsable du traitement
[NOM DE L'ASSOCIATION] (BDE 42 Perpignan), contact : mira.42perpignan@gmail.com

2. Données collectées
- Via la connexion avec ton compte 42 (OAuth, aucun mot de passe ne transite par ce site) : identifiant (login), nom complet, adresse email, photo de profil, campus.
- Historique de commandes : articles commandés, prix, créneau de retrait, date.
- Si tu actives les notifications (réservé à l'équipe BDE) : l'identifiant technique de ton appareil (endpoint de notification push).

3. Finalités
- Te permettre de commander et de suivre tes commandes.
- Statistiques de vente internes et gestion des stocks du BDE.
- Attribution des rôles internes (staff / gestion / bureau) pour les membres de l'équipe.

4. Base légale
Exécution du service que tu demandes (passer une commande) et intérêt légitime du BDE à suivre son activité (statistiques internes, non commerciales).

5. Durée de conservation
Tes données de profil et ton historique de commandes sont conservés tant que ton compte existe. Si tu supprimes ton compte, tes commandes passées sont anonymisées (elles ne portent plus ton nom ni ton identifiant) mais restent dans les statistiques et la comptabilité du BDE.

6. Destinataires
Seule l'équipe du BDE (staff, gestion, bureau) a accès à tes données. Aucune donnée n'est vendue ni partagée avec un tiers commercial.

7. Tes droits
Tu peux à tout moment :
- accéder à tes données ou les faire rectifier,
- demander la suppression de ton compte : le bouton « Supprimer mon compte » (menu de ton profil) exécute cette suppression automatiquement et immédiatement,
- nous contacter pour toute question à mira.42perpignan@gmail.com,
- introduire une réclamation auprès de la CNIL (www.cnil.fr) si tu estimes que tes droits ne sont pas respectés.

8. Cookies et stockage local
Le site stocke uniquement un jeton de connexion technique dans le stockage local de ton navigateur, nécessaire pour rester connecté. Aucun cookie publicitaire ni traceur tiers n'est utilisé.

9. Sécurité
La connexion se fait exclusivement via l'authentification officielle de l'école 42 (OAuth) : ce site ne stocke jamais de mot de passe.`;

const CGU = `1. Objet
Les présentes CGU encadrent l'utilisation du service de commande en ligne de sandwichs et snacks opéré par des bénévoles du BDE, réservé à la communauté du campus 42 Perpignan.

2. Accès au service
L'accès nécessite une connexion via ton compte 42 (OAuth). Un compte 42 = un compte sur ce site. Une borne « kiosque » sans identité reste utilisable uniquement pour les commandes passées sur place au comptoir.

3. Acceptation des CGU
L'utilisation du service est subordonnée à l'acceptation des présentes CGU. Si une nouvelle version est publiée, tu devras l'accepter à nouveau avant de pouvoir repasser commande ; les acceptations précédentes sont conservées comme preuve.

4. Commandes et retrait
Les commandes sont passées en ligne et retirées sur place au créneau choisi lors de la commande. Le paiement s'effectue sur place (espèces ou moyen accepté par le BDE) : aucune donnée bancaire n'est collectée par ce site. Les stocks et disponibilités affichés sont indicatifs et peuvent être ajustés en fonction des approvisionnements réels.

5. Annulation
Le BDE se réserve le droit d'annuler une commande (rupture de stock, erreur de préparation, etc.). Le client en est alors informé dans les meilleurs délais.

6. Usage loyal
Tu t'engages à utiliser le service de bonne foi (pas de commandes multiples abusives visant à perturber le service ou à bloquer les stocks pour d'autres élèves).

7. Responsabilité
Le service est fourni « en l'état » par une association étudiante bénévole, sans garantie de disponibilité continue. Le BDE ne saurait être tenu responsable d'une indisponibilité temporaire du site.

8. Modification des CGU
Le BDE peut modifier les présentes CGU à tout moment, notamment pour les adapter à l'évolution du service ou de la réglementation. La nouvelle version prend effet dès sa publication et doit être acceptée pour continuer à utiliser le service.

9. Droit applicable
Les présentes CGU sont soumises au droit français.`;

const DOCS = [
  { kind: 'mentions', title: 'Mentions légales', content: MENTIONS_LEGALES },
  { kind: 'privacy', title: 'Politique de confidentialité', content: POLITIQUE_CONFIDENTIALITE },
  { kind: 'cgu', title: "Conditions Générales d'Utilisation", content: CGU }
];

for (const { kind, title, content } of DOCS) {
  const existing = await db.getLatestLegalDocument(kind);
  if (existing) {
    console.log(`⏭️  ${kind} déjà publié (v${existing.version}), rien à faire.`);
    continue;
  }
  const doc = await db.publishLegalDocument(kind, title, content, null);
  console.log(`✅ ${kind} publié en v${doc.version}`);
}

// db.js's PrismaClient (a separate instance from any created elsewhere)
// keeps its connection open, which would otherwise leave this one-shot
// script hanging forever instead of exiting.
process.exit(0);
