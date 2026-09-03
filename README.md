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


## 🔑 Configuration OAuth2 API 42

Pour utiliser votre propre application Intra 42 :
1. Allez sur [https://profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications) et créez une nouvelle application.
2. Définissez le **Redirect URI** : `http://localhost:3000/api/auth/42/callback`
3. Créez un fichier `.env` à la racine et renseignez vos identifiants :

```env
PORT=5001
INTRA42_CLIENT_ID=votre_uid_intra
INTRA42_CLIENT_SECRET=votre_secret_intra
INTRA42_REDIRECT_URI=http://localhost:3000/api/auth/42/callback
ADMIN_LOGINS=login_bde_1,login_bde_2
```

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
npm run dev      # démarre le frontend et l'API en mode développement
npm run client   # démarre uniquement Vite
npm run server   # démarre uniquement l'API Express
npm run build    # construit le frontend pour la production
npm run preview  # prévisualise le build frontend
```

## Configuration OAuth2 Intra 42 (optionnelle)

Pour activer la connexion avec un compte 42 :

1. Créer une application OAuth sur [profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications).
2. Utiliser cette URL de redirection : `http://localhost:3000/api/auth/42/callback`.
3. Créer un fichier `.env` à la racine du projet avec les variables suivantes :

```env
PORT=5001
INTRA42_CLIENT_ID=votre_uid_intra
INTRA42_CLIENT_SECRET=votre_secret_intra
INTRA42_REDIRECT_URI=http://localhost:3000/api/auth/42/callback
ADMIN_LOGINS=alix,admin,bde_admin,president_bde
```

`ADMIN_LOGINS` contient, séparés par des virgules, les logins 42 autorisés à accéder à l'espace BDE. Seuls ces logins peuvent administrer les commandes, les produits et les menus.

## Docker

Le projet peut être hébergé sur un PC du réseau local avec Docker :

```bash
docker compose up --build -d
```

L'application sera accessible depuis ce PC sur `http://localhost:5001` et depuis un autre appareil sur `http://ADRESSE_IP_DU_PC:5001`. Dans `.env`, utilisez cette même adresse pour `INTRA42_REDIRECT_URI`, et déclarez exactement cette URL comme Redirect URI dans l'application OAuth 42. Le fichier `server/data/db.json` est conservé par le volume Docker.
