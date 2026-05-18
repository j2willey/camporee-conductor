# Caddy TLS Proxy — Deferred Changes

These changes were reverted on 2026-05-15 to allow a `git pull` from GitHub.
Re-apply when ready to enable HTTPS for the judge PWA on the LAN.

## What was changed

### `docker-compose.yml` — Caddy service added

A new `caddy` service was prepended to the compose file as a TLS reverse proxy in front of the `collator` service:

```yaml
caddy:
  container_name: camporee-caddy
  image: caddy:2-alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile:ro
    - ./certs:/certs:ro
  environment:
    - CADDY_DOMAIN=${CADDY_DOMAIN:-localhost}
  depends_on:
    - collator
  restart: unless-stopped
```

The `collator` port mapping comment was also updated:
```yaml
- "3000:3000"   # Keep direct access for local dev / Composer
```

## Supporting files (still on disk — not reverted)

- **`Caddyfile`** — Caddy config pointing to the collator backend
- **`certs/`** — TLS certificate files (`fullchain.pem`, `privkey.pem`)
- **`CamporeeBootstrap.md`** — Bootstrap/setup doc (unrelated to Caddy, check before deleting)

## To re-apply

1. Restore the `caddy:` service block above into `docker-compose.yml` (before the `collator:` service).
2. Ensure `CADDY_DOMAIN` is set in `.env`.
3. Ensure `certs/fullchain.pem` and `certs/privkey.pem` are present.
4. `docker compose up -d`
