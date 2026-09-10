# infra/

Configuration serveur versionnée (VPS OVH, `bde42perpignan.fr`).

## Contenu

| Fichier | Rôle |
|---|---|
| `authorized_keys` | **Source de vérité** des clés SSH autorisées |
| `sync-authorized-keys.sh` | Applique `authorized_keys` au serveur (anti-lockout + sauvegarde) |
| `add-ssh-user.sh <pseudo-github>` | Importe les clés publiques d'un compte GitHub dans `authorized_keys` |
| `systemd/bde-menu.service` | Service prod (port 5001), tourne sous `bde-app`, durci |
| `systemd/bde-menu-staging.service` | Service pré-prod (port 5002), idem |
| `deploy-prod.sh` / `deploy-staging.sh` | `git pull` + build + redémarrage (copies dans `~debian/`) |

## Utilisateurs du VPS

| Compte | Rôle | Accès |
|---|---|---|
| `root` | super-utilisateur | via `sudo` uniquement |
| `debian` | compte humain (orchestration, déploiement) | SSH port 2231, clé uniquement, `sudo` |
| `bde-app` | compte système qui **fait tourner l'app** | aucun shell, aucun `sudo` |
| `caddy` | compte système du reverse proxy | aucun shell |

Le code (`/opt/Menu_Bde`, `/opt/Menu_Bde-staging`) appartient à `bde-app`. Les scripts
de déploiement lancent les opérations fichiers via `sudo -u bde-app`.

## Durcissement systemd

Les services tournent avec : `NoNewPrivileges`, `ProtectSystem=strict` (seul
`server/data/` est accessible en écriture), `ProtectHome`, `PrivateTmp`,
`PrivateDevices`, filtrage d'appels système (`@system-service`), aucune capability,
`UMask=0077`. Une compromission de l'app ne donne ni root ni accès au reste du disque.

## Accès SSH — gestion des clés

`authorized_keys` est la **source de vérité** de qui peut se connecter.

### Donner un accès

1. La personne fournit sa clé publique, ou son pseudo GitHub (clés sur
   `https://github.com/PSEUDO.keys`).
2. `infra/add-ssh-user.sh PSEUDO "Prénom Nom"` (ou éditer `authorized_keys` à la main).
3. `git add infra/authorized_keys && git commit && git push` sur `main`.
4. Sur le VPS : `cd /opt/Menu_Bde && sudo -u bde-app git pull && infra/sync-authorized-keys.sh`

> ⚠️ Aujourd'hui toutes les connexions se font en `debian` (qui a `sudo`). Donner
> une clé = donner un accès administrateur complet au serveur. La séparation en
> comptes humains nommés est prévue (lot 2, phase C).

### Retirer un accès

Supprimer la ligne dans `authorized_keys`, commit + push, relancer le sync. Immédiat.

## Détails

- Port SSH : **2231** · connexion par **clé uniquement** · pas de login `root`.
- Pare-feu `ufw` : ouverts 2231 / 80 / 443 uniquement.
- HTTPS : Caddy + Let's Encrypt automatique.
