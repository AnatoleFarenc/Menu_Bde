# infra/

Configuration serveur versionnée (VPS OVH, `bde42perpignan.fr`).

## Accès SSH — gestion des clés

`authorized_keys` est la **source de vérité** de qui peut se connecter au serveur.

### Donner un accès à quelqu'un

1. La personne génère une paire de clés sur sa machine (si elle n'en a pas) :
   ```bash
   ssh-keygen -t ed25519 -C "prenom@sa-machine"
   ```
2. Elle envoie le contenu de sa **clé publique** (`~/.ssh/id_ed25519.pub`).
   Alternative : si elle a un compte GitHub avec une clé, ses clés publiques sont sur
   `https://github.com/SON_PSEUDO.keys`.
3. Ajouter la ligne dans `infra/authorized_keys`, commit + push sur `main`.
4. Sur le VPS :
   ```bash
   cd /opt/Menu_Bde && git pull && infra/sync-authorized-keys.sh
   ```

### Retirer un accès

Supprimer la ligne dans `infra/authorized_keys`, commit + push, puis relancer la même
commande sur le VPS. Effet immédiat.

### Détails techniques

- Le serveur tourne sur le port SSH **2231** (pas 22).
- Connexion par **clé uniquement** (mot de passe désactivé).
- Utilisateur : `debian` (accès `sudo`).
- `sync-authorized-keys.sh` refuse de s'exécuter si le fichier ne contient aucune clé
  valide (protection anti-lockout), et sauvegarde l'ancien `authorized_keys` avant.
