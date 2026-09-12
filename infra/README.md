# infra/

Configuration serveur versionnée (VPS OVH, `bde42perpignan.fr`).

## Contenu

| Fichier | Rôle |
|---|---|
| `authorized_keys` | clés SSH du compte de déploiement `debian` (voir plus bas) |
| `sync-authorized-keys.sh` | applique `authorized_keys` au compte courant (anti-lockout + sauvegarde) |
| `add-ssh-user.sh <pseudo-github>` | importe des clés GitHub dans `authorized_keys` (pour `debian`) |
| `add-team-member.sh <user> <pseudo-github> [ops\|admin]` | **crée un compte nommé** pour un membre de l'équipe (voir §3) |
| `systemd/bde-menu.service` | service prod (port 5001), tourne sous `bde-app` |
| `systemd/bde-menu-staging.service` | service staging (port 5002), tourne sous `bde-app-staging` |
| `sudoers.d/20-bde-ops` | droits limités du groupe `bde-ops` (copie versionnée de `/etc/sudoers.d/`) |
| `deploy-prod.sh` / `deploy-staging.sh` | `git pull` + build + redémarrage (copies dans `~debian/`) |
| `setup-mariadb.sh` | installe et configure MariaDB (prod + staging), voir §6 |

---

## 1. Utilisateurs du VPS — vue d'ensemble

| Compte | Rôle | Droits |
|---|---|---|
| `root` | super-utilisateur | via `sudo` uniquement |
| **groupe `sudo`** (ex: `anfarenc`) | administrateur(s) | `sudo` complet, **mot de passe requis** |
| **groupe `bde-ops`** (coéquipiers) | accès développeur limité | voir §2 — pas de root |
| `debian` | compte de déploiement automatisé | `sudo` restreint à des commandes précises (déploiement/redémarrage) — voir §4 |
| `bde-app` | fait tourner la **prod**, et seulement ça | aucun shell, aucun `sudo` |
| `bde-app-staging` | fait tourner le **staging**, et seulement ça | aucun shell, aucun `sudo` — **séparé de `bde-app`** : ne peut pas toucher aux fichiers de prod |
| `caddy` | reverse proxy | aucun shell |

Chaque environnement (prod / staging) a son **propre utilisateur système propriétaire du code**
— un accès à l'un ne donne strictement aucun accès à l'autre.

---

## 2. Le groupe `bde-ops` (coéquipiers)

Un compte `bde-ops` peut, **sans mot de passe** :
- agir librement en tant que `bde-app-staging` (`git pull`, `npm install`, `npm run build`
  dans `/opt/Menu_Bde-staging` — jamais dans la prod)
- redémarrer / consulter le statut / les logs du **staging**
- consulter (lecture seule) le statut et les logs de la **prod** et de **Caddy**

Il **ne peut pas** : redémarrer ou modifier la prod, installer des paquets, créer des
comptes, éditer un fichier système, exécuter `add-team-member.sh` (droits sudo trop
restreints pour ça — vérifiable via `sudo -l`).

Règles exactes : [`sudoers.d/20-bde-ops`](sudoers.d/20-bde-ops).

---

## 3. Ajouter un membre de l'équipe

```bash
sudo infra/add-team-member.sh <username> <pseudo-github> [ops|admin]
```

- **Doit être lancé par un administrateur** (compte du groupe `sudo`) — un compte
  `bde-ops` ou `debian` ne peut pas l'exécuter, leurs droits sudo sont trop limités.
- Importe les clés SSH publiques depuis `https://github.com/<pseudo>.keys`.
- `ops` (par défaut) → groupe `bde-ops` (§2). `admin` → groupe `sudo` (accès complet).
- Génère un **mot de passe temporaire fort**, affiché une seule fois : à transmettre
  à la personne **hors de ce terminal** (message chiffré, en main propre…), jamais
  par ce canal. Changement **obligatoire** à la première connexion (`chage -d 0`).
- Journalise l'action dans `/var/log/bde-team-changes.log` (qui, quand, pour qui,
  quel rôle — jamais le mot de passe).

### Retirer un accès
```bash
sudo userdel -r <username>
```

---

## 4. Le compte `debian` (déploiement automatisé)

`debian` sert uniquement à orchestrer les déploiements (`deploy-prod.sh`,
`deploy-staging.sh`). Ses droits `sudo` sont restreints aux commandes strictement
nécessaires à ça (agir en `bde-app`/`bde-app-staging`, redémarrer les deux services) —
pas de `sudo` généraliste. Les clés autorisées sur ce compte sont dans
`authorized_keys` (ci-dessus), gérées via `sync-authorized-keys.sh` / `add-ssh-user.sh`.

---

## 5. Politique de mot de passe

`libpam-pwquality` impose, pour tout compte du serveur :
- **20 caractères minimum** (comptes à privilèges — recommandation ANSSI)
- au moins 2 classes de caractères, pas plus de 3 caractères identiques à la suite
- vérification contre un dictionnaire de mots de passe faibles
- s'applique aussi à `root`

Config : `/etc/security/pwquality.conf` (non versionnée — locale au serveur).

---

## 6. Base de données MariaDB

Une seule instance MariaDB sur le VPS, avec deux bases isolées (`bde_sandwich` en
prod, `bde_sandwich_staging` en staging) et un utilisateur dédié par base, à droits
limités à cette seule base — même logique que la séparation `bde-app` / `bde-app-staging`.

### Sur le VPS (une seule fois)

```bash
sudo infra/setup-mariadb.sh
```

Installe MariaDB, le restreint à `localhost` (jamais exposé sur Internet — aucune
règle `ufw` à ouvrir), crée les deux bases et leurs utilisateurs, puis affiche
**une seule fois** les deux `DATABASE_URL` à coller dans :
- `/opt/Menu_Bde/.env` (prod)
- `/opt/Menu_Bde-staging/.env` (staging)

Les migrations (création des tables) sont appliquées automatiquement à chaque
déploiement par `deploy-prod.sh`/`deploy-staging.sh` (`npx prisma migrate deploy`).

**Une seule fois, pour reprendre les données existantes** de
`server/data/db.json` (produits, formules, commandes, templates) :
```bash
sudo -u bde-app node prisma/import-from-json.mjs        # prod
sudo -u bde-app-staging node prisma/import-from-json.mjs # staging
```
À lancer juste après le tout premier déploiement (une fois les tables créées),
jamais après — il duplique les données s'il est relancé sur une base déjà peuplée.

### En local (chaque développeur, sur sa propre machine)

Pas d'installation native : MariaDB tourne dans Docker, une base jetable propre à
chaque machine (comme `server/data/db.json` aujourd'hui).

1. [Installer Docker](https://docs.docker.com/get-docker/) si besoin.
2. Depuis la racine du projet :
   ```bash
   docker compose up -d mariadb
   ```
3. Dans `.env` (copié depuis `.env.example`), garder tel quel :
   ```env
   DATABASE_URL="mysql://bde_app:devpassword@localhost:3306/bde_sandwich"
   ```
   (identifiants de dev local uniquement, définis dans `docker-compose.yml` —
   sans rapport avec les mots de passe générés côté VPS.)
4. `npm run dev` comme d'habitude.

Pour arrêter/réinitialiser la base locale :
```bash
docker compose down            # arrête
docker compose down -v         # arrête ET efface les données locales
```

---

## 7. Détails

- Port SSH : **2231** · connexion par **clé uniquement** · pas de login `root`.
- Pare-feu `ufw` : ouverts 2231 / 80 / 443 uniquement.
- HTTPS : Caddy + Let's Encrypt automatique.
- Durcissement systemd des deux services : `ProtectSystem=strict`, `NoNewPrivileges`,
  `PrivateTmp`, capacités vidées, etc. — détails dans `SECURITY.md` à la racine du dépôt.
