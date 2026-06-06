# Camporee Conductor

**Offline-first digital event operating system for BSA skill competitions (Camporees).**

Replaces paper scorecards and spreadsheets with a portable "Digital Cartridge" workflow. The cartridge (a single ZIP file) carries the full event — game definitions, scoring logic, roster, and metadata — and runs entirely on a local WiFi network with no internet required.

First production use: Coyote Creek District Camporee "The Circus", May 15–17 2026, Camp Chesebrough.

---

## Architecture

Four Docker containers:

| Container | Port | Role |
|---|---|---|
| `caddy` | 80 / 443 | TLS reverse proxy, subdomain routing |
| `landing` | 3002 | Marketing site + early-access form |
| `composer` | 3001 | Composer + Curator Node app |
| `collator` | 3000 | Collator Node app |

**Three pillars** served by two app containers:

| Pillar | Role | Container |
|---|---|---|
| **Curator** | Camporee template library (browse, preview, fork) | composer |
| **Composer** | Visual event design + cartridge export | composer |
| **Collator** | Live-event runtime + judge PWA | collator |

Active server files: `src/servers/composer.js` (Curator + Composer) and `src/servers/collator.js` (Collator). The `ACTIVE_SERVICES` env var controls which pillars each container runs.

### Cartridge Format

`CamporeeConfig.zip` contains:
- `camporee.json` — event manifest (meta, leagues, rosters, type_defaults, theme colors)
- `presets.json` — common scoring field definitions (prefix/suffix injection)
- `games/*.json` — individual game definitions (game-specific fields only)

**Schema version 3.0.** `game.league` (FK → `camporee.leagues[].id`) replaced the old `game.type` field. See `CAMPOREESCHEMA.md` for the full schema.

### League / Scoring Tiers

| League | Tier | Common fields | In-app scoring |
|---|---|---|---|
| `patrol-games` | subunit | All prefix + suffix presets | Yes, judge PWA |
| `troop-challenges` | unit | Suffix admin only | Yes, judge PWA |
| `exhibition` | subunit | None | No (manual admin entry) |

Common fields (Patrol Flag, Scout Spirit, etc.) are defined once in `presets.json` and injected by the Collator at `/games.json` serve time — never baked into individual game files.

---

## Tech Stack

- **Runtime:** Node.js 22, Express.js
- **Database:** SQLite (`better-sqlite3`)
- **Auth:** Clerk (`@clerk/express`) for Composer + cloud Collator; email honor-system for offline Collator
- **Frontend:** Vanilla JS (ES Modules), Bootstrap 5
- **Schemas:** AJV JSON validation (`schemas/` directory)
- **Infrastructure:** Docker Compose, Caddy reverse proxy

---

## Running the App

### Docker (recommended)

```bash
# First run / after code changes
docker compose up --build -d

# Follow logs
docker compose logs -f

# Full restart
docker compose down && docker compose up --build -d && docker compose logs -f
```

Access points:
- Landing page: `http://localhost` (or `https://localhost` if Caddy is active)
- Composer + Curator: `http://localhost:3001`
- Collator (admin + judge PWA): `http://localhost:3000`

### Local dev (no Docker)

```bash
npm run dev:all          # all three services via server.js
npm run dev:collator     # Collator only
```

### Environment variables

Copy `.env.example` to `.env`. Key variables:

| Variable | Purpose |
|---|---|
| `DATA_DIR` | Runtime data root — dev: `/home/<user>/camporee-data`, VPS: `/opt/camporee-conductor-data` |
| `GEMINI_API_KEY` | AI game generation (Composer only) |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Composer auth |
| `SESSION_SECRET` | Collator offline session (generate with `openssl rand -hex 32`) |
| `CADDY_HOST` | Domain routing — `localhost` for dev, `camporeeconductor.com` for VPS |

`DATA_DIR` controls all Docker volume mounts. Runtime data lives **outside the repo** so it survives `git pull` and container rebuilds.

---

## Testing

```bash
npm run test:unit         # vitest — schema/normalizer unit tests
npm run test:integration  # vitest — API tests (Gemini mocked)
npm run test:e2e          # playwright — launches fresh servers on ports 4000/4001
npm test                  # all three
```

E2E tests use dedicated ports 4000/4001 (`playwright.config.js`) so they never conflict with running Docker containers.

---

## Project Structure

```
src/
  servers/          Active Express apps (composer.js, collator.js)
  lib/              Shared service modules (curator-service.js)
  db/               Migration runner (migrate.js)
public/
  js/apps/          SPA entry points (composer.js, curator.js)
  js/core/          Shared library (schema.js, data-store.js, ui.js, api.js)
  js/               judge.js, admin.js, official.js, utils.js, sync-manager.js
views/              EJS templates (Composer layout)
schemas/            AJV JSON schemas — source of truth
migrations/         Numbered SQL files applied to conductor.db at startup
scripts/            CLI tools (make-sysadmin.js, list-workspaces.js, migrate-schema-v3.js)
tests/
  unit/             Schema/normalizer unit tests
  integration/      API tests (supertest)
  e2e/              Playwright browser tests
data/               Empty stub dirs only — runtime data lives in DATA_DIR outside the repo
certs/              Gitignored TLS certificates (pre-event offline deployment)
```

---

## Production / Offline Event Setup

The Collator runs on a laptop at the event venue. Judges connect over local WiFi via the judge PWA.

### Why HTTPS is required

Android blocks plain HTTP for PWA service workers. HTTPS is mandatory for the judge PWA to install and function offline.

### Infrastructure

- **Domain:** camporeeconductor.com (Cloudflare)
- **Certs:** Let's Encrypt via certbot DNS-01 challenge (Cloudflare), obtained before the event while online. Stored in `./certs/` (gitignored). Valid 90 days.
- **Proxy:** Caddy reads `Caddyfile`, uses pre-obtained certs, proxies to Collator.
- **Router:** GL.iNet GL-SFT1200 Opal (OpenWrt) creates local WiFi at venue.
- **DNS:** GL.iNet dnsmasq resolves `camporeeconductor.com` to the laptop's LAN IP.

### Event-day flow

1. Router creates local WiFi (no internet required on-site)
2. Judges connect to Opal WiFi, navigate to `https://camporeeconductor.com`
3. PWA installs; QR codes at each station encode the judge URL
4. Scores sync over WiFi to the Collator on the laptop

### Cert renewal (run before the event while online)

```bash
certbot renew --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/cloudflare.ini
cp /etc/letsencrypt/live/camporeeconductor.com/fullchain.pem ./certs/
cp /etc/letsencrypt/live/camporeeconductor.com/privkey.pem ./certs/
```

### GL.iNet dnsmasq config

Add via GL.iNet admin → Advanced → dnsmasq:

```
address=/camporeeconductor.com/192.168.8.XXX
```

Replace `XXX` with the laptop's IP on the Opal's network.

---

## License

MIT — Free for use by any Scouting unit.
