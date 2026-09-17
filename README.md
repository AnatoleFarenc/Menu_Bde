# 🥪 BDE Sandwicherie 42

Meal and sandwich pre-order platform for the BDE (student union) of École 42
Perpignan: 42 Intra login, a storefront for browsing and ordering, and a
management space (`/gestion`) for the team to handle catalog, stock, and
event reporting.

- **Production:** https://bde42perpignan.fr
- **Staging:** https://dev.bde42perpignan.fr
- **Repository:** https://github.com/AnatoleFarenc/Menu_Bde

## How it works

The project has two parts, started together with `npm run dev`:

- **Frontend** — a React interface served by Vite on `http://localhost:3000`.
- **Backend** — an Express API on `http://localhost:5001`. Vite forwards
  `/api` requests to it automatically.

Data (products, events, orders, stock) is stored in **MariaDB**, accessed
through **Prisma**. Locally, MariaDB runs in a disposable Docker container —
see [Database](#4-start-the-database-mariadb) below.

### Student usage

1. Browse the products and meal deals available in the current event's
   storefront.
2. Add products, or build a meal deal (main + drink + optional dessert).
3. Choose a pickup time, add a note if needed, and confirm the order.
4. Track order status from the **My Orders** tab, and leave a review once
   it's picked up.

### Authentication & roles

Login goes through **42 Intra OAuth2** — a 42 account is required to order.
Sessions are kept in server memory (a restart logs everyone out, but does
not touch stored data).

Three roles, each including the rights of the one below:

| Role | Access |
|---|---|
| **Member** | Order, track orders, leave reviews |
| **Staff** | + live order-tracking board (update order status) |
| **Admin** | + `/gestion`: catalog, stock, events, shopping list, stats |
| **Board** | + team management (assign roles to other members) |

Roles are managed from `/gestion → Équipe` once at least one Board account
exists (seeded via `ADMIN_LOGINS` / `MANAGER_LOGINS`, see below).

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite |
| Backend | Node.js, Express |
| Database | MariaDB via Prisma ORM |
| Auth | 42 Intra OAuth2 |
| Local dev database | Docker (MariaDB container) |

---

## Getting started

### Prerequisites

- **Node.js 18+** (20 LTS recommended), with npm
- **Docker** (for the local MariaDB database, or to run everything in
  containers)
- **Git**

<details>
<summary><strong>Installing prerequisites on Windows</strong></summary>

1. Install Node.js from [nodejs.org](https://nodejs.org/) (LTS build), or
   via `winget install OpenJS.NodeJS.LTS`.
2. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
   with the WSL2 backend (default on a recent install).
3. Use **PowerShell**, **Git Bash**, or a **WSL** terminal for the commands
   below — they're the same everywhere except where noted.

> `npm run start:public` and `npm run start:domain` (public deployment via
> Tailscale/Cloudflare, see [below](#public-access-optional)) are Bash
> scripts and need to run inside **WSL** or Git Bash on Windows.

</details>

<details>
<summary><strong>Installing prerequisites on macOS</strong></summary>

With [Homebrew](https://brew.sh/) installed:

```bash
brew install node
brew install --cask docker   # Docker Desktop
```

Launch Docker Desktop once from Applications so its daemon is running
before you use `docker compose`.

</details>

<details>
<summary><strong>Installing prerequisites on Linux</strong></summary>

```bash
# Ubuntu/Debian — for a more recent Node than the distro package, prefer
# NodeSource (https://github.com/nodesource/distributions) or nvm.
sudo apt update
sudo apt install -y nodejs npm

# Docker Engine + Compose plugin: https://docs.docker.com/engine/install/
```

Check versions:

```bash
node --version
npm --version
docker --version
```

</details>

### 1. Clone the repository

```bash
git clone https://github.com/AnatoleFarenc/Menu_Bde.git
cd Menu_Bde
```

### 2. Install dependencies

```bash
npm install
```

(This also runs `prisma generate` automatically via `postinstall`.)

### 3. Configure environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` work as-is for local development. To enable
42 login, fill in `INTRA42_CLIENT_ID` / `INTRA42_CLIENT_SECRET` — see
[42 Intra OAuth2 setup](#42-intra-oauth2-setup) below.

### 4. Start the database (MariaDB)

No native install needed — a disposable database runs in Docker, the same
way on Windows, macOS, and Linux:

```bash
docker compose up -d mariadb
```

Leave `DATABASE_URL` in `.env` as-is; it matches the credentials Docker
Compose sets up for you. To stop or reset it:

```bash
docker compose down       # stops the container, keeps data
docker compose down -v    # stops AND wipes local data
```

> Staging and production use a separate MariaDB instance on the server —
> details in [`infra/README.md`](infra/README.md#6-mariadb).

### 5. Run the app

```bash
npm run dev
```

This starts the backend (`:5001`) and frontend (`:3000`) together. Open
[http://localhost:3000](http://localhost:3000) in your browser. Press
`Ctrl+C` to stop both.

### Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Frontend + backend together, for local development |
| `npm run client` | Frontend only (Vite) |
| `npm run server` | Backend only (Express API) |
| `npm run build` | Builds the frontend for production into `dist/` |
| `npm run preview` | Serves the production build locally, for a quick check |
| `npm run start:public` | Build + server + stable public HTTPS URL via Tailscale Funnel (WSL/Linux/macOS) |
| `npm run start:domain` | Build + server + your own domain via Cloudflare Tunnel (WSL/Linux/macOS) |

---

## Running fully in Docker

To run the app and its database together, without installing Node locally
at all:

```bash
docker compose up --build
```

The Express server serves both the API and the built frontend from a
single process, so the app is reachable at **http://localhost:5001**
(not `:3000` — that port is only used by Vite in local dev, and isn't
relevant here). From another device on the same network, use
`http://<this-machine-IP>:5001`.

If you go this route, set `INTRA42_REDIRECT_URI`/`PUBLIC_APP_URL` in `.env`
to match whichever address (`localhost` or the LAN IP) you'll actually use,
and declare the same URL as a Redirect URI in the 42 OAuth application.

MariaDB data persists in the `mariadb_data` Docker volume across restarts.

---

## 42 Intra OAuth2 setup

To enable login with a 42 account:

1. Create an OAuth application at
   [profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications).
2. Declare the Redirect URIs you'll need (the 42 app accepts several at
   once) — at minimum, for local dev:
   `http://localhost:5001/api/auth/42/callback`.
3. Fill in `.env`:

   ```env
   PUBLIC_APP_URL=http://localhost:5001
   INTRA42_CLIENT_ID=your_intra_uid
   INTRA42_CLIENT_SECRET=your_intra_secret
   ADMIN_LOGINS=bde_login_1,bde_login_2
   MANAGER_LOGINS=bde_login_1,bde_login_2
   ```

   The Redirect URI is derived automatically from `PUBLIC_APP_URL`
   (`<PUBLIC_APP_URL>/api/auth/42/callback`) — only set
   `INTRA42_REDIRECT_URI` explicitly if you need to override that.

   `ADMIN_LOGINS` and `MANAGER_LOGINS` seed the initial Staff/Admin
   accounts (comma-separated 42 logins); once at least one exists, day-to-day
   role management moves to `/gestion → Équipe` (see [Roles](#authentication--roles)).

---

## Public access (optional)

For exposing a local instance under a stable HTTPS URL without deploying to
a server — useful for testing 42 login end-to-end, or demoing to the team.
Both options below require a Bash shell (native on macOS/Linux, via WSL on
Windows) since the helper scripts are Bash.

<details>
<summary><strong>Tailscale Funnel</strong></summary>

Exposes your machine behind a fixed URL like
`https://bde-42.your-tailnet.ts.net`, for free, with a valid certificate,
no router configuration needed.

**One-time setup:**

1. Create an account at [tailscale.com](https://tailscale.com/).
2. Install Tailscale:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```
3. Enable **HTTPS Certificates** and **Funnel** for your tailnet in the
   admin console (links are shown the first time you run `tailscale funnel`
   if not yet enabled).

**Every time:**

```bash
npm run start:public
```

This starts Tailscale (userspace mode, WSL2-friendly), prints the stable
public URL and the Redirect URI to declare in your 42 OAuth app, builds the
frontend, and starts the server behind the Funnel. `Ctrl+C` stops
everything.

After the first run, set in `.env`:

```env
PUBLIC_APP_URL=https://bde-42.your-tailnet.ts.net
```

and add `https://bde-42.your-tailnet.ts.net/api/auth/42/callback` as a
Redirect URI in the 42 OAuth application. These only need to be set once,
as long as the machine name and tailnet don't change.

> Useful variables: `TS_HOSTNAME` (default `bde-42`), `PORT` (default `5001`).

</details>

<details>
<summary><strong>Cloudflare Tunnel (custom domain)</strong></summary>

Exposes the app under your own domain, via a named Cloudflare Tunnel — free,
automatic HTTPS, no port to open on the router.

**One-time setup:**

1. Add your domain as a site on [dash.cloudflare.com](https://dash.cloudflare.com)
   (Free plan) and point its nameservers at the ones Cloudflare gives you.
2. Once the domain is active on Cloudflare:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create <tunnel-name>
   cloudflared tunnel route dns <tunnel-name> <your-subdomain>
   ```
3. Start with:
   ```bash
   npm run start:domain
   ```
   `scripts/start-domain.sh` generates `~/.cloudflared/config.yml` on first
   run, builds the frontend, opens the tunnel, and starts the server.
4. Set `PUBLIC_APP_URL` in `.env` to your domain, and add
   `<your-domain>/api/auth/42/callback` as a Redirect URI in the 42 OAuth
   app.

> Useful variables: `TUNNEL_NAME`, `HOSTNAME`, `PORT` (default `5001`).

</details>

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `client_id=undefined` | `INTRA42_CLIENT_ID` missing from `.env`, or the server wasn't restarted after editing it |
| `redirect_uri mismatch` | The Redirect URI declared in the 42 app doesn't **exactly** match the one shown at server startup (scheme, subdomain, path) |
| `EADDRINUSE` on port `5001` | Another server instance is already running — stop it with `Ctrl+C` before relaunching |
| `tailscale: command not found` | Reopen your WSL/terminal session after installing Tailscale |
| Funnel refused | HTTPS/Funnel not yet enabled in the Tailscale admin console |
| `docker compose` fails to connect | Docker Desktop (Windows/macOS) isn't running, or the Docker daemon isn't started (Linux) |

---

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branching model and PR
workflow, and [`ROADMAP.md`](ROADMAP.md) for what's shipped and what's next.

## Security

See [`SECURITY.md`](SECURITY.md) for the security model, hardening, and how
to report a vulnerability.

## License

MIT — see [`LICENSE`](LICENSE).
