# Camporee Conductor

**Offline-first digital event operating system for BSA skill competitions (Camporees).**

Replaces paper scorecards and spreadsheets with a portable "Digital Cartridge" workflow that runs entirely on a local WiFi network with no internet required.

---

## Architecture

Three pillars, two Docker services:

| Pillar | Role | Container / Port |
|---|---|---|
| **Curator** | Game template library browser | composer-curator / 3001 |
| **Composer** | Visual event design + cartridge export | composer-curator / 3001 |
| **Collator** | Live-event runtime + judge PWA | collator / 3000 |

Active server files: `src/servers/composer.js` (Curator + Composer) and `src/servers/collator.js` (Collator).

In local dev all three pillars are served by `server.js` on port 3000 at `/curator`, `/composer`, and `/collator`.

### Game Types

| Type | Scoring | Notes |
|---|---|---|
| `patrol` | By patrol, judge PWA entry | Common fields injected at runtime |
| `troop` | By troop, judge PWA entry | Admin suffix fields only |
| `exhibition` | Manual, Collator admin entry | No judge PWA scoring, no common fields |

### Cartridge Format

`CamporeeConfig.zip` contains:
- `camporee.json` — event metadata, roster config, theme colors, `type_defaults`
- `presets.json` — common scoring field definitions (prefix/suffix injection)
- `games/*.json` — individual game definitions (game-specific fields only)

Common patrol/troop scoring fields (Patrol Flag, Scout Spirit, etc.) are defined once in `presets.json` and injected by the Collator at `/games.json` serve time — they are never baked into game files.

---

## Tech Stack

- **Runtime:** Node.js 20, Express.js
- **Database:** SQLite (better-sqlite3)
- **Frontend:** Vanilla JS (ES Modules), Bootstrap 5
- **Schemas:** AJV JSON validation (`schemas/` directory)
- **Infrastructure:** Docker Compose, Caddy reverse proxy (production)

---

## Running the App

```bash
# Docker (recommended for event use)
docker compose up --build -d

# Rebuild and follow logs
docker compose down && docker compose up --build -d && docker compose logs -f
# or use the alias:
revive

# Local dev (all services on port 3000 via server.js)
npm run dev:all

# Collator only
npm run dev:collator
```

Access points (Docker):
- Composer + Curator: `http://localhost:3001`
- Collator (admin + judge PWA): `http://localhost:3000`

---

## Testing

```bash
npm run test:unit         # vitest — schema/normalizer unit tests
npm run test:integration  # vitest — API tests (Gemini mocked)
npm run test:e2e          # playwright — requires servers on localhost:3000/3001
npm test                  # all three
```

Requires `GEMINI_API_KEY` in `.env` for AI features (Composer only, not needed for event-day Collator).

---

## Production / Offline Event Setup

The Collator runs on a laptop at the event venue with no internet. Judges connect over local WiFi.

### Why HTTPS is required

Android blocks plain HTTP for PWA service workers. HTTPS is mandatory for the judge PWA to install and work offline.

### Infrastructure

- **Domain:** camporeeconductor.com (Cloudflare)
- **Certs:** Let's Encrypt, 90-day, obtained via certbot Cloudflare DNS-01 challenge before the event
- **Caddy:** Reads `Caddyfile`, uses pre-obtained certs from `./certs/`, proxies to collator:3000
- **Router:** GL.iNet GL-SFT1200 Opal (OpenWrt) creates local WiFi at venue
- **DNS:** GL.iNet dnsmasq resolves camporeeconductor.com to the laptop's LAN IP

### Event-day flow

1. Router creates local WiFi network (no internet required)
2. Judges connect to Opal WiFi, navigate to `https://camporeeconductor.com`
3. PWA installs on their phone; QR code at each station encodes the judge URL
4. Scores sync over local WiFi to the Collator on the laptop

### Cert renewal (run before the event while online)

```bash
certbot renew --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/cloudflare.ini
cp /etc/letsencrypt/live/camporeeconductor.com/fullchain.pem ./certs/
cp /etc/letsencrypt/live/camporeeconductor.com/privkey.pem ./certs/
# Then take the laptop offline to the event
```

`./certs/` is gitignored. Never commit TLS certificates.

### GL.iNet dnsmasq config

Add via GL.iNet admin panel under Advanced > dnsmasq:

```
address=/camporeeconductor.com/192.168.8.XXX
```

Replace `XXX` with the laptop's IP on the Opal's network.

### Environment variables (`.env`)

```
CADDY_DOMAIN=camporeeconductor.com
GEMINI_API_KEY=...
```

---

## Project Structure

```
src/servers/          Active Express apps (composer.js, collator.js)
public/
  js/apps/            SPA entry points (composer.js, curator.js)
  js/core/            Shared library (schema.js, data-store.js, ui.js, api.js)
  js/                 judge.js, admin.js, official.js, sync-manager.js
views/                EJS templates (composer layout)
schemas/              AJV JSON schemas — source of truth
data/                 Gitignored runtime data:
  collator/           SQLite DB, active-event cartridge
  composer/           Design workspaces
  curator/            Game template library
certs/                Gitignored TLS certificates
```

---

## License

MIT — Free for use by any Scouting unit.
