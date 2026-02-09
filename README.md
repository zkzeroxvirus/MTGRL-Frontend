# MTGRL-Frontend

Frontend for the MTGRL webpage, packaged as a lightweight Unraid-friendly Docker
container. The container serves a static page and proxies `/api` to
`https://api.mtginfo.org` so the frontend and API stay on the same domain when
Cloudflare is in front.

## Build & Run (Docker/Unraid)

```bash
docker build -t mtgrl-frontend .
docker run -d --name mtgrl-frontend -p 8080:80 mtgrl-frontend
```

In Unraid, add a new Docker template that maps port `8080` on the host to port
`80` in the container (or any host port you prefer).

To point at a different backend, set `API_BACKEND_URL` (defaults to
`https://api.mtginfo.org`):

```bash
docker run -d --name mtgrl-frontend -p 8080:80 \
  -e API_BACKEND_URL=https://api.mtginfo.org \
  mtgrl-frontend
```

## Cloudflare Same-Domain API

Point your Cloudflare DNS (CNAME or A record) at the Unraid host and enable the
proxy. Nginx inside the container forwards `/api/*` requests to
`https://api.mtginfo.org/*`, allowing the frontend to call the API through the
same Cloudflare domain.
