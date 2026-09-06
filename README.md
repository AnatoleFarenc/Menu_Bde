# 🥪 BDE Sandwich 42 - Application de Précommande & Vitrine

Plateforme de précommande de repas et sandwichs pour le BDE de l'École 42 avec connexion via l'API Intra 42, gestion de vitrine et tableau de bord de préparation cuisine par tranche horaire.

## 🚀 Options d'Installation (Sans NPM nécessaire)

Vous avez **2 options très simples** pour lancer le projet sur votre Mac :

### Option A : Installer Node.js & NPM avec Homebrew (Recommandé)
Puisque **Homebrew** est déjà installé sur votre Mac, vous pouvez installer `node` (qui inclut `npm`) avec une seule commande :

```bash
brew install node
```

Ensuite dans le dossier du projet :
```bash
cd /Users/alix/.gemini/antigravity/scratch/bde-sandwich-42
npm install
npm run dev
```


### Option B : Lancer avec Docker (Sans installer Node/NPM)
Puisque **Docker** est disponible sur votre Mac, vous pouvez lancer directement l'application sans rien installer de plus :

```bash
cd /Users/alix/.gemini/antigravity/scratch/bde-sandwich-42
docker compose up --build
```
L'application sera accessible sur `http://localhost:3000`.


# BDE Sandwich 42

Application web de précommande pour la sandwicherie du BDE de l'École 42. Elle permet aux étudiants de consulter la vitrine, composer des menus, passer une commande et suivre son état. Les membres du BDE disposent d'un espace d'administration pour gérer les produits, les stocks et la préparation des commandes.

## Fonctionnement

Le projet est composé de deux parties lancées ensemble par `npm run dev` :

- **Frontend** : interface React servie par Vite sur `http://localhost:3000`.
- **Backend** : API Express sur le port `5001`. Vite redirige automatiquement les requêtes `/api` vers cette API.

Les données sont stockées localement dans `server/data/db.json`. Le fichier est créé avec les produits et menus par défaut s'il n'existe pas, puis mis à jour lors des modifications ou des commandes.

### Parcours étudiant

1. L'étudiant consulte les produits et les formules disponibles dans la vitrine.
2. Il peut ajouter des produits ou composer une formule avec un plat, une boisson et éventuellement un dessert.
3. Il choisit un créneau de retrait, ajoute une note si nécessaire, puis valide sa commande.
4. Il consulte ses commandes et leur statut depuis l'onglet **Mes Commandes**.

### Authentification

L'authentification se fait avec OAuth2 via l'API Intra 42. Une connexion 42 est obligatoire pour passer une commande.

Les sessions sont conservées en mémoire par le serveur. Un redémarrage du serveur déconnecte donc les utilisateurs, mais ne supprime pas les produits ni les commandes enregistrés dans `server/data/db.json`.

### Espace administrateur BDE

Un administrateur peut accéder à :

- la liste des commandes, filtrable par créneau et par statut ;
- la synthèse des produits à préparer pour chaque créneau ;
- la mise à jour du statut d'une commande : en attente, en préparation, prête, récupérée ou annulée ;
- la création, modification et suppression des produits et des menus ;
- l'activation ou la désactivation des produits et menus selon les stocks.

## Lancement sous Linux

### Prérequis

- Node.js 18 ou une version plus récente (Node.js 20 est recommandé) ;
- npm, installé avec Node.js.

Pour vérifier l'installation :

```bash
node --version
npm --version
```

Sur Ubuntu ou Debian, Node.js peut être installé avec :

```bash
sudo apt update
sudo apt install -y nodejs npm
```

Pour utiliser une version récente de Node.js, l'installation via [NodeSource](https://github.com/nodesource/distributions) ou `nvm` est préférable.

### Installation et démarrage

Depuis le dossier du projet :

```bash
cd /home/anate/Documents/Menu_Bde
npm install
npm run dev
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000) dans un navigateur.

La commande `npm run dev` démarre le frontend et le backend en parallèle. Les messages du serveur indiquent notamment que l'API écoute sur `http://localhost:5001`. Pour arrêter les deux services, appuyer sur `Ctrl+C` dans le terminal.

### Commandes disponibles

```bash
npm run dev           # démarre le frontend et l'API en mode développement
npm run client        # démarre uniquement Vite
npm run server        # démarre uniquement l'API Express
npm run build         # construit le frontend pour la production
npm run preview       # prévisualise le build frontend
npm run start:public  # build + serveur + URL HTTPS stable (Tailscale Funnel)
```

## Configuration OAuth2 Intra 42

Pour activer la connexion avec un compte 42 :

1. Créer une application OAuth sur [profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications).
2. Y déclarer **plusieurs Redirect URIs, une bonne fois pour toutes** (l'app 42 en accepte plusieurs) :
   - `http://localhost:5001/api/auth/42/callback` (tests locaux) ;
   - l'URL publique stable, ex. `https://bde-42.mon-tailnet.ts.net/api/auth/42/callback` (voir section suivante).
3. Créer un fichier `.env` à la racine du projet :

```env
NODE_ENV=production
PORT=5001
# Unique URL à renseigner. La Redirect URI OAuth en est déduite automatiquement
# (<PUBLIC_APP_URL>/api/auth/42/callback).
PUBLIC_APP_URL=http://localhost:5001
INTRA42_CLIENT_ID=votre_uid_intra
INTRA42_CLIENT_SECRET=votre_secret_intra
ADMIN_LOGINS=login_bde_1,login_bde_2
```

`ADMIN_LOGINS` contient, séparés par des virgules, les logins 42 autorisés à accéder à l'espace BDE. Seuls ces logins peuvent administrer les commandes, les produits et les menus.

> `INTRA42_REDIRECT_URI` n'est plus nécessaire : elle est calculée depuis `PUBLIC_APP_URL`.
> Ne la remets que si tu veux forcer une valeur différente. Au démarrage, le serveur
> affiche l'URL publique et la Redirect URI effectivement utilisées.

## Accès public avec une URL stable (Tailscale Funnel)

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) expose le serveur du PC derrière
une **URL HTTPS fixe** du type `https://bde-42.mon-tailnet.ts.net`, gratuitement, sans
acheter de nom de domaine, sans ouvrir de port sur la box, et **sans page d'avertissement**.

L'URL ne change jamais tant que le nom de la machine (`--hostname`) et le tailnet restent
identiques : `.env` et l'application OAuth 42 se configurent **une seule fois**.

### Installation (une seule fois)

1. Créer un compte sur [tailscale.com](https://tailscale.com/) (connexion Google/GitHub possible).
2. Installer Tailscale dans WSL :

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

3. Activer **HTTPS** et **Funnel** pour le tailnet dans la console d'administration :
   - <https://login.tailscale.com/admin/dns> → activer *HTTPS Certificates* ;
   - <https://login.tailscale.com/admin/settings/funnel> → autoriser Funnel.
   (Au premier `tailscale funnel`, un lien d'activation est affiché si ce n'est pas fait.)

### Lancement (à chaque fois)

```bash
cd /home/anate/Documents/Menu_Bde
npm install        # la première fois seulement
npm run start:public
```

Le script `scripts/start-public.sh` :

1. démarre `tailscaled` en mode *userspace* (adapté à WSL2) si besoin ;
2. connecte la machine au tailnet (lien d'authentification au tout premier lancement) ;
3. affiche l'**URL publique stable** et la **Redirect URI** à déclarer ;
4. construit le frontend (`npm run build`) ;
5. ouvre le Funnel `443 → localhost:5001` ;
6. démarre le serveur. `Ctrl+C` referme le Funnel et arrête tout.

Après le tout premier lancement, renseigner dans `.env` :

```env
PUBLIC_APP_URL=https://bde-42.mon-tailnet.ts.net
```

et ajouter `https://bde-42.mon-tailnet.ts.net/api/auth/42/callback` comme Redirect URI
dans l'application OAuth 42. **Ces deux valeurs ne bougent plus ensuite.**

> Variables utiles : `TS_HOSTNAME` (nom de la machine, défaut `bde-42`) et `PORT` (défaut `5001`).
> Exemple : `TS_HOSTNAME=bde npm run start:public`.

### Ton propre nom de domaine (Cloudflare Tunnel)

Le domaine utilisé est `bde42perpignan.fr` (chez IONOS), exposé sur
`https://emporium.bde42perpignan.fr` via un tunnel Cloudflare nommé — gratuit, HTTPS
automatique, aucun port à ouvrir sur la box.

**Configuration unique (une seule fois) :**

1. Ajoute `bde42perpignan.fr` comme site sur [dash.cloudflare.com](https://dash.cloudflare.com)
   (plan Free) : Cloudflare donne 2 nameservers à renseigner.
2. Chez IONOS, dans la gestion du domaine, remplace les nameservers actuels par ceux de
   Cloudflare. La propagation peut prendre de quelques minutes à 24-48h ; Cloudflare
   envoie un mail quand le domaine est actif.
3. Une fois le domaine actif sur Cloudflare :
   ```bash
   cloudflared tunnel login                                      # ouvre le navigateur, autorise le domaine
   cloudflared tunnel create bde42-emporium                       # crée le tunnel + son fichier de credentials
   cloudflared tunnel route dns bde42-emporium emporium.bde42perpignan.fr   # crée le DNS automatiquement
   ```
4. Lance tout avec :
   ```bash
   npm run start:domain
   ```
   Le script `scripts/start-domain.sh` génère `~/.cloudflared/config.yml` au premier
   lancement, build le frontend, ouvre le tunnel puis démarre le serveur.
5. À faire une fois affiché par le script :
   - dans `.env` → `PUBLIC_APP_URL=https://emporium.bde42perpignan.fr` (supprime
     `INTRA42_REDIRECT_URI` s'il était défini) ;
   - dans l'app OAuth 42 → ajoute `https://emporium.bde42perpignan.fr/api/auth/42/callback`
     comme Redirect URI (garde l'ancienne le temps de la transition).

> Variables utiles : `TUNNEL_NAME` (défaut `bde42-emporium`), `HOSTNAME` (défaut
> `emporium.bde42perpignan.fr`), `PORT` (défaut `5001`).

Le code n'a pas à changer : seule `PUBLIC_APP_URL` est modifiée. Pour changer de
sous-domaine plus tard, relance simplement `cloudflared tunnel route dns` avec le nouveau
nom et adapte `HOSTNAME` + `.env`.

### Dépannage rapide

- `client_id=undefined` : `INTRA42_CLIENT_ID` manque dans `.env` ou le serveur n'a pas été redémarré.
- `redirect_uri mismatch` : la Redirect URI déclarée dans l'app 42 et celle affichée au
  démarrage du serveur ne sont pas **strictement** identiques (schéma, sous-domaine, `/api/...`).
- `EADDRINUSE` sur le port `5001` : un ancien serveur tourne déjà ; `Ctrl+C` avant de relancer.
- `tailscale: command not found` : réouvrir le terminal WSL après l'installation.
- Funnel refusé : HTTPS/Funnel pas encore activés dans la console d'administration Tailscale.

## Docker

Le projet peut être hébergé sur un PC du réseau local avec Docker :

```bash
docker compose up --build -d
```

L'application sera accessible depuis ce PC sur `http://localhost:5001` et depuis un autre appareil sur `http://ADRESSE_IP_DU_PC:5001`. Dans `.env`, utilisez cette même adresse pour `INTRA42_REDIRECT_URI`, et déclarez exactement cette URL comme Redirect URI dans l'application OAuth 42. Le fichier `server/data/db.json` est conservé par le volume Docker.
