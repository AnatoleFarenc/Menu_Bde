# Contributing to the project
 
A practical guide for working as a team on the repo without stepping on each other's toes.
These are the same mechanisms used in industry — we apply them here on purpose too
(see "Professional ambition" in [`ROADMAP.md`](./ROADMAP.md)).
 
## The 3 environments
 
```
your machine (local)  →  dev.bde42perpignan.fr (staging)  →  bde42perpignan.fr (prod)
```
 
- **Local**: on your machine, your own database, for fast iteration.
- **Staging**: shared by the team, used to verify that a feature actually
  works once really deployed, before real students see it.
- **Prod**: never modified directly. Only what has already been validated on
  staging gets deployed here.
Code never skips a step: `local → dev → main` (never `local → main`).
 
## The branching model
 
- `main` = what's running in prod.
- `dev` = what's running in staging. This is the team's integration branch.
- Each task = **its own branch**, created from `dev`:
```bash
git checkout dev
git pull
git checkout -b feature/task-name      # or fix/..., chore/...
```
 
Work on it, commit, then:
 
```bash
git push -u origin feature/task-name
```
 
Open a **Pull Request targeting `dev`** on GitHub (not `main`). Someone else
on the team reviews it before merging — this is rule number one for avoiding
a bug or a silent conflict slipping into staging without anyone else having
seen it. Once merged, staging gets redeployed (`infra/deploy-staging.sh`) and
everyone can go test it on `dev.bde42perpignan.fr`.
 
When several features validated on staging are ready to go to prod, open a
`dev → main` PR, and deploy with `infra/deploy-prod.sh`.
 
**Contribution system:**
- One branch = one task, as small as possible. Short PRs get reviewed
  quickly and merged quickly, so they spend less time "potentially
  conflicting."
- Split work by file/feature as much as possible (e.g. someone on the event
  model, someone on notifications) — less chance of changing the same lines
  at the same time.
- Before opening your PR, bring your branch up to date with `dev`:
```bash
  git checkout dev && git pull
  git checkout feature/task-name
  git merge dev            # or: git rebase dev
```
  This surfaces any conflicts right away, on your own machine, rather than
  letting GitHub block the merge later.
- Keep `server/data/db.json` **out of Git** (already in `.gitignore`): each
  environment (your PC, staging, prod) has its own data, so there's no
  possible conflict over "who has which orders/products" during development.
## Testing locally (just like in industry)
 
In industry, before a change goes anywhere, you run it on your own machine
first. Same thing here:
 
1. **Everyone has their own `.env`** (never committed — see `.env.example`):
```bash
   cp .env.example .env
```
   Leave `PUBLIC_APP_URL=http://localhost:5001`: it's already set up for
   local testing, and the OAuth redirect URI is derived from it
   automatically.
 
2. **42 login locally**: 42 Intra login goes through the "dev" OAuth app (the
   same one used for staging). For it to also work locally, you need to add
   `http://localhost:5001/api/auth/42/callback` to that OAuth app's list of
   **Redirect URIs**, alongside the staging one
   (https://profile.intra.42.fr/oauth/applications → "dev" app → Redirect
   URI). This only needs to be done once, by someone with access to that
   OAuth app.
3. **Run the project**:
```bash
   npm install
   npm run dev      # backend (5001) + frontend (5173) in parallel
```
   Each person has their own `server/data/db.json`, created automatically on
   first run — no risk of overwriting someone else's data.
 
4. Once it works locally → push the branch → PR to `dev` → it goes to
   staging → the team checks it there under the same conditions as prod
   (HTTPS, real domain) → then on to `main`.
## GitHub rules to enable (do this once, in the repo Settings)
 
To be configured manually on github.com (Settings → Branches → Branch
protection rules), not something that can be automated from this session:
 
- On `dev` and `main`: **"Require a pull request before merging"** +
  **"Require approvals"** (at least 1) — no one can push directly to them,
  not even repo admins.
- Optional once CI is in place (see `ROADMAP.md`):
  **"Require status checks to pass before merging"**.
## Commit convention
 
No strict standard is enforced, but prefer messages that say **why** rather
than just what (e.g. `fix: recalculate stock after cancelling a gifted
order` rather than `fix bug`).