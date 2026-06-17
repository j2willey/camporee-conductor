# Camporee Conductor

**Offline-first event management for BSA Camporee skill competitions.**

A Camporee is a multi-troop Boy Scouts of America weekend event where patrols rotate through skill stations and compete for points. Camporee Conductor replaces paper scorecards, spreadsheets, and handwritten ribbon labels with a coordinated digital system that works entirely on a local WiFi network — no internet required on event day.

**[Live Demo →](https://demo.camporeeconductor.com)**

---

## How it works

The workflow follows three stages:

1. **Design** — A Camporee Director uses the **Composer** to define games, write Game Guides for station volunteers, configure scoring fields, and set up the event roster. The result is a **cartridge**: a single ZIP file containing the complete event blueprint.

2. **Deploy** — The cartridge is uploaded to the **Collator**, which runs on a laptop at the venue. The Collator serves the judge PWA over local WiFi and collects scores in real time.

3. **Score** — Volunteer **judges** at each station open the Progressive Web App on their phones (no install required, works offline). They select a patrol, fill in the scores, and submit. Results flow to the Collator instantly. Officials watch standings update, finalize games, and print award ribbon labels.

---

## Architecture

Six Docker containers, two app servers:

| Container | Port | Role |
|---|---|---|
| `caddy` | 80 / 443 | TLS reverse proxy, subdomain routing |
| `landing` | 3002 | Marketing site + early-access form |
| `composer` | 3001 | Composer + Curator Node app |
| `collator` | 3000 | Collator Node app |
| `demo-collator` | 3003 | Public demo — Collator with seeded Circus 2026 data |
| `demo-composer` | 3004 | Public demo — Composer in read-only mode |

**Three pillars** served across two app containers:

| Pillar | Role | Container |
|---|---|---|
| **Curator** | Community game template library (browse, preview, fork) | composer |
| **Composer** | Visual event design + cartridge export | composer |
| **Collator** | Live-event runtime + Judge PWA | collator |

### Cartridge format

`CamporeeConfig.zip` contains:
- `camporee.json` — event manifest (meta, leagues, rosters, type_defaults, theme colors)
- `presets.json` — common scoring field definitions (prefix/suffix injection by the Collator)
- `games/*.json` — individual game definitions (game-specific fields only)

Schema version: **3.0.** See `CAMPOREESCHEMA.md` for the full data model. `game.league` (FK → `camporee.leagues[].id`) is the scoring tier selector — `game.type` was removed in v3.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, Express.js |
| Database | SQLite (`better-sqlite3`) |
| Auth | Clerk (`@clerk/express`) for Composer + cloud Collator; email honor-system for offline Collator |
| Frontend | Vanilla JS (ES Modules), Bootstrap 5 |
| AI | Google Gemini (game guide writing, theme embellishment) |
| Schema validation | AJV with JSON Schema |
| Infrastructure | Docker Compose, Caddy reverse proxy |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose on Linux)
- Node.js 22 (for local dev without Docker — see `engines` in `package.json`)
- A [Clerk](https://clerk.com) account (free tier is sufficient) for Composer authentication
- A [Gemini API key](https://aistudio.google.com/app/apikey) for AI features (optional)

---

## Quick start

```bash
git clone https://github.com/j2willey/camporee-conductor.git
cd camporee-conductor
cp .env.example .env
# Edit .env — at minimum set CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, SESSION_SECRET
docker compose up --build -d
```

Then open:
- **Landing:** `https://localhost`
- **Composer:** `https://composer.localhost`
- **Collator:** `https://collator.localhost`

Caddy uses a self-signed internal CA in dev — your browser will warn on first visit. Accept the cert (or install the Caddy root CA) to proceed.

```bash
# Follow logs
docker compose logs -f

# Restart after code changes
docker compose down && docker compose up --build -d
```

### Local dev without Docker

```bash
npm install
npm run dev:all          # Composer + Curator + Collator on a single port
npm run dev:collator     # Collator only
```

---

## Environment variables

Copy `.env.example` to `.env`. The example file is fully annotated. Key variables:

| Variable | Purpose |
|---|---|
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Composer auth — obtain from [Clerk dashboard](https://dashboard.clerk.com) |
| `GEMINI_API_KEY` | AI game guide generation — obtain from [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `SESSION_SECRET` | Collator offline session secret — generate with `openssl rand -hex 32` |
| `DATA_DIR` | Runtime data root — defaults to `./data`, set to a path outside the repo in production |
| `CADDY_HOST` | Domain routing — `localhost` for dev, your domain for production |
| `COLLATOR_MODE` | `offline` (email honor system) or `cloud` (Clerk JWT) |

`DATA_DIR` controls all Docker volume mounts. Runtime data (SQLite databases, workspaces, active event) lives outside the repo so it survives `git pull` and container rebuilds.

---

## Testing

```bash
npm run test:unit         # Vitest — schema and normalizer unit tests
npm run test:integration  # Vitest — API tests (Gemini mocked)
npm run test:e2e          # Playwright — launches fresh servers on ports 4000/4001
npm test                  # All three suites
```

E2E tests use dedicated ports 4000/4001 (`playwright.config.js`) so they never conflict with running Docker containers on 3000/3001.

---

## Project structure

```
src/
  servers/          Express apps — composer.js (Curator + Composer), collator.js
  lib/              Shared service modules — curator-service.js, etc.
  db/               Migration runner (migrate.js) — applies migrations/ at startup
public/
  js/apps/          SPA entry points — composer.js, curator.js
  js/core/          Shared library — schema.js, data-store.js, ui.js, api.js
  js/               judge.js, admin.js, official.js, utils.js, sync-manager.js
views/              EJS server-rendered templates (Composer shell)
schemas/            AJV JSON schemas — authoritative data model
migrations/         Numbered SQL files applied to conductor.db on startup
scripts/            CLI tools — make-sysadmin.js, seed-demo.js, seed-demo-composer.js
tests/
  unit/             Schema and normalizer tests
  integration/      API tests (supertest)
  e2e/              Playwright browser tests
data/               Empty stub dirs only — runtime data lives in DATA_DIR
certs/              Gitignored TLS certs (pre-event offline deployment)
```

---

## Production deployment

### Cloud (VPS)

The composer and a public demo are hosted on a DigitalOcean droplet with Cloudflare DNS. Set `CADDY_HOST=yourdomain.com` in `.env` and Caddy obtains Let's Encrypt certs automatically.

### Offline event deployment (no internet on-site)

The Collator is designed to run on a laptop at the venue with a local WiFi router. Android requires HTTPS for PWA service workers, so certificates must be obtained before the event while online.

**Recommended setup:**

| Component | Recommendation |
|---|---|
| Router | GL.iNet GL-SFT1200 Opal (OpenWrt) |
| TLS | Certbot DNS-01 via Cloudflare — valid 90 days |
| DNS override | GL.iNet dnsmasq: `address=/yourdomain.com/192.168.8.XXX` |

**Event-day flow:**
1. Router creates local WiFi (no internet required)
2. Judges connect to WiFi, navigate to `https://yourdomain.com`
3. PWA installs; QR codes at each station link directly to the judge URL
4. Scores sync over WiFi to the Collator on the laptop

**Cert renewal** (run before the event while online):
```bash
certbot renew --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/cloudflare.ini
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ./certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ./certs/
```

---

## Sysadmin

Grant sysadmin access to a Clerk user by email (run inside the composer container):

```bash
docker exec camporee-composer node scripts/make-sysadmin.js user@example.com
```

Sysadmins can manage users, review the audit log, and curate the game template library at `/sysadmin.html`.

---

## Contributing

This project was built by a single Camporee Director to solve a real operational problem. Contributions are welcome — especially:

- Additional game templates for the Curator library
- Improvements to the Judge PWA offline experience
- Translations / accessibility improvements
- Documentation and deployment guides for other Councils

Open an issue to discuss before submitting a large pull request.

---

## License

MIT — free for use by any Scouting unit, Council, or District.

**Author:** Jim Willey — Camporee Director, Coyote Creek District
