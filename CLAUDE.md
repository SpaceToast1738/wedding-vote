# Wedding Vote — project notes for Claude Code

## What this is

A self-hosted voting app for the family to pick our 2½-year-old's flower-girl
dress. Three options, ~10–20 voters. Runs in a Docker container on Unraid,
fronted by a Cloudflare Tunnel for HTTPS on a custom domain.

## Architecture

```
[ family member's phone ]
         │
         ▼ HTTPS
[ Cloudflare Tunnel ]
         │
         ▼ HTTP (LAN-only)
[ Docker container on Unraid ]
         │
         ▼
[ Fastify (Node 20) + better-sqlite3 ]
         │
         ▼
[ /data/votes.db on Unraid host ]
```

## Auth model

- **No accounts.** Voters enter just a name to cast a vote.
- A `voter_id` cookie ties the device to its vote (stops accidental double-voting).
- **The reveal:** before voting, you see counts/percentages but names are blurred
  out. After voting, you see who voted for what + any comments people left.
- Re-voting from the same device overwrites the previous vote.

## File map

| Path                                   | What it is                              |
| -------------------------------------- | --------------------------------------- |
| `server.js`                            | Fastify server. ~120 lines.             |
| `public/index.html`                    | The whole frontend in one file.         |
| `Dockerfile`                           | Multi-stage Alpine, Node 20.            |
| `docker-compose.yml`                   | For Unraid — one service.               |
| `.github/workflows/docker-publish.yml` | Auto-builds & pushes to ghcr.io on push to main. |

## Database schema

```sql
CREATE TABLE votes (
  voter_id   TEXT PRIMARY KEY,    -- random UUID stored in browser cookie
  name       TEXT NOT NULL,        -- display name they typed
  dress_id   TEXT NOT NULL,        -- 'azazie' | 'etsy' | 'vinted'
  comment    TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

## API

- `GET /api/votes` — totals always; names + comments only if you've voted
- `POST /api/votes` — body: `{ name, dress, comment? }`
- `DELETE /api/votes` — admin reset (requires `X-Admin-Token` header matching `ADMIN_TOKEN` env var)
- `GET /healthz` — for the Docker healthcheck

## Local dev

```bash
mkdir -p data
npm install
npm run dev          # uses ./data/votes.db
# open http://localhost:3000
```

## Deploying to Unraid

Two options:

### Option A — Build locally on the Unraid host

```bash
git clone https://github.com/SpaceToast1738/wedding-vote
cd wedding-vote
docker compose up -d --build
```

### Option B — Pull the image GitHub Actions built

After the first push to `main`, GitHub Actions publishes
`ghcr.io/spacetoast1738/wedding-vote:latest`. In `docker-compose.yml`, swap
`build: .` for `image: ghcr.io/spacetoast1738/wedding-vote:latest` and run:

```bash
docker compose pull
docker compose up -d
```

If your repo is private, the Unraid host needs to log in once:

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u SpaceToast1738 --password-stdin
```

(Token needs `read:packages` scope.)

## Cloudflare Tunnel hookup

The container listens on port 3000. In your Cloudflare Tunnel config
(`cloudflared` UI or `config.yml`), add an ingress rule:

```yaml
ingress:
  - hostname: vote.yourdomain.co.uk
    service: http://wedding-vote:3000   # if cloudflared is in same Docker network
    # or
    service: http://<unraid-lan-ip>:3000
  - service: http_status:404
```

That's it — your domain now serves the app over HTTPS, no firewall changes
needed.

## Things to know if you're modifying this

- The dress list lives in **two places**: `public/index.html` (the `DRESSES`
  array near the top of the script) and `server.js` (the `VALID_DRESSES` set).
  Update both.
- The cookie is `httpOnly: true` and `secure: true` — it relies on Cloudflare
  serving HTTPS. If testing without that (e.g. plain `localhost`), the cookie
  won't stick. Override `secure: false` in `server.js` for local dev only.
- SQLite WAL mode is on. The DB will leave `-wal` and `-shm` files alongside
  `votes.db` — that's normal.
- The "names hidden until you vote" logic is enforced **server-side** in
  `GET /api/votes`. You can't bypass it from the browser.

## Useful commands

```bash
# Peek at votes on the Unraid host
docker exec -it wedding-vote sh -c "sqlite3 /data/votes.db 'SELECT name, dress_id, comment FROM votes ORDER BY updated_at DESC'"

# Wipe all votes (or use the admin DELETE endpoint with X-Admin-Token)
docker exec -it wedding-vote sh -c "sqlite3 /data/votes.db 'DELETE FROM votes'"

# Tail logs
docker logs -f wedding-vote
```
