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

---

### Option B : Lancer avec Docker (Sans installer Node/NPM)
Puisque **Docker** est disponible sur votre Mac, vous pouvez lancer directement l'application sans rien installer de plus :

```bash
cd /Users/alix/.gemini/antigravity/scratch/bde-sandwich-42
docker compose up --build
```
L'application sera accessible sur `http://localhost:3000`.

---

## 🔑 Configuration OAuth2 API 42 (Optionnel)

Pour utiliser votre propre application Intra 42 :
1. Allez sur [https://profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications) et créez une nouvelle application.
2. Définissez le **Redirect URI** : `http://localhost:3000/api/auth/42/callback`
3. Copiez le fichier `.env.example` en `.env` et renseignez vos identifiants :

```env
PORT=5000
INTRA42_CLIENT_ID=votre_uid_intra
INTRA42_CLIENT_SECRET=votre_secret_intra
INTRA42_REDIRECT_URI=http://localhost:3000/api/auth/42/callback
ADMIN_LOGINS=alix,admin,bde_admin,president_bde
```
