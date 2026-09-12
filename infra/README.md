# infra/

Version-controlled server configuration (OVH VPS, bde42perpignan.fr).

## Content

| File | Purpose |
|---|---|
| `authorized_keys` | SSH keys for the Debian deployment account (see below) |
| `sync-authorized-keys.sh` | Applies `authorized_keys` to the current account (anti-lockout + backup) |
| `add-ssh-user.sh <github username>` | Imports GitHub keys into `authorized_keys` (for Debian) |
| `add-team-member.sh <user> <github username> [ops\|admin]` | **Creates a named account** for a team member (see [§2](#2-the-bde-ops-group-teammates)) |
| `systemd/bde-menu.service` | Production service (port 5001), runs as `bde-app` |
| `systemd/bde-menu-staging.service` | Staging service (port 5002), runs as `bde-app-staging` |
| `sudoers.d/20-bde-ops` | Limited permissions for the `bde-ops` group (version-controlled copy of `/etc/sudoers.d/`) |
| `deploy-prod.sh` / `deploy-staging.sh` | `git pull` + build + restart (copies in `~debian/`) |

---

## 1. VPS Users

| Account | Role | Permissions |
|---|---|---|
| `root` | superuser | via `sudo` only |
| **`sudo` group** (e.g. `anfarenc`) | administrator(s) | full `sudo`, **password required** |
| **`bde-ops` group** (teammates) | limited developer access | see [§2](#2-the-bde-ops-group-teammates) — no root |
| `debian` | automated deployment account | `sudo` restricted to specific commands (deployment/restart) — see [§4](#4-the-debian-account-automated-deployment) |
| `bde-app` | runs **production**, and nothing else | no shell, no `sudo` |
| `bde-app-staging` | runs **staging**, and nothing else | no shell, no `sudo` — **separate from `bde-app`**: cannot access production files |
| `caddy` | reverse proxy | no shell |

Each environment (production / staging) has its **own system user that owns the code**

— access to one gives absolutely no access to the other.

---

## 2. The `bde-ops` Group (Teammates)

A `bde-ops` account can, **without a password**:

- act freely as `bde-app-staging` (`git pull`, `npm install`, `npm run build`
  in `/opt/Menu_Bde-staging` — never in production)
- restart / check the status / view the logs of **staging**
- view (read-only) the status and logs of **production** and **Caddy**

It **cannot**: restart or modify production, install packages, create
accounts, edit a system file, or run `add-team-member.sh` (sudo permissions are
too restricted for that — verifiable via `sudo -l`).

Exact rules: [`sudoers.d/20-bde-ops`](sudoers.d/20-bde-ops).

---

## 3. Adding a Team Member

```bash
sudo infra/add-team-member.sh <username> <github-username> [ops|admin]
```

- **Must be run by an administrator** (an account in the `sudo` group) — a
  `bde-ops` or `debian` account cannot run it; their sudo permissions are too restricted.
- Imports public SSH keys from `https://github.com/<username>.keys`.
- `ops` (default) → `bde-ops` group ([§2](#2-the-bde-ops-group-teammates)). `admin` → `sudo` group (full access).
- Generates a **strong temporary password**, displayed only once: it must be
  transmitted to the person **outside this terminal** (encrypted message, in person, etc.),
  never through this channel. Password change is **mandatory** on first login (`chage -d 0`).
- Logs the action to `/var/log/bde-team-changes.log` (who, when, for whom,
  which role — never the password).

### Removing Access

```bash
sudo userdel -r <username>
```

---

## 4. The `debian` Account (Automated Deployment)

`debian` is used only to orchestrate deployments (`deploy-prod.sh`,
`deploy-staging.sh`). Its `sudo` permissions are restricted to the commands strictly
necessary for this (acting as `bde-app`/`bde-app-staging`, restarting both services) —
no general-purpose `sudo`.

The authorized keys for this account are in `authorized_keys` (above), managed via
`sync-authorized-keys.sh` / `add-ssh-user.sh`.

---

## 5. Password Policy

`libpam-pwquality` enforces the following for every account on the server:

- **20 characters minimum** (privileged accounts — ANSSI recommendation)
- at least 2 character classes, with no more than 3 identical characters in a row
- checks against a dictionary of weak passwords
- also applies to `root`

Configuration: `/etc/security/pwquality.conf` (not version-controlled — local to the server).

---

## 6. MariaDB

A single MariaDB instance on the VPS, with two isolated databases (`bde_sandwich`
for prod, `bde_sandwich_staging` for staging) and a dedicated user per database,
with permissions limited to that database only — same logic as the `bde-app` /
`bde-app-staging` separation.

### On the VPS (one time only)

```bash
sudo infra/setup-mariadb.sh
```

Installs MariaDB, restricts it to `localhost` (never exposed to the Internet — no
`ufw` rule to open), creates the two databases and their users, then displays
**only once** the two `DATABASE_URL` values to paste into:
- `/opt/Menu_Bde/.env` (prod)
- `/opt/Menu_Bde-staging/.env` (staging)

### Locally (each developer, on their own machine)

No native installation needed: MariaDB runs in Docker, with a disposable database
specific to each machine (like `server/data/db.json` today).

1. [Install Docker](https://docs.docker.com/get-docker/) if needed.
2. From the project root:
```bash
   docker compose up -d mariadb
```
3. In `.env` (copied from `.env.example`), leave as is:
```env
   DATABASE_URL="mysql://bde_app:devpassword@localhost:3306/bde_sandwich"
```
   (local dev credentials only, defined in `docker-compose.yml` — unrelated
   to the passwords generated on the VPS side.)
4. `npm run dev` as usual.

To stop/reset the local database:
```bash
docker compose down            # stops
docker compose down -v         # stops AND wipes local data
```

---

## 7. Details

- SSH port: **2231** · **key-only authentication** · no `root` login.
- `ufw` firewall: only 2231 / 80 / 443 are open.
- HTTPS: Caddy + automatic Let's Encrypt certificates.
- systemd hardening for both services: `ProtectSystem=strict`, `NoNewPrivileges`,
  `PrivateTmp`, capabilities cleared, etc. — details in `SECURITY.md` at the repository root.
