# Camporee Day Bootstrap — Claude Session Prompt

**Copy and paste this entire file as your first message to Claude or Claude Code
on the laptop at Camporee.**

---

## Who I Am

Jim Willey. I am the Camporee Director for the **Coyote Creek District Camporee 2026**,
"The Circus" theme, at Camp Chesebrough, May 15–17 2026. I am running a digital
scoring system called **Camporee Conductor** on this laptop. Judges are scoring on
phones connected to a local WiFi network (GL.iNet Opal travel router). There is
**no internet at the venue** — everything must work offline.

I am a returning software engineer (Express.js, Node.js, Docker, SQLite). Treat me
as a peer. Push back when something seems wrong. When I'm stuck, ask what the next
smallest action is.

---

## The Machine

**Asus Zenbook** (i7-8550U, 16GB RAM) running Windows 11 + WSL2 (Ubuntu).
All work happens inside WSL2. Repo is at `~/ws/camporee-conductor/`.
Docker Desktop must be running before starting the app.

---

## The App — Camporee Conductor

Offline-first digital event OS. Three pillars:

| Pillar | Role | Port |
|--------|------|------|
| Collator | Live-event runtime + judge PWA | 3000 (HTTP) / 443 (HTTPS via Caddy) |
| Composer | Event design + cartridge export | 3001 |
| Curator | Game template library | 3001 |

The **Collator** is what matters today. Judges open
`https://judge.camporeeconductor.com` on their phones.
The GL.iNet Opal router resolves that domain to this laptop's LAN IP.
Caddy provides HTTPS using a pre-obtained Let's Encrypt cert in `./certs/`.

---

## How to Start Everything

```bash
cd ~/ws/camporee-conductor

# 1. Start all services (Collator + Caddy + Composer)
docker compose up -d

# Tail logs to confirm startup
docker compose logs -f

# Or restart cleanly if something is wrong:
docker compose down && docker compose up --build -d && docker compose logs -f
```

**Collator only** (lighter, if Composer/Curator not needed):
```bash
docker compose up -d collator caddy
```

**Verify it's running:**
- http://localhost:3000/admin.html — Collator admin dashboard
- https://judge.camporeeconductor.com — Judge PWA (requires Opal connected)

---

## HTTPS Setup (Caddy + Let's Encrypt)

Caddy runs as a Docker service and handles TLS. Certs are in `./certs/`:
```
certs/fullchain.pem
certs/privkey.pem
```

The `CADDY_DOMAIN=judge.camporeeconductor.com` is set in `.env`.
Caddy reads `Caddyfile` in the repo root. No manual Caddy start needed —
`docker compose up` handles it.

**If HTTPS isn't working:** check `docker compose logs caddy` for cert errors.

---

## GL.iNet Opal — Local DNS

The Opal creates event WiFi. It must resolve `judge.camporeeconductor.com`
to this laptop's LAN IP (the IP the laptop gets from the Opal, e.g. 192.168.8.X).

1. Connect laptop to Opal WiFi
2. Find laptop IP: `ip addr show` (look for 192.168.8.X)
3. Log into Opal admin (http://192.168.8.1)
4. More Settings → Custom DNS Entries → add:
   ```
   address=/judge.camporeeconductor.com/192.168.8.X
   ```
5. Judge phones connect to Opal WiFi → navigate to https://judge.camporeeconductor.com

---

## The Active Event

**Event:** Coyote Creek District Camporee 2026 — "The Circus"
**Camporee ID:** `5d5a6a80-c9e1-4551-8e15-8ef1ca93b9ca`
**34 games loaded:** patrol games, troop campsite events, exhibition (Slack Line)
**Active cartridge:** `data/collator/active-event/`

Key URLs at the event:
- Admin dashboard: `http://localhost:3000/admin.html` (laptop only)
- Judge PWA: `https://judge.camporeeconductor.com` (all judge phones)
- Official leaderboard: `https://judge.camporeeconductor.com/official.html`
- Print tools: `https://judge.camporeeconductor.com/utils.html`

---

## Key Files

```
~/ws/camporee-conductor/
├── src/servers/collator.js       # Collator API (the live-event server)
├── public/js/judge.js            # Judge PWA (~2000 lines)
├── public/js/admin.js            # Admin dashboard
├── public/js/official.js         # Leaderboard
├── public/js/utils.js            # Print scoresheets, awards tools
├── data/collator/active-event/   # Live cartridge (games, presets, scores DB)
│   ├── camporee.json             # Event manifest + theme colors
│   ├── presets.json              # Common scoring fields
│   ├── games/                    # 34 game definition files
│   └── camporee.db               # SQLite scores database
├── .env                          # CADDY_DOMAIN + data paths
├── Caddyfile                     # HTTPS proxy config
└── docker-compose.yml            # All services
```

---

## Common Issues + Fixes

**Judge phones can't reach the server:**
- Is the laptop connected to the Opal WiFi (not a different network)?
- Does `ip addr` show a 192.168.8.X address?
- Is the Opal custom DNS entry set correctly?
- Try navigating to the laptop IP directly: `http://192.168.8.X:3000`

**HTTPS cert error on phones:**
- `docker compose logs caddy` — check for cert file not found errors
- Verify `./certs/fullchain.pem` and `./certs/privkey.pem` exist
- Cert may have expired (90-day Let's Encrypt) — check: `openssl x509 -enddate -noout -in certs/fullchain.pem`

**Collator not responding:**
- `docker compose ps` — check container status
- `docker compose logs collator` — look for startup errors
- `docker compose restart collator`

**Scores seem stuck / not syncing:**
- Judge PWA syncs on form submission. Check `docker compose logs collator` for POST errors
- The judge can score offline and sync later — data is safe in LocalStorage

**Need to see current scores:**
- Admin dashboard: http://localhost:3000/admin.html
- SQLite directly: `docker compose exec collator sqlite3 /app/data/camporee.db`

**Service worker issues / page locked up:**
- Kill the tab, reopen the URL
- If persistent: DevTools → Application → Service Workers → Unregister, then reload

---

## CLAUDE.md

Full technical context for this project is in `CLAUDE.md` in the repo root.
Read it before making any code changes. Schema version is 2.9. Data lives in
`data/` (gitignored). Never strip `id`, `weight`, `kind`, `audience`, or
`config` fields during save/load.

---

## My Priorities Today

1. Get Collator running and judges connected — everything else is secondary
2. Monitor scores and help with any field issues judges encounter
3. Close Game for each event as it completes (admin dashboard → game → Close Game)
4. Keep calm — the Scouts are counting on this working

Good luck, Jim. You built this. It'll work.
