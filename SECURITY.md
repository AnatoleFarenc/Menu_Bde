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
| `debian` | compte humain (déploiement, administration) | SSH (clé uniquement), `sudo` |
| `bde-app` | fait tourner l'application, **et seulement ça** | **aucun shell** (`/usr/sbin/nologin`), **aucun `sudo`** |
| `caddy` | reverse proxy | aucun shell |

`bde-app` est un compte système créé spécifiquement pour l'app (`useradd --system
--no-create-home --shell /usr/sbin/nologin`). Il est propriétaire du code
(`/opt/Menu_Bde`, `/opt/Menu_Bde-staging`) mais ne peut ni se connecter en SSH,
ni exécuter `sudo`. Objectif : si l'application est un jour compromise via une
faille (RCE, dépendance vérolée…), l'attaquant hérite des droits de `bde-app` —
pas de root, pas d'accès au reste du serveur.

### Services — isolation systemd

Chaque environnement tourne dans un service **systemd** dédié (`bde-menu`,
`bde-menu-staging`), sous l'utilisateur `bde-app`, avec un bac à sable renforcé :

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
  **sous l'identité `bde-app`** (`sudo -u bde-app …`), jamais en `debian` direct.

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

## 7. Gestion des accès serveur (infrastructure as code)

- Le fichier **`infra/authorized_keys`** (versionné) est la **source de vérité** des clés SSH autorisées.
- `infra/sync-authorized-keys.sh` applique cette liste au serveur, avec :
  - refus de s'exécuter si le fichier ne contient aucune clé valide (anti-lockout) ;
  - sauvegarde horodatée de l'ancien `authorized_keys` avant écrasement.
- `infra/add-ssh-user.sh <pseudo-github>` importe les clés publiques d'un compte GitHub
  (HTTPS, vérification du code HTTP et du format, déduplication).
- Bénéfice : `git log infra/authorized_keys` retrace **qui a eu accès, quand, ajouté par qui**.

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
| Tous les accès SSH partagent le compte `debian` | Donner une clé = donner un accès `sudo` complet. À remplacer par des **comptes humains nommés** (un par personne), avec `sudo` demandant un mot de passe (retrait de `NOPASSWD:ALL`) et, si besoin, un rôle lecture-seule pour les personnes qui n'ont qu'à vérifier que le service tourne. |
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
