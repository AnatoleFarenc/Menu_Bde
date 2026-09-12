# Roadmap — BDE 42 Perpignan Sandwich Shop

> Living document: edit as the team makes decisions (a PR is enough).
> A checked box = feature in production.

## Vision

Today: a meal pre-order platform connected to the 42 Intra.
Tomorrow: the tool for managing all of the BDE's sales projects — catalog,
stock, team, and financial reporting per event — accessible via a single
link from the school's own website.

**Environments**
- Production: https://bde42perpignan.fr
- Staging (testing): https://dev.bde42perpignan.fr
- Repository: https://github.com/AnatoleFarenc/Menu_Bde

---

## Professional ambition

This project has a **second, deliberate objective**: it's also a **showcase**
that any of us can show to a recruiter. So we apply, as much as is reasonable
for a BDE project, the practices you'd find in a company — not to make things
complicated, but so the project clearly stands apart from a simple
student/amateur project.

**Already in place**
- [x] Separate environments (dev / staging / prod) with documented manual deployment
- [x] Version-controlled infrastructure ("as code") — `infra/`
- [x] Documented security model (`SECURITY.md`): server hardening, sessions,
      CSRF, CSP, rate limiting, privilege separation
- [x] Role-based team management (full admin / limited developer access), scripted and logged onboarding
- [x] Password policy compliant with current ANSSI recommendations

**To add** (open list, to be filled in as a team)
- [ ] **GDPR**: privacy policy, data retention/purge duration, right-to-erasure
      procedure, register of processing activities
- [ ] **Mandatory code review**: no direct merges to `dev`/`main` without a
      Pull Request reviewed by someone else (see `CONTRIBUTING.md`)
- [ ] **GitHub branch protection rules** on `main` and `dev`: PR + 1 required
      review, including for repo admins (to be done in
      Settings → Branches, see details discussed in conversation)
- [ ] **Continuous integration (CI)**: automatic build + lint on every PR
      (GitHub Actions)
- [ ] **Automated tests**: at least the critical routes (order, payment/status, stock)
- [ ] **Consistent code style**: ESLint + Prettier, enforced in CI
- [ ] **Task tracking**: GitHub Issues/Projects rather than this file alone,
      once the team grows
- [ ] **Changelog** of versions shipped to production
- [ ] **Monitoring**: alert if the site goes down, status dashboard
- [ ] **Automatic, tested backups** of the database

---

## What's already running

### Storefront & orders
- [x] 42 Intra login (OAuth2, signed session token, CSRF protection)
- [x] Customizable meal deals (per-product choice groups, live price calculation)
- [x] Order tracking & customer reviews
- [x] Kiosk mode (shared order terminal, no 42 account)

### Administration
- [x] Catalog & stock (automatic out-of-stock at 0, restored on cancellation)
- [x] Purchase price & profit (margin per product and per meal deal)
- [x] Financial report (chosen period, CSV export, revenue / cost / profit)
- [x] Gifted/free products

### Team, security & infra
- [x] Separate test environment (isolated database, restricted access)
- [x] Named accounts & limited role (full admin vs. developer access)
- [x] Server hardening (HTTPS, firewall, systemd isolation — details in [`SECURITY.md`](./SECURITY.md))

---

## Roadmap

The "event" model is the foundation for everything else — we tackle it first.
Statistics and team management depend directly on it.

### 01 — Event / project model — 🔜 Next

Evolve catalog templates into real dated events: each sale (a "piscine", a
midterm, a party...) keeps its own catalog, orders, and history —
reusable as-is by another team the following year.

### 02 — Statistics & graphs per event — 📋 Planned

Visualize sales trends from one event to the next, compare editions.

*Depends on: 01*

### 03 — Team management per event — 📋 Planned

Customizable roles (checkout, prep...), number of people needed, optional
named assignment — to see at a glance the staffing to plan for.

*Depends on: 01*

### 04 — Order notifications — 📋 Planned

Browser (push) notification when an order comes in, toggleable per admin
member.

### 05 — Automatic shopping list — 📋 Planned

From stock thresholds, generate what to restock and in what quantity before
the next event.

### 06 — Role hierarchy in the app — 📋 Planned

Board / Admin / Staff / Member — finer-grained permissions than today's
simple "admin or not".

### 🔧 To fix — Pickup time slots

The precise slicing (9am–6pm every 15 min) doesn't match real usage and will
be removed in favor of a simpler model.

---

## How we work

```
dev branch → dev.bde42perpignan.fr → merge main → bde42perpignan.fr
```

Prod is never modified without going through staging first.

| Role | Rights |
|---|---|
| **Admin** | Full server access, password required. Can create team accounts. |
| **Bde-ops** | Builds & deploys staging autonomously. Read-only on prod, no root access. |

Technical documentation: [`SECURITY.md`](./SECURITY.md) · [`infra/README.md`](./infra/README.md)

Add a team member:
```bash
sudo infra/add-team-member.sh <username> <github-username> ops
```

---

*Last updated: 2026-09-12*
