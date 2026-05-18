# MTGR-Frontend

Frontend for the MTGR webpage, packaged as a lightweight Unraid-friendly Docker
container. The container serves a static page and proxies `/api` to
`https://api.mtginfo.org` so the frontend and API stay on the same domain when
Cloudflare is in front.

## Build & Run (Docker/Unraid)

```bash
docker build -t mtgr-frontend .
docker run -d --name mtgr-frontend -p 8080:80 mtgr-frontend
```

In Unraid, add a new Docker template that maps port `8080` on the host to port
`80` in the container (or any host port you prefer).

### Docker Compose

```bash
docker compose up --build
```

Override defaults with environment variables as needed:

```bash
API_BACKEND_URL=https://api.mtginfo.org \
LEADERBOARD_SHEET_ID=15lRLvnGZCEnQrMAk7dDHRmMcobKFelYarlXns7KN7QQ \
docker compose up --build
```

To point at a different backend, set `API_BACKEND_URL` (defaults to
`https://api.mtginfo.org`):

```bash
docker run -d --name mtgr-frontend -p 8080:80 \
  -e API_BACKEND_URL=https://api.mtginfo.org \
  mtgr-frontend
```

To point at a different leaderboard sheet, set `LEADERBOARD_SHEET_ID` (defaults
to the shared MTGR sheet):

```bash
docker run -d --name mtgr-frontend -p 8080:80 \
  -e LEADERBOARD_SHEET_ID=15lRLvnGZCEnQrMAk7dDHRmMcobKFelYarlXns7KN7QQ \
  mtgr-frontend
```

## Tests

Run the lightweight Docker Compose validation suite with:

```bash
./tests/run.sh
```

## Cloudflare Same-Domain API

Point your Cloudflare DNS (CNAME or A record) at the Unraid host and enable the
proxy. Nginx inside the container forwards `/api/*` requests to
`https://api.mtginfo.org/*`, allowing the frontend to call the API through the
same Cloudflare domain.

If you run `cloudflared` in Docker, configure ingress origin to a name that is
resolvable on the shared Docker network, for example `http://frontend:80`,
`http://MTGR-Frontend:80`, or `http://MTGRL-Frontend:80` (alias provided in
`docker-compose.yml`). If logs show `lookup ... no such host`, verify
`cloudflared` is attached to the same Docker network (`mtg-net`).

## Leaderboard

Visit `/leaderboard.html` to view live standings pulled from the shared Google
Sheet. Ensure the sheet is publicly readable so the container can fetch it. The
page expects standard Google Sheets CSV output (avoid multiline cells), and
`LEADERBOARD_SHEET_ID` should be a valid sheet ID.
