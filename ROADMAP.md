# Feuille de route — Sandwicherie BDE 42 Perpignan

> Document vivant : à modifier au fil des décisions d'équipe (une PR suffit).
> Une case cochée = fonctionnalité en production.

## Vision

Aujourd'hui : une plateforme de précommande de repas connectée à l'Intra 42.
Demain : l'outil de gestion de tous les projets de vente du BDE — catalogue,
stock, équipe et bilan par événement — accessible en un lien depuis le site
de l'école.

**Environnements**
- Production : https://bde42perpignan.fr
- Staging (tests) : https://dev.bde42perpignan.fr
- Dépôt : https://github.com/AnatoleFarenc/Menu_Bde

---

## Ce qui tourne déjà

### Vitrine & commandes
- [x] Connexion Intra 42 (OAuth2, session par jeton signé, protection CSRF)
- [x] Formules personnalisables (groupes de choix par produit, prix calculé en direct)
- [x] Suivi de commande & avis client
- [x] Mode borne (poste de commande partagé, sans compte 42)

### Administration
- [x] Catalogue & stock (rupture automatique à 0, restitution si annulation)
- [x] Prix d'achat & bénéfice (marge par produit et par formule)
- [x] Bilan financier (période choisie, export CSV, CA / coût / bénéfice)
- [x] Dons & produits offerts

### Équipe, sécurité & infra
- [x] Environnement de test séparé (base de données isolée, accès restreint)
- [x] Comptes nommés & rôle limité (admin complet vs accès développeur)
- [x] Durcissement serveur (HTTPS, pare-feu, isolation systemd — détail dans [`SECURITY.md`](./SECURITY.md))

---

## Feuille de route

Le modèle "événement" est la fondation du reste — on l'attaque en premier.
Les statistiques et la gestion d'équipe en dépendent directement.

### 01 — Modèle événement / projet — 🔜 Prochain

Faire évoluer les templates de catalogue en véritables événements datés :
chaque vente (une piscine, un partiel, une soirée…) garde son propre
catalogue, ses commandes et son historique — réutilisable telle quelle par
une autre équipe l'année suivante.

### 02 — Statistiques & graphiques par événement — 📋 Prévu

Visualiser l'évolution des ventes d'un événement à l'autre, comparer les
éditions.

*Dépend de : 01*

### 03 — Gestion d'équipe par événement — 📋 Prévu

Postes personnalisables (caisse, préparation…), nombre de personnes
nécessaires, affectation nominative optionnelle — pour voir d'un coup d'œil
les ressources humaines à prévoir.

*Dépend de : 01*

### 04 — Notifications de commandes — 📋 Prévu

Notification navigateur (push) à l'arrivée d'une commande, activable/
désactivable par chaque membre admin.

### 05 — Liste de courses automatique — 📋 Prévu

À partir des seuils de stock, générer quoi racheter et en quelle quantité
avant le prochain événement.

### 06 — Hiérarchie des rôles dans l'app — 📋 Prévu

Bureau / Admin / Staff / Membre — des permissions plus fines que le simple
"admin ou pas" actuel.

### 🔧 À corriger — Créneaux horaires de retrait

Le découpage précis (9h–18h toutes les 15 min) ne correspond pas à un usage
réel et sera retiré au profit d'un modèle plus simple.

---

## Comment on travaille

```
branche dev → dev.bde42perpignan.fr → merge main → bde42perpignan.fr
```

La prod n'est jamais modifiée sans être passée par le staging.

| Rôle | Droits |
|---|---|
| **Admin** | Accès serveur complet, mot de passe requis. Peut créer les comptes de l'équipe. |
| **Bde-ops** | Build & déploiement du staging en autonomie. Lecture seule sur la prod, aucun accès root. |

Documentation technique : [`SECURITY.md`](./SECURITY.md) · [`infra/README.md`](./infra/README.md)

Ajouter un membre à l'équipe :
```bash
sudo infra/add-team-member.sh <username> <pseudo-github> ops
```

---

*Dernière mise à jour : 2026-09-11*
