# Sandwich BDE

Site de commande de sandwichs pour le BDE : vitrine de produits (plats, boissons,
desserts, suppléments) + menus, connexion via l'intra 42, et une partie admin
pour gérer le catalogue et suivre les commandes à préparer.

Stack volontairement minimale : **Node.js + Express**, **SQLite** (un seul
fichier `data.sqlite`, aucun serveur de base de données à installer), et un
front en HTML/CSS/JS vanilla (pas de build, pas de framework front).

## 1. Créer l'application sur l'intra 42

1. Va sur https://profile.intra.42.fr/oauth/applications/new
2. Nom : ce que tu veux (ex. "Sandwich BDE")
3. Redirect URI : `http://localhost:3000/auth/42/callback` en local
   (à remplacer par ton URL réelle une fois déployé, ex.
   `https://sandwich.mondomaine.fr/auth/42/callback`)
4. Scope : `public` suffit (on ne lit que login / email / nom / photo)
5. Note le **UID** (client id) et le **Secret** générés

## 2. Configuration

```bash
cp .env.example .env
```

Remplis `.env` :
- `FORTYTWO_CLIENT_ID` / `FORTYTWO_CLIENT_SECRET` : donnés par l'intra
- `FORTYTWO_CALLBACK_URL` : doit correspondre EXACTEMENT à la redirect URI déclarée
- `ADMIN_LOGINS` : logins intra (séparés par des virgules) qui doivent avoir
  les droits admin, ex. `ADMIN_LOGINS=anfarenc,bde_login2`
- `SESSION_SECRET` : une chaîne aléatoire longue (`openssl rand -hex 32`)

## 3. Installation et lancement

```bash
npm install
npm start
```

Le site tourne sur http://localhost:3000 (vitrine) et
http://localhost:3000/admin.html (admin, réservé aux logins listés dans
`ADMIN_LOGINS`).

La base SQLite (`data.sqlite`) est créée automatiquement au premier lancement.

## 4. Utilisation

- **Élèves** : se connectent via "Se connecter avec l'intra 42", parcourent
  les onglets (Plats / Boissons / Desserts / Suppléments / Menus), ajoutent au
  panier, choisissent un créneau de retrait, valident.
- **Admin** : dans `/admin.html`, onglet "Produits" pour ajouter/retirer des
  produits de la vitrine (le bouton "Retirer" masque le produit sans le
  supprimer, pratique en rupture de stock), onglet "Menus" pour composer des
  menus à partir des produits existants, onglet "Commandes" pour voir toutes
  les commandes à préparer (triées par créneau) et changer leur statut
  (pending → confirmed → ready).

Le premier admin doit être ajouté via `ADMIN_LOGINS` dans `.env` **avant** sa
première connexion (le statut admin est appliqué à la création/mise à jour du
compte). Pour ajouter un admin après coup, ajoute son login à `ADMIN_LOGINS`
et redémarre le serveur, puis demande-lui de se reconnecter (ou de recharger
la page si sa session est déjà ouverte, la MAJ se fait à la prochaine connexion
OAuth).

## 5. Déploiement (via GitHub)

Le repo est prêt à être poussé sur GitHub tel quel (`.env` et `data.sqlite`
sont ignorés par `.gitignore`).

Options simples pour héberger un backend Node à partir d'un repo GitHub :
- **Render** (render.com) : "New Web Service" → connecte le repo → build
  command `npm install`, start command `npm start` → ajoute les variables
  d'environnement du `.env` dans le dashboard.
- **Railway** (railway.app) : pareil, détection automatique de Node.
- **Sur ton home-lab** (tu as déjà l'expérience Docker avec Inception) : un
  simple `Dockerfile` + reverse proxy NGINX + TLS suffit, je peux te le
  générer si tu veux repartir sur ce pattern.

Dans tous les cas : pense à mettre à jour `FORTYTWO_CALLBACK_URL` dans `.env`
**et** la redirect URI déclarée sur l'intra 42 avec l'URL publique finale
(elles doivent matcher au caractère près), et à servir le site en HTTPS
(l'intra 42 l'exige pour l'OAuth en production).

## Structure du projet

```
server/
  index.js          # point d'entrée Express
  db.js             # schéma SQLite
  middleware/auth.js
  routes/
    auth.js         # OAuth2 42 (login, callback, logout, /me)
    products.js      # CRUD produits (public en lecture, admin en écriture)
    menus.js          # CRUD menus (combos de produits)
    orders.js          # passage de commande + vue admin des commandes
public/
  index.html + js/app.js     # vitrine + commande
  admin.html + js/admin.js   # gestion catalogue + suivi commandes
  css/style.css
```

## Pistes d'amélioration (pas implémentées)

- Créneaux de retrait prédéfinis (plutôt qu'un champ libre) pour lisser la
  charge en cuisine
- Export CSV/PDF de la liste de préparation pour une plage horaire donnée
- Notifications (email/Slack) à l'admin à chaque nouvelle commande
- Limite de commandes par créneau
