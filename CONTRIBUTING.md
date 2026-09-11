# Contribuer au projet

Guide pratique pour travailler à plusieurs sur le repo sans se marcher dessus.
Ce sont les mêmes mécanismes qu'en entreprise — on les applique volontairement
ici aussi (voir "Ambition professionnelle" dans [`ROADMAP.md`](./ROADMAP.md)).

## Les 3 environnements

```
ta machine (local)  →  dev.bde42perpignan.fr (staging)  →  bde42perpignan.fr (prod)
```

- **Local** : sur ta machine, base de données à toi, pour itérer vite.
- **Staging** : partagé par l'équipe, sert à vérifier qu'une fonctionnalité
  marche une fois vraiment déployée, avant que de vrais étudiants la voient.
- **Prod** : jamais modifiée directement. On n'y déploie que ce qui a déjà
  été validé sur staging.

Le code ne saute jamais une étape : `local → dev → main` (jamais `local → main`).

## Le modèle de branches

- `main` = ce qui tourne en prod.
- `dev` = ce qui tourne en staging. C'est la branche d'intégration de l'équipe.
- Chaque tâche = **sa propre branche**, créée à partir de `dev` :

```bash
git checkout dev
git pull
git checkout -b feature/nom-de-la-tache      # ou fix/..., chore/...
```

Travaille dessus, commit, puis :

```bash
git push -u origin feature/nom-de-la-tache
```

Ouvre une **Pull Request vers `dev`** sur GitHub (pas vers `main`). Quelqu'un
d'autre de l'équipe relit avant de merger — c'est la règle numéro 1 pour éviter
qu'un bug ou un conflit silencieux parte en staging sans que personne d'autre
ne l'ait vu. Une fois mergée, le staging est redéployé (`infra/deploy-staging.sh`)
et tout le monde peut aller tester sur `dev.bde42perpignan.fr`.

Quand plusieurs fonctionnalités validées sur staging sont prêtes à partir en
prod, on ouvre une PR `dev → main`, et on déploie avec `infra/deploy-prod.sh`.

**Comment éviter de se marcher dessus à 4 :**
- Une branche = une tâche, la plus petite possible. Des PR courtes se relisent
  vite et se mergent vite, donc restent peu de temps "en conflit potentiel".
- On se répartit le travail par fichier/fonctionnalité autant que possible
  (ex: quelqu'un sur le modèle événement, quelqu'un sur les notifications) —
  moins de chances de toucher les mêmes lignes en même temps.
- Avant d'ouvrir sa PR, on remet sa branche à jour avec `dev` :
  ```bash
  git checkout dev && git pull
  git checkout feature/nom-de-la-tache
  git merge dev            # ou : git rebase dev
  ```
  Ça fait apparaître les conflits éventuels tout de suite, sur sa propre
  machine, plutôt que de laisser GitHub bloquer la fusion plus tard.
- On garde `server/data/db.json` **hors Git** (déjà dans `.gitignore`) : chaque
  environnement (ton PC, staging, prod) a ses propres données, donc pas de
  conflit possible sur "qui a quelles commandes/produits" pendant le dev.

## Tester en local (comme en entreprise)

En entreprise, avant qu'un changement parte où que ce soit, on le fait tourner
sur sa propre machine. Ici c'est pareil :

1. **Chacun son `.env`** (jamais commité — voir `.env.example`) :
   ```bash
   cp .env.example .env
   ```
   Laisse `PUBLIC_APP_URL=http://localhost:5001` : c'est déjà prévu pour le
   test local, la redirect URI OAuth en est déduite automatiquement.

2. **Connexion 42 en local** : la connexion Intra 42 passe par l'app OAuth
   "dev" (celle utilisée pour le staging). Pour que ça marche aussi en local,
   il faut ajouter `http://localhost:5001/api/auth/42/callback` à la liste
   des **Redirect URI** de cette app OAuth, en plus de celle de staging
   (https://profile.intra.42.fr/oauth/applications → app "dev" → Redirect URI).
   C'est une modification à faire une seule fois, par quelqu'un qui a accès à
   cette app OAuth.

3. **Lancer le projet** :
   ```bash
   npm install
   npm run dev      # backend (5001) + frontend (5173) en parallèle
   ```
   Chaque personne a sa propre base `server/data/db.json`, créée
   automatiquement au premier lancement — aucun risque d'écraser les données
   de quelqu'un d'autre.

4. Une fois que ça marche en local → push la branche → PR vers `dev` → ça part
   en staging → l'équipe vérifie là-bas dans les mêmes conditions que la prod
   (HTTPS, vrai domaine) → puis direction `main`.

## Règles GitHub à activer (à faire une fois, dans les Settings du repo)

À configurer manuellement sur github.com (Settings → Branches → Branch
protection rules), pas automatisable depuis cette session :

- Sur `dev` et `main` : **"Require a pull request before merging"** +
  **"Require approvals"** (au moins 1) — personne ne peut pousser directement
  dessus, même les admins du repo.
- Optionnel une fois une CI en place (voir `ROADMAP.md`) :
  **"Require status checks to pass before merging"**.

## Convention de commit

Pas de norme stricte imposée, mais préférer des messages qui disent le
**pourquoi** plutôt que juste le quoi (ex: `fix: recalcule le stock après
annulation d'une commande offerte` plutôt que `fix bug`).
