# 🥪 BDE Sandwicherie 42 - Pre-order & Showcase Application

Meal and sandwich pre-order platform for the BDE (student union) of École 42, with login via the Intra 42 API, showcase management, and a kitchen prep dashboard organized by time slot.

## 🚀 Installation Options (No NPM required)

You have **2 very simple options** to run the project on your Mac:

### Option A: Install Node.js & NPM with Homebrew (Recommended)
Since **Homebrew** is already installed on your Mac, you can install `node` (which includes `npm`) with a single command:

```bash
brew install node
```

Then, in the project folder:
```bash
cd /Users/alix/.gemini/antigravity/scratch/bde-sandwich-42
npm install
npm run dev
```


### Option B: Run with Docker (Without installing Node/NPM)
Since **Docker** is available on your Mac, you can run the application directly without installing anything else:

```bash
cd /Users/alix/.gemini/antigravity/scratch/bde-sandwich-42
docker compose up --build
```
The application will be accessible at `http://localhost:3000`.


# BDE Sandwicherie 42

A pre-order web application for the École 42 BDE's sandwich shop. It lets students browse the showcase, build meals, place an order, and track its status. BDE members have an admin space to manage products, stock, and order preparation.

## How it works

The project consists of two parts started together via `npm run dev`:

- **Frontend**: a React interface served by Vite on `http://localhost:3000`.
- **Backend**: an Express API on port `5001`. Vite automatically forwards `/api` requests to this API.

Data is stored locally in `server/data/db.json`. The file is created with the default products and menus if it doesn't exist, then updated as changes or orders are made.

### Student journey

1. The student browses the products and meal deals available in the showcase.
2. They can add products or build a meal deal with a main dish, a drink, and optionally a dessert.
3. They choose a pickup time slot, add a note if needed, then confirm their order.
4. They can view their orders and their status from the **My Orders** tab.

### Authentication

Authentication is handled via OAuth2 through the Intra 42 API. A 42 login is required to place an order.

Sessions are kept in the server's memory. A server restart therefore logs users out, but does not delete the products or orders stored in `server/data/db.json`.

### BDE admin space

An administrator can access:

- the list of orders, filterable by time slot and status;
- a summary of products to prepare for each time slot;
- updating an order's status: pending, in preparation, ready, picked up, or cancelled;
- creating, editing, and deleting products and meal deals;
- enabling or disabling products and meal deals based on stock.

## Running on Linux

### Prerequisites

- Node.js 18 or a more recent version (Node.js 20 is recommended);
- npm, installed alongside Node.js.

To check the installation:

```bash
node --version
npm --version
```

On Ubuntu or Debian, Node.js can be installed with:

```bash
sudo apt update
sudo apt install -y nodejs npm
```

To use a recent version of Node.js, installing via [NodeSource](https://github.com/nodesource/distributions) or `nvm` is preferable.

### Installation and startup

From the project folder:

```bash
cd /home/anate/Documents/Menu_Bde
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in a browser.

The `npm run dev` command starts the frontend and backend in parallel. The server logs indicate, among other things, that the API is listening on `http://localhost:5001`. To stop both services, press `Ctrl+C` in the terminal.

### Database (MariaDB)

The project uses MariaDB (via Prisma). There's nothing to install natively:
a disposable database runs in Docker, specific to each machine.

1. [Install Docker](https://docs.docker.com/get-docker/) if needed.
2. From the project root:
   ```bash
   docker compose up -d mariadb
   ```
3. In `.env` (see `.env.example`), leave as is:
   ```env
   DATABASE_URL="mysql://bde_app:devpassword@localhost:3306/bde_sandwich"
   ```
   (local development credentials only, defined in `docker-compose.yml`.)

To stop the database or start fresh:
```bash
docker compose down            # stops
docker compose down -v         # stops AND wipes local data
```

> Staging and production use a separate MariaDB instance on the server —
> details in [`infra/README.md`](infra/README.md#6-base-de-données-mariadb).

### Available commands

```bash
npm run dev           # starts the frontend and API in development mode
npm run client        # starts Vite only
npm run server        # starts the Express API only
npm run build         # builds the frontend for production
npm run preview       # previews the frontend build
npm run start:public  # build + server + stable HTTPS URL (Tailscale Funnel)
```

## Intra 42 OAuth2 Configuration

To enable login with a 42 account:

1. Create an OAuth application at [profile.intra.42.fr/oauth/applications](https://profile.intra.42.fr/oauth/applications).
2. Declare **several Redirect URIs, once and for all** (the 42 app accepts multiple):
   - `http://localhost:5001/api/auth/42/callback` (local testing);
   - the stable public URL, e.g. `https://bde-42.mon-tailnet.ts.net/api/auth/42/callback` (see next section).
3. Create a `.env` file at the project root:

```env
NODE_ENV=production
PORT=5001
# Single URL to fill in. The OAuth Redirect URI is derived from it automatically
# (<PUBLIC_APP_URL>/api/auth/42/callback).
PUBLIC_APP_URL=http://localhost:5001
INTRA42_CLIENT_ID=your_intra_uid
INTRA42_CLIENT_SECRET=your_intra_secret
ADMIN_LOGINS=bde_login_1,bde_login_2
DATABASE_URL="mysql://bde_app:devpassword@localhost:3306/bde_sandwich"
```

`ADMIN_LOGINS` contains, comma-separated, the 42 logins allowed to access the BDE admin space. Only these logins can manage orders, products, and meal deals.

> `INTRA42_REDIRECT_URI` is no longer needed: it's computed from `PUBLIC_APP_URL`.
> Only set it if you want to force a different value. On startup, the server
> displays the public URL and the Redirect URI actually in use.

## Public access with a stable URL (Tailscale Funnel)

[Tailscale Funnel](https://tailscale.com/kb/1223/funnel) exposes the PC's server behind
a **fixed HTTPS URL** like `https://bde-42.mon-tailnet.ts.net`, for free, without
buying a domain name, without opening a port on the router, and **without a warning page**.

The URL never changes as long as the machine name (`--hostname`) and the tailnet stay
the same: `.env` and the 42 OAuth application are configured **only once**.

### Installation (one time only)

1. Create an account at [tailscale.com](https://tailscale.com/) (Google/GitHub login possible).
2. Install Tailscale in WSL:

   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   ```

3. Enable **HTTPS** and **Funnel** for the tailnet in the admin console:
   - <https://login.tailscale.com/admin/dns> → enable *HTTPS Certificates*;
   - <https://login.tailscale.com/admin/settings/funnel> → allow Funnel.
   (On the first `tailscale funnel`, an activation link is shown if this hasn't been done yet.)

### Startup (every time)

```bash
cd /home/anate/Documents/Menu_Bde
npm install        # first time only
npm run start:public
```

The `scripts/start-public.sh` script:

1. starts `tailscaled` in *userspace* mode (suited for WSL2) if needed;
2. connects the machine to the tailnet (authentication link on the very first run);
3. displays the **stable public URL** and the **Redirect URI** to declare;
4. builds the frontend (`npm run build`);
5. opens the Funnel `443 → localhost:5001`;
6. starts the server. `Ctrl+C` closes the Funnel and stops everything.

After the very first run, set in `.env`:

```env
PUBLIC_APP_URL=https://bde-42.mon-tailnet.ts.net
```

and add `https://bde-42.mon-tailnet.ts.net/api/auth/42/callback` as a Redirect URI
in the 42 OAuth application. **These two values won't need to change afterward.**

> Useful variables: `TS_HOSTNAME` (machine name, default `bde-42`) and `PORT` (default `5001`).
> Example: `TS_HOSTNAME=bde npm run start:public`.

### Your own domain name (Cloudflare Tunnel)

The domain used is `bde42perpignan.fr` (registered with IONOS), exposed at
`https://emporium.bde42perpignan.fr` via a named Cloudflare tunnel — free, automatic
HTTPS, no port to open on the router.

**One-time setup:**

1. Add `bde42perpignan.fr` as a site on [dash.cloudflare.com](https://dash.cloudflare.com)
   (Free plan): Cloudflare gives you 2 nameservers to set.
2. At IONOS, in the domain management, replace the current nameservers with
   Cloudflare's. Propagation can take anywhere from a few minutes to 24-48h; Cloudflare
   sends an email once the domain is active.
3. Once the domain is active on Cloudflare:
   ```bash
   cloudflared tunnel login                                      # opens the browser, authorizes the domain
   cloudflared tunnel create bde42-emporium                       # creates the tunnel + its credentials file
   cloudflared tunnel route dns bde42-emporium emporium.bde42perpignan.fr   # creates the DNS record automatically
   ```
4. Start everything with:
   ```bash
   npm run start:domain
   ```
   The `scripts/start-domain.sh` script generates `~/.cloudflared/config.yml` on the first
   run, builds the frontend, opens the tunnel, then starts the server.
5. Once shown by the script, do this once:
   - in `.env` → `PUBLIC_APP_URL=https://emporium.bde42perpignan.fr` (remove
     `INTRA42_REDIRECT_URI` if it was set);
   - in the 42 OAuth app → add `https://emporium.bde42perpignan.fr/api/auth/42/callback`
     as a Redirect URI (keep the old one during the transition).

> Useful variables: `TUNNEL_NAME` (default `bde42-emporium`), `HOSTNAME` (default
> `emporium.bde42perpignan.fr`), `PORT` (default `5001`).

The code doesn't need to change: only `PUBLIC_APP_URL` is modified. To change
subdomain later, simply rerun `cloudflared tunnel route dns` with the new
name and update `HOSTNAME` + `.env`.

### Quick troubleshooting

- `client_id=undefined`: `INTRA42_CLIENT_ID` is missing from `.env` or the server hasn't been restarted.
- `redirect_uri mismatch`: the Redirect URI declared in the 42 app and the one shown at
  server startup are not **strictly** identical (scheme, subdomain, `/api/...`).
- `EADDRINUSE` on port `5001`: an old server is already running; `Ctrl+C` before relaunching.
- `tailscale: command not found`: reopen the WSL terminal after installation.
- Funnel refused: HTTPS/Funnel not yet enabled in the Tailscale admin console.

## Docker

The project can be hosted on a local network PC with Docker (app + MariaDB database):

```bash
docker compose up --build -d
```

The application will be accessible from this PC at `http://localhost:5001` and from another device at `http://PC_IP_ADDRESS:5001`. In `.env`, use this same address for `INTRA42_REDIRECT_URI`, and declare exactly this URL as the Redirect URI in the 42 OAuth application. MariaDB data is preserved by the `mariadb_data` Docker volume.

To run only the database (development with `npm run dev` outside of Docker), see [Database (MariaDB)](#database-mariadb) above.