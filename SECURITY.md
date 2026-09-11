# Sécurité

Ce document décrit les mesures de sécurité en place sur l'application BDE Sandwicherie
(site de précommande de repas pour l'École 42), son hébergement et son cycle de vie.
Il est tenu à jour à chaque évolution significative.

---

## 1. Architecture

```
Navigateur ──HTTPS──►  Caddy (reverse proxy, :80/:443)  ──HTTP local──►  Node/Express (:5001)
                              │                                                │
                              └── obtient/renouvelle le certificat            └── server/data/db.json
                                  Let's Encrypt automatiquement                    (base de données fichier)
```

- **1 VPS** (OVH, Debian 13), 2 services : production (`bde42perpignan.fr`, :5001) et
  pré-production (`dev.bde42perpignan.fr`, :5002), isolés (dossiers, bases, services systemd séparés).
- Le serveur Node n'est **jamais exposé directement** : seul Caddy écoute sur l'extérieur.

---

## 2. Sécurité du transport

| Mesure | Détail |
|---|---|
| **HTTPS partout** | Certificats Let's Encrypt obtenus et renouvelés automatiquement par Caddy (ACME, challenge TLS-ALPN). Aucune clé privée à gérer à la main. |
| **HSTS** | En-tête `Strict-Transport-Security: max-age=31536000; includeSubDomains` — le navigateur refuse le HTTP en clair pour ce domaine pendant 1 an. |
| **Redirection HTTP → HTTPS** | Gérée par Caddy (`upgrade-insecure-requests` + redirection 308). |

---

## 3. Durcissement du serveur (VPS)

### Accès SSH
- Port **non standard (2231)** — réduit fortement le bruit des scans automatisés.
- **Authentification par clé uniquement** — `PasswordAuthentication no`. Aucune connexion par mot de passe possible.
- Pas de connexion `root` : compte `debian` avec `sudo`.
- Les clés autorisées sont gérées **en tant que code** (voir §7).

### Pare-feu
- `ufw` actif, politique par défaut **deny (entrant)**.
- Ports ouverts : **22→2231** (SSH), **80** et **443** (Caddy) uniquement.
- Les ports applicatifs **5001 / 5002 sont bloqués** de l'extérieur (accès uniquement en `localhost` via Caddy) — vérifié.

### Comptes du VPS

| Compte | Rôle | Shell / accès |
|---|---|---|
| `root` | super-utilisateur | atteignable uniquement via `sudo` |
| groupe **`sudo`** (ex: `anfarenc`) | administrateur humain nommé | SSH (clé), `sudo` complet **avec mot de passe** |
| groupe **`bde-ops`** (coéquipiers) | accès développeur limité | SSH (clé) ; `sudo` restreint au staging + lecture seule sur la prod (détails §7) |
| `debian` | compte de déploiement automatisé | SSH (clé), `sudo` — voir note ci-dessous |
| `bde-app` | fait tourner la **prod**, et seulement ça | **aucun shell** (`/usr/sbin/nologin`), **aucun `sudo`** |
| `bde-app-staging` | fait tourner le **staging**, et seulement ça — **compte séparé de `bde-app`** | aucun shell, aucun `sudo` |
| `caddy` | reverse proxy | aucun shell |

`bde-app` / `bde-app-staging` sont des comptes système créés spécifiquement pour
l'app (`useradd --system --no-create-home --shell /usr/sbin/nologin`), chacun
propriétaire du code de **son seul environnement**. Ni l'un ni l'autre ne peut se
connecter en SSH ni exécuter `sudo`. Objectif double :
1. si l'application est un jour compromise via une faille (RCE, dépendance vérolée…),
   l'attaquant hérite des droits du compte applicatif — pas de root, pas d'accès au
   reste du serveur ;
2. la séparation prod/staging garantit qu'une compromission (ou une erreur humaine)
   sur l'un des deux environnements **ne peut techniquement pas atteindre l'autre**,
   même en passant par `sudo`.

> ⚠️ **Décision assumée et temporaire** : `debian` garde encore un `sudo` large
> (pas restreint aux seules commandes de déploiement) pendant que l'infrastructure
> est activement construite. La restriction au strict nécessaire (voir la portée
> prévue en §9) sera appliquée une fois ce travail stabilisé.

### Services — isolation systemd

Chaque environnement tourne dans un service **systemd** dédié (`bde-menu`,
`bde-menu-staging`), sous son utilisateur applicatif dédié, avec un bac à sable renforcé :

| Directive | Effet |
|---|---|
| `User=bde-app` / `Group=bde-app` | le process ne tourne jamais en `debian` ni en `root` |
| `ProtectSystem=strict` | **tout le système de fichiers en lecture seule**, sauf : |
| `ReadWritePaths=…/server/data` | seul le dossier de données est accessible en écriture |
| `ProtectHome=true` | les `/home/*` (dont `debian`) sont inaccessibles |
| `PrivateTmp=true` | `/tmp` isolé, invisible pour les autres process |
| `PrivateDevices=true` | pas d'accès aux périphériques matériels |
| `NoNewPrivileges=true` | le process ne peut jamais gagner de privilèges (même via un binaire setuid) |
| `ProtectKernelTunables` / `ProtectKernelModules` / `ProtectKernelLogs` | pas de lecture/écriture des réglages ou modules noyau |
| `ProtectControlGroups`, `ProtectClock`, `ProtectHostname` | pas de modification de l'état système |
| `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX` | pas de sockets exotiques (Bluetooth, netlink brut…) |
| `RestrictNamespaces`, `RestrictSUIDSGID`, `LockPersonality` | pas de création de namespaces/conteneurs, pas de binaires setuid, pas de changement de personnalité syscall |
| `SystemCallFilter=@system-service` | seuls les appels système d'un service classique sont autorisés (allowlist) |
| `CapabilityBoundingSet=` (vide) | **aucune capability Linux** — même pas celles qu'un process non-root peut parfois avoir |
| `UMask=0077` | tout fichier créé par l'app est privé par défaut |

Résultat mesuré avec `systemd-analyze security bde-menu` : score d'exposition
**1.9 / "OK"** (un service Node par défaut, non durci, se situe généralement autour de 9-10).

- Redémarrage automatique au boot et en cas de crash (`Restart=always`).
- Mises à jour système appliquées (`apt upgrade`).
- Déploiement (`infra/deploy-prod.sh`, `infra/deploy-staging.sh`) : `debian`
  orchestre (`sudo systemctl restart …`) mais toutes les opérations sur les
  fichiers du code (`git pull`, `npm install`, `npm run build`) s'exécutent
  **sous l'identité applicative dédiée** (`sudo -u bde-app …` pour la prod,
  `sudo -u bde-app-staging …` pour le staging), jamais en `debian` direct.

---

## 4. Sécurité applicative

### En-têtes de sécurité (`helmet`)
Une **Content-Security-Policy** taillée sur les besoins réels de l'app :

| Directive | Valeur | Raison |
|---|---|---|
| `script-src` | `'self'` | le bundle JS est servi par l'app elle-même, aucun script tiers, aucun inline |
| `style-src` | `'self' 'unsafe-inline' fonts.googleapis.com` | styles inline React + feuille de polices Google |
| `font-src` | `'self' fonts.gstatic.com` | fichiers de polices Google |
| `img-src` | `'self' data: cdn.intra.42.fr profile.intra.42.fr` | emojis SVG en data-URI + avatars 42 |
| `connect-src` | `'self'` | les appels API sont same-origin |
| `form-action` | `'self' api.intra.42.fr` | redirection du flux OAuth 42 |
| `frame-ancestors` | `'none'` | anti-clickjacking |
| `object-src` | `'none'` | aucun plugin |

Également : `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: no-referrer`.

### CORS
Restreint à une **liste d'origines connues** (domaine public + `localhost` pour le dev).
Toute autre origine est refusée.

### Rate limiting (`express-rate-limit`)
| Portée | Limite |
|---|---|
| Global `/api/*` | 300 requêtes / minute / IP |
| Endpoints d'authentification (`/api/auth/*`) | 30 requêtes / 15 minutes / IP |

`trust proxy` est configuré pour que la limite s'applique à la **vraie IP client** (et non à celle de Caddy).

### Sessions
- Jeton de session = **`crypto.randomBytes(32)` encodé base64url** (256 bits d'entropie, imprévisible).
- **Expiration glissante de 12 h** : chaque requête authentifiée repousse l'échéance ; au-delà, le jeton est invalidé.
- Purge automatique des sessions expirées toutes les 30 minutes.
- Store **en mémoire** : un redémarrage du serveur déconnecte les utilisateurs (les données ne sont pas perdues). Choix assumé à cette échelle ; une migration vers un store persistant est possible.

### Authentification — OAuth2 Intra 42
- Connexion déléguée à l'**API OAuth2 de l'École 42**, scope minimal (`public`).
- **Protection CSRF** : un paramètre `state` aléatoire (128 bits) est généré à chaque
  demande de connexion et **vérifié au retour** ; usage unique, validité 10 minutes.
- Le `client_secret` n'est jamais exposé au navigateur (échange code → token fait côté serveur).

### Modèle d'autorisation
- Deux niveaux actuellement : **utilisateur 42** (peut commander, voir ses commandes, laisser un avis)
  et **administrateur BDE** (liste blanche de logins dans `ADMIN_LOGINS`).
- Toutes les routes `/api/admin/*` passent par **un seul middleware `requireAdmin`** —
  impossible d'oublier une vérification sur une nouvelle route admin.
- Les routes qui écrivent des données d'un utilisateur vérifient la **propriété** de la
  ressource (ex : un avis ne peut être posé que sur sa propre commande, et seulement si elle est récupérée).

### Validation des entrées
- Corps de requête limité à **1 Mo**.
- Les identifiants du mode borne sont validés contre un motif strict (`^[a-z0-9_-]{1,30}$`).
- Les montants/quantités sont convertis et bornés côté serveur (`parseFloat`/`parseInt`, minimums).
- Les statuts de commande sont validés contre une liste fermée.

---

## 5. Gestion des secrets

- Tous les secrets (identifiants OAuth 42, liste des admins…) sont dans un fichier **`.env`
  présent uniquement sur les serveurs**, jamais commité (`.gitignore` : `.env`, `.env.*`).
- Le dépôt ne contient qu'un `.env.example` sans valeurs réelles.
- Fichiers `.env` en permissions `600` (lecture propriétaire seul).

---

## 6. Isolation de la pré-production (staging)

- `dev.bde42perpignan.fr` tourne le code de la branche `dev`, avec **sa propre base de données**
  (les tests ne touchent jamais les vraies commandes).
- **Verrou d'accès** : la variable `STAGING_MODE=true` restreint la connexion aux seuls
  logins 42 listés dans `STAGING_ALLOWED_LOGINS`. Le mode borne y est désactivé.
- Aucune de ces variables n'existe en production → aucun effet sur le site public.

---

## 7. Comptes humains & onboarding de l'équipe

### Deux rôles

| Rôle | Groupe Linux | Droits |
|---|---|---|
| **Administrateur** | `sudo` | accès root complet, mot de passe requis à chaque usage |
| **Coéquipier** | `bde-ops` | accès "développeur" limité — voir la table détaillée en §3 (build/déploiement du staging en libre-service, lecture seule sur la prod, aucun root) |

### Créer un compte

```bash
sudo infra/add-team-member.sh <username> <pseudo-github> [ops|admin]
```

- **Ne peut être exécuté que par un administrateur** (le script exige d'être lancé
  en root via `sudo`, ce que ni `bde-ops` ni `debian` ne permettent — vérifiable
  avec `sudo -l`, testé explicitement).
- Importe la/les clé(s) SSH publique(s) depuis `https://github.com/<pseudo>.keys`
  (HTTPS, vérification du code HTTP et du format).
- Génère un **mot de passe temporaire fort**, affiché une seule fois à l'écran (jamais
  écrit sur disque ni journalisé), à transmettre à la personne hors du terminal.
  Changement **obligatoire à la première connexion** (`chage -d 0`).
- **Journal d'audit** (`/var/log/bde-team-changes.log`) : date, administrateur à
  l'origine, compte créé, rôle — jamais le mot de passe.

### Politique de mot de passe (`libpam-pwquality`)

S'applique à **tous** les comptes du serveur, y compris `root` :

| Règle | Valeur | Base |
|---|---|---|
| Longueur minimale | **20 caractères** | recommandation ANSSI pour un compte à privilèges (≈ 80 bits d'entropie) |
| Classes de caractères | ≥ 2 sur 4 | garde-fou léger, sans imposer un motif prévisible |
| Répétitions | ≤ 3 caractères identiques consécutifs | anti-motifs triviaux (`aaaa`, `1111`) |
| Dictionnaire | vérification (`cracklib`) | rejette les mots de passe évidents — approximation locale, pas une vraie vérification contre une base de fuites |
| Rotation périodique forcée | **aucune** | l'ANSSI déconseille la rotation obligatoire (elle pousse vers des mots de passe prévisibles) ; changement uniquement en cas de compromission avérée |

En pratique : SSH exige déjà une **clé** pour atteindre le compte, et `sudo` exige
ensuite un **mot de passe** — soit, de fait, une authentification à deux facteurs
(« ce que j'ai » + « ce que je sais ») pour toute action privilégiée, sans outil TOTP dédié.

### Gestion des clés SSH du compte de déploiement (`debian`)

- Le fichier **`infra/authorized_keys`** (versionné) est la **source de vérité** des
  clés autorisées sur `debian`.
- `infra/sync-authorized-keys.sh` applique cette liste, avec refus si le fichier ne
  contient aucune clé valide (anti-lockout) et sauvegarde horodatée avant écrasement.
- `infra/add-ssh-user.sh <pseudo-github>` importe des clés GitHub dans ce fichier.
- Bénéfice : `git log infra/authorized_keys` retrace qui a eu accès à ce compte, quand.

---

## 8. Cycle de développement

- Développement sur la branche `dev` → test sur `dev.bde42perpignan.fr` → merge vers `main`
  → déploiement en production. La prod n'est jamais modifiée sans passage par le staging.
- Scripts de déploiement dédiés (`deploy-staging.sh`, `deploy-prod.sh`) : `git pull` + build + redémarrage du service.

---

## 9. Limitations connues & feuille de route

Points identifiés, non encore traités (par priorité) :

| Sujet | État |
|---|---|
| Jeton de session dans `localStorage` | À migrer vers un **cookie `httpOnly` + `SameSite`** (protection XSS du jeton). |
| `debian` garde un `sudo` large | Décision assumée le temps de finir de construire l'infra (voir §3). À restreindre aux seules commandes de déploiement une fois stabilisé — le principe (compte applicatif dédié + commandes nommées) est déjà en place pour `bde-ops`, il suffira de dupliquer l'approche. |
| `fail2ban` | Non installé — à ajouter (SSH + application). |
| Mises à jour de sécurité automatiques | `unattended-upgrades` à activer. |
| Sauvegardes | Pas de **sauvegarde automatique chiffrée** de `server/data/db.json` vers un stockage externe. |
| Base de données | Fichier JSON en clair sur disque. Migration possible vers **SQLite** (fichier verrouillé, intégrité transactionnelle). |
| Journal d'audit | Pas de traçabilité des actions administrateur. |
| Analyse de dépendances | À brancher (`npm audit` en CI, Dependabot). |
| Conformité RGPD | Politique de confidentialité, durée de conservation / purge, procédure de droit à l'effacement, registre des traitements : à rédiger une fois le modèle de données stabilisé. |

---

## 10. Signaler une vulnérabilité

Merci de signaler toute faille de sécurité en privé à **anatole.farenc42@gmail.com**
plutôt que d'ouvrir une issue publique. Une réponse sera apportée dans les meilleurs délais.
