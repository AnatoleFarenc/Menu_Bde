# Security

This document describes the security measures in place on the BDE Sandwicherie
application (a meal pre-order site for École 42), its hosting, and its
lifecycle. It is kept up to date with every significant change.

---

## 1. Architecture

```
Browser ──HTTPS──►  Caddy (reverse proxy, :80/:443)  ──local HTTP──►  Node/Express (:5001)
                              │                                                │
                              └── obtains/renews the certificate              └── server/data/db.json
                                  automatically via Let's Encrypt                  (file-based database)
```

- **1 VPS** (OVH, Debian 13), 2 services: production (`bde42perpignan.fr`, :5001) and
  pre-production (`dev.bde42perpignan.fr`, :5002), isolated (separate folders, databases, systemd services).
- The Node server is **never exposed directly**: only Caddy listens externally.

---

## 2. Transport security

| Measure | Detail |
|---|---|
| **HTTPS everywhere** | Let's Encrypt certificates obtained and renewed automatically by Caddy (ACME, TLS-ALPN challenge). No private key to manage by hand. |
| **HSTS** | `Strict-Transport-Security: max-age=31536000; includeSubDomains` header — the browser refuses plain HTTP for this domain for 1 year. |
| **HTTP → HTTPS redirect** | Handled by Caddy (`upgrade-insecure-requests` + 308 redirect). |

---

## 3. Server hardening (VPS)

### SSH access
- **Non-standard port (2231)** — greatly reduces noise from automated scans.
- **Key-based authentication only** — `PasswordAuthentication no`. No password login possible.
- No `root` login: `debian` account with `sudo`.
- Authorized keys are managed **as code** (see §7).

### Firewall
- `ufw` active, default policy **deny (inbound)**.
- Open ports: **22→2231** (SSH), **80** and **443** (Caddy) only.
- Application ports **5001 / 5002 are blocked** from the outside (accessible only via `localhost` through Caddy) — verified.

### VPS accounts

| Account | Role | Shell / access |
|---|---|---|
| `root` | superuser | reachable only via `sudo` |
| **`sudo`** group (e.g. `anfarenc`) | named human administrator | SSH (key), full `sudo` **with password** |
| **`bde-ops`** group (teammates) | limited developer access | SSH (key); `sudo` restricted to staging + read-only on prod (details in §7) |
| `debian` | automated deployment account | SSH (key), `sudo` — see note below |
| `bde-app` | runs **prod**, and only that | **no shell** (`/usr/sbin/nologin`), **no `sudo`** |
| `bde-app-staging` | runs **staging**, and only that — **separate account from `bde-app`** | no shell, no `sudo` |
| `caddy` | reverse proxy | no shell |

`bde-app` / `bde-app-staging` are system accounts created specifically for the
app (`useradd --system --no-create-home --shell /usr/sbin/nologin`), each
owning the code of **its own environment only**. Neither can log in via SSH
or run `sudo`. Two goals:
1. if the application is ever compromised via a flaw (RCE, a poisoned
   dependency…), the attacker only inherits the application account's
   permissions — no root, no access to the rest of the server;
2. the prod/staging separation guarantees that a compromise (or a human
   error) on one of the two environments **technically cannot reach the
   other**, even via `sudo`.

> ⚠️ **Deliberate, temporary decision**: `debian` still has broad `sudo`
> access (not restricted to deployment commands only) while the
> infrastructure is being actively built. It will be restricted to the
> strict necessary (see the planned scope in §9) once this work has
> stabilized.

### Services — systemd isolation

Each environment runs in a dedicated **systemd** service (`bde-menu`,
`bde-menu-staging`), under its own dedicated application user, with a
hardened sandbox:

| Directive | Effect |
|---|---|
| `User=bde-app` / `Group=bde-app` | the process never runs as `debian` or `root` |
| `ProtectSystem=strict` | **entire filesystem read-only**, except: |
| `ReadWritePaths=…/server/data` | only the data folder is writable |
| `ProtectHome=true` | `/home/*` (including `debian`) is inaccessible |
| `PrivateTmp=true` | `/tmp` isolated, invisible to other processes |
| `PrivateDevices=true` | no access to hardware devices |
| `NoNewPrivileges=true` | the process can never gain privileges (even via a setuid binary) |
| `ProtectKernelTunables` / `ProtectKernelModules` / `ProtectKernelLogs` | no reading/writing of kernel settings or modules |
| `ProtectControlGroups`, `ProtectClock`, `ProtectHostname` | no modification of system state |
| `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX` | no exotic sockets (Bluetooth, raw netlink…) |
| `RestrictNamespaces`, `RestrictSUIDSGID`, `LockPersonality` | no creation of namespaces/containers, no setuid binaries, no syscall personality changes |
| `SystemCallFilter=@system-service` | only syscalls of a typical service are allowed (allowlist) |
| `CapabilityBoundingSet=` (empty) | **no Linux capabilities at all** — not even the ones a non-root process can sometimes have |
| `UMask=0077` | every file created by the app is private by default |

Result measured with `systemd-analyze security bde-menu`: exposure score
**1.9 / "OK"** (a default, non-hardened Node service is typically around 9-10).

- Automatic restart on boot and on crash (`Restart=always`).
- System updates applied (`apt upgrade`).
- Deployment (`infra/deploy-prod.sh`, `infra/deploy-staging.sh`): `debian`
  orchestrates (`sudo systemctl restart …`) but all operations on the code
  files (`git pull`, `npm install`, `npm run build`) run **under the
  dedicated application identity** (`sudo -u bde-app …` for prod,
  `sudo -u bde-app-staging …` for staging), never directly as `debian`.

---

## 4. Application security

### Security headers (`helmet`)
A **Content-Security-Policy** tailored to the app's actual needs:

| Directive | Value | Reason |
|---|---|---|
| `script-src` | `'self'` | the JS bundle is served by the app itself, no third-party scripts, no inline |
| `style-src` | `'self' 'unsafe-inline' fonts.googleapis.com` | inline React styles + Google fonts stylesheet |
| `font-src` | `'self' fonts.gstatic.com` | Google font files |
| `img-src` | `'self' data: cdn.intra.42.fr profile.intra.42.fr` | SVG emojis as data-URIs + 42 avatars |
| `connect-src` | `'self'` | API calls are same-origin |
| `form-action` | `'self' api.intra.42.fr` | 42 OAuth flow redirect |
| `frame-ancestors` | `'none'` | anti-clickjacking |
| `object-src` | `'none'` | no plugins |

Also: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: no-referrer`.

### CORS
Restricted to a **list of known origins** (public domain + `localhost` for dev).
Any other origin is rejected.

### Rate limiting (`express-rate-limit`)
| Scope | Limit |
|---|---|
| Global `/api/*` | 300 requests / minute / IP |
| Authentication endpoints (`/api/auth/*`) | 30 requests / 15 minutes / IP |

`trust proxy` is configured so the limit applies to the **real client IP**
(not Caddy's).

### Sessions
- Session token = **`crypto.randomBytes(32)` base64url-encoded** (256 bits of entropy, unpredictable).
- **12-hour sliding expiration**: each authenticated request pushes back the deadline; beyond that, the token is invalidated.
- Automatic purge of expired sessions every 30 minutes.
- **In-memory** store: a server restart logs users out (data is not lost). A deliberate choice at this scale; migrating to a persistent store is possible.

### Authentication — 42 Intra OAuth2
- Login delegated to **École 42's OAuth2 API**, minimal scope (`public`).
- **CSRF protection**: a random `state` parameter (128 bits) is generated on
  every login request and **verified on return**; single-use, valid for 10
  minutes.
- The `client_secret` is never exposed to the browser (code → token exchange happens server-side).

### Authorization model
- Two levels currently: **42 user** (can order, view their orders, leave a review)
  and **BDE administrator** (allowlist of logins in `ADMIN_LOGINS`).
- All `/api/admin/*` routes go through **a single `requireAdmin` middleware** —
  impossible to forget a check on a new admin route.
- Routes that write user data verify **ownership** of the resource (e.g. a
  review can only be left on one's own order, and only if it has been picked up).

### Input validation
- Request body limited to **1 MB**.
- Kiosk-mode identifiers are validated against a strict pattern (`^[a-z0-9_-]{1,30}$`).
- Amounts/quantities are converted and bounded server-side (`parseFloat`/`parseInt`, minimums).
- Order statuses are validated against a closed list.

---

## 5. Secrets management

- All secrets (42 OAuth credentials, admin list…) live in a **`.env` file
  present only on the servers**, never committed (`.gitignore`: `.env`, `.env.*`).
- The repo only contains a `.env.example` with no real values.
- `.env` files have `600` permissions (owner-read only).

---

## 6. Pre-production (staging) isolation

- `dev.bde42perpignan.fr` runs the `dev` branch's code, with **its own database**
  (tests never touch real orders).
- **Access lock**: the `STAGING_MODE=true` variable restricts login to only
  the 42 logins listed in `STAGING_ALLOWED_LOGINS`. Kiosk mode is disabled there.
- None of these variables exist in production → no effect on the public site.

---

## 7. Human accounts & team onboarding

### Two roles

| Role | Linux group | Rights |
|---|---|---|
| **Administrator** | `sudo` | full root access, password required for every use |
| **Teammate** | `bde-ops` | limited "developer" access — see the detailed table in §3 (self-service staging build/deploy, read-only on prod, no root) |

### Creating an account

```bash
sudo infra/add-team-member.sh <username> <github-handle> [ops|admin]
```

- **Can only be run by an administrator** (the script requires being launched
  as root via `sudo`, which neither `bde-ops` nor `debian` allow — verifiable
  with `sudo -l`, explicitly tested).
- Imports the SSH public key(s) from `https://github.com/<handle>.keys`
  (HTTPS, HTTP status and format verified).
- Generates a **strong temporary password**, displayed once on screen (never
  written to disk or logged), to be shared with the person outside the
  terminal. Change is **mandatory on first login** (`chage -d 0`).
- **Audit log** (`/var/log/bde-team-changes.log`): date, administrator who
  performed it, account created, role — never the password.

### Password policy (`libpam-pwquality`)

Applies to **all** accounts on the server, including `root`:

| Rule | Value | Basis |
|---|---|---|
| Minimum length | **20 characters** | ANSSI (French cybersecurity agency) recommendation for a privileged account (≈ 80 bits of entropy) |
| Character classes | ≥ 2 of 4 | light guardrail, without forcing a predictable pattern |
| Repetitions | ≤ 3 identical consecutive characters | anti trivial patterns (`aaaa`, `1111`) |
| Dictionary | check (`cracklib`) | rejects obvious passwords — a local approximation, not a real check against a breach database |
| Forced periodic rotation | **none** | ANSSI advises against mandatory rotation (it pushes users toward predictable passwords); change only on confirmed compromise |

In practice: SSH already requires a **key** to reach the account, and `sudo`
then requires a **password** — effectively two-factor authentication
("something I have" + "something I know") for any privileged action,
without a dedicated TOTP tool.

### Managing SSH keys for the deployment account (`debian`)

- The **`infra/authorized_keys`** file (version-controlled) is the **source of truth** for
  keys authorized on `debian`.
- `infra/sync-authorized-keys.sh` applies this list, refusing to proceed if the
  file contains no valid key (anti-lockout) and taking a timestamped backup before overwriting.
- `infra/add-ssh-user.sh <github-handle>` imports GitHub keys into this file.
- Benefit: `git log infra/authorized_keys` traces who had access to this account, and when.

---

## 8. Development cycle

- Development on the `dev` branch → testing on `dev.bde42perpignan.fr` → merge into `main`
  → production deployment. Prod is never modified without going through staging.
- Dedicated deployment scripts (`deploy-staging.sh`, `deploy-prod.sh`): `git pull` + build + service restart.

---

## 9. Known limitations & roadmap

Identified points, not yet addressed (by priority):

| Topic | Status |
|---|---|
| Session token in `localStorage` | To be migrated to an **`httpOnly` + `SameSite` cookie** (XSS protection for the token). |
| `debian` retains broad `sudo` | A deliberate decision while the infra is still being built (see §3). To be restricted to deployment commands only once stabilized — the principle (dedicated application account + named commands) is already in place for `bde-ops`; it will just need to be duplicated. |
| `fail2ban` | Not installed — to be added (SSH + application). |
| Automatic security updates | `unattended-upgrades` to be enabled. |
| Backups | No **automatic encrypted backup** of `server/data/db.json` to external storage. |
| Database | Plain-text JSON file on disk. Migration to **SQLite** possible (locked file, transactional integrity). |
| Audit log | No traceability of administrator actions. |
| Dependency scanning | To be set up (`npm audit` in CI, Dependabot). |
| GDPR compliance | Privacy policy, retention/purge periods, right-to-erasure procedure, processing register: to be written once the data model has stabilized. |

---

## 10. Reporting a vulnerability

Please report any security flaw privately to **anatole.farenc42@gmail.com**
rather than opening a public issue. A response will be provided as soon as possible.
