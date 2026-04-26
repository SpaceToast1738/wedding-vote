# 🌿 Wedding Vote

A small, self-hosted voting app for picking the flower-girl dress. Three options, a handful of family voters, runs on Unraid behind a Cloudflare Tunnel.

**Built for one specific decision; deliberately tiny.**

## Stack

- **Frontend** — single static HTML file (no framework, no build step)
- **Backend** — [Fastify](https://fastify.dev) on Node 20
- **Database** — SQLite via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- **Container** — Docker, multi-arch (`amd64` + `arm64`)
- **Hosting** — Unraid + [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

## Voting flow

1. Voter opens the page — sees three dresses, vote counts, percentages.
2. Names of who voted for what are **hidden** (shown as shimmering "someone" chips).
3. They click **Vote for X**, type their name + an optional comment, submit.
4. Curtain lifts: they now see all the voter names and comments.
5. They can change their mind anytime — the device cookie keeps their vote attached.

## Quick start (local dev)

```bash
git clone https://github.com/SpaceToast1738/wedding-vote
cd wedding-vote
mkdir -p data
npm install
npm run dev
```

Open http://localhost:3000.

> Heads-up: cookies are set with `secure: true`, which relies on HTTPS. For local
> dev with plain `http://localhost`, comment out the `secure: true` line in
> `server.js` temporarily.

## Deploying to Unraid

```bash
# On the Unraid host
git clone https://github.com/SpaceToast1738/wedding-vote
cd wedding-vote
docker compose up -d --build
```

Then point your Cloudflare Tunnel at `http://<unraid-ip>:3000` (or `http://wedding-vote:3000` if `cloudflared` runs in the same Docker network).

The SQLite database persists at `/mnt/user/appdata/wedding-vote/votes.db` on the host — change the volume path in `docker-compose.yml` if you keep appdata elsewhere.

## Using the published image

Every push to `main` triggers a build and pushes to GHCR. Once the first build is green:

```yaml
# docker-compose.yml
services:
  wedding-vote:
    image: ghcr.io/spacetoast1738/wedding-vote:latest
    # ... rest unchanged
```

```bash
docker compose pull && docker compose up -d
```

## Configuration

| Env var       | Default            | Purpose                                                  |
| ------------- | ------------------ | -------------------------------------------------------- |
| `PORT`        | `3000`             | Port to listen on                                        |
| `HOST`        | `0.0.0.0`          | Bind address                                             |
| `DB_PATH`     | `/data/votes.db`   | SQLite file location                                     |
| `ADMIN_TOKEN` | *(unset)*          | If set, enables `DELETE /api/votes` with matching header |

## Adapting it for a different decision

The three dress options are defined in two places:

- `public/index.html` — the `DRESSES` array (near the top of the `<script>` block)
- `server.js` — the `VALID_DRESSES` set

Update both, restart the container, you're done. There's no migration needed unless you want to wipe existing votes.

## License

MIT.
