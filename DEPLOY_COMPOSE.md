# Single VPS Docker Compose Deployment

This deployment runs the Next.js app and the Pipecat bot on one VPS, while
Postgres and every AI provider stay managed externally. Object storage for
recordings is optional.

## Services

```text
https://APP_DOMAIN -> caddy -> 127.0.0.1:3000 (web)
https://BOT_DOMAIN -> caddy -> 127.0.0.1:7860 (bot)
web -> bot prewarm  -> http://host.docker.internal:7860   (BOT_INTERNAL_URL)
bot -> web callback -> https://APP_DOMAIN                 (NEXT_APP_URL — see note below)
browser -> bot WebRTC -> https://BOT_DOMAIN/api/offer
```

`caddy` and `bot` both run with `network_mode: host` (the bot needs it for
the WebRTC UDP port range — see Firewall, below). Because of that, `bot`
can't resolve `web` by Docker service name the way it could on the default
bridge network, so it calls back to the web app through its **public**
`APP_DOMAIN`, same as a browser would, rather than an internal address.

## Files

- `docker-compose.yml` starts `caddy`, `web`, and `bot`.
- `Caddyfile` reverse-proxies `APP_DOMAIN` to the web container and
  `BOT_DOMAIN` to the bot container. No other routes.
- `web/Dockerfile` builds the Next.js standalone server.
- `server/Dockerfile` builds the Pipecat bot.
- `.env.compose.example` documents the root-level Compose domain variables.

## Setup

1. Point DNS for both public domains to the VPS:

   ```text
   luna.example.com      A/AAAA -> VPS
   bot.luna.example.com  A/AAAA -> VPS
   ```

2. Copy the root Compose env:

   ```bash
   cp .env.compose.example .env
   ```

3. Fill in the root `.env`: `APP_DOMAIN`, `BOT_DOMAIN`, `NEXT_PUBLIC_APP_URL`,
   and `BOT_PUBLIC_URL`. `BOT_PUBLIC_URL` becomes the web image's
   `NEXT_PUBLIC_BOT_URL` build arg — that's the URL the **browser** uses to
   reach the bot for WebRTC, so it must be the public `BOT_DOMAIN`, not an
   internal address.

4. Fill `web/.env` and `server/.env` (copy from their `.env.example` files
   first — see `SETUP.md` for the full variable reference).

   Required in both, identical values:

   ```text
   DATABASE_URL
   BOT_SHARED_SECRET
   SARVAM_API_KEY
   ```

   Optional, identical values in both if you want recordings:

   ```text
   R2_ACCOUNT_ID
   R2_ACCESS_KEY_ID
   R2_SECRET_ACCESS_KEY
   R2_BUCKET
   ```

5. Use public URLs in `web/.env` or the root `.env`:

   ```text
   NEXT_PUBLIC_APP_URL=https://luna.example.com
   BOT_PUBLIC_URL=https://bot.luna.example.com
   ```

6. Start the stack:

   ```bash
   docker compose up -d --build
   ```

7. Apply database migrations from the web container:

   ```bash
   docker compose run --rm web npm run db:migrate
   ```

## Production notes

- The bot runs with `REQUIRE_BOT_SESSION=true`, so direct unauthenticated
  bot calls are rejected — a valid session token from `/api/session/start`
  is required.
- The browser still needs the public bot domain for the WebRTC offer
  exchange (`https://BOT_DOMAIN/api/offer`).
- `BOT_INTERNAL_URL=http://host.docker.internal:7860` is used only by
  server-side web code (the session-start prewarm ping) to reach the bot,
  since the bot's host networking takes it off the regular Compose bridge
  network.
- Recordings are optional. If you configure R2 (or another S3-compatible
  bucket), keep it private — recording playback uses presigned URLs, never
  a public bucket.
- Keep Neon or another managed Postgres for the first VPS deployment
  unless you're ready to own backups, upgrades, and restores yourself.

## Firewall (required for WebRTC)

The bot runs in `network_mode: host` and the browser establishes ICE/DTLS/SRTP
on ephemeral high UDP ports (aiortc/aioice allocate them at random — there's
no upstream knob to pin a range). Without these ports open, ICE never
completes and the call screen hangs on the loading state.

If the host runs UFW (default on DigitalOcean droplets), allow the standard
WebRTC range alongside the HTTP/HTTPS rules:

```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp                             # HTTP/3 to caddy
ufw allow 10000:65535/udp comment 'webrtc-ice'
ufw enable
```

If a cloud-provider firewall (DO Cloud Firewall, AWS SG) is also attached,
mirror the UDP range there.
