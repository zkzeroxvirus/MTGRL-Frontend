# MTGR-Frontend

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/U0D81ZUOGR)

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

For local development without the external `mtg-net` Docker network, use the
dev compose file instead:

```bash
docker compose -f docker-compose.dev.yml up --build
```

If your Docker install uses the older Compose binary, use:

```bash
docker-compose -f docker-compose.dev.yml up --build
```

Then open:

```text
http://localhost:8080
```

The dev compose file creates its own `mtgr-dev` network and stores Host Registry
data in a named Docker volume.

To test Discord login locally, copy `.env.dev.example` to `.env.dev`, fill in
the Discord values, then run:

```bash
docker-compose --env-file .env.dev -f docker-compose.dev.yml up --build
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

## Host Reviews and Discord Login

Visit `/hosts.html` to use the Host Registry. Discord OAuth is optional for
local static preview, but production should configure it so session logging is
limited to members with the Discord Host role.

Create an application in the Discord Developer Portal, then add this redirect:

```text
https://your-domain.example/auth/discord/callback
```

For the live MTG Info domain, use:

```text
https://www.mtginfo.org/auth/discord/callback
```

For local Docker testing, use:

```text
http://localhost:8080/auth/discord/callback
```

If clicking Login returns to `/hosts.html?auth=not-configured`, the backend did
not receive `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, and `SESSION_SECRET`.
Use the `.env.dev` command above and rebuild the containers.

Set these environment variables on the `backend` service:

```bash
PUBLIC_BASE_URL=https://your-domain.example
DISCORD_CLIENT_ID=your_discord_app_client_id
DISCORD_CLIENT_SECRET=your_discord_app_client_secret
DISCORD_REDIRECT_URI=https://your-domain.example/auth/discord/callback
DISCORD_GUILD_ID=your_server_id
DISCORD_HOST_ROLE_ID=your_host_role_id
DISCORD_PLAYER_ROLE_ID=your_player_role_id
DISCORD_ADMIN_ROLE_ID=your_admin_role_id
DISCORD_MOD_ROLE_ID=your_moderator_role_id
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_REVIEW_CHANNEL_ID=your_review_channel_id
SESSION_SECRET=a_long_random_secret
```

The OAuth flow requests `identify` and, when `DISCORD_GUILD_ID` is set,
`guilds.members.read`. The backend stores a signed HttpOnly session cookie and
uses the configured Host role to decide who can create completed-session review
codes. If `DISCORD_PLAYER_ROLE_ID` is set, only members with that Player role
can claim a valid session code and review it.

`DISCORD_ADMIN_ROLE_ID` and `DISCORD_MOD_ROLE_ID` are reserved for Host Registry
moderation tools. Admins are treated as moderators, and admins can also run the
Discord member sync. Hosts should not moderate reviews about themselves.
On `/hosts.html`, moderators and admins can delete sessions from the recent
sessions table. Deleting a session also removes its attached claims and reviews.
Session rows are clickable; the session profile shows listed players, claims,
and each player review. Moderators can hide or restore individual reviews and
exclude or include verified reviews from the numeric rating.

For player autocomplete, add a bot to the same Discord application or use an
existing bot token. The bot must be in the server and able to read guild members.
If the server is large or Discord requires it, enable the **Server Members
Intent** in the Discord Developer Portal. Hosts can then press **Sync Discord
Players** on `/hosts.html` to refresh the cached Player-role roster.

If `DISCORD_REVIEW_CHANNEL_ID` is set, logging a completed session with selected
players makes the bot post the review code in that channel and mention only
those selected players. The bot needs permission to view the channel and send
messages there.

High level bot setup:

1. Open the Discord Developer Portal application.
2. Go to **Bot** and create or reset the bot token.
3. Put that token in `DISCORD_BOT_TOKEN`.
4. Put the review-code channel ID in `DISCORD_REVIEW_CHANNEL_ID`.
5. Enable **Server Members Intent** under privileged gateway intents if available.
6. Invite the bot to your server.
7. Restart the containers.
8. Log in as a Host and press **Sync Discord Players**.

Review scoring in the Host Registry is intentionally conservative:

- Listed players who completed the session submit **verified** reviews that count
  toward the numeric rating.
- Listed players who left early or joined late submit **partial** reviews that
  remain visible but do not count toward the numeric rating.
- Players with the code who were not listed can submit **unlisted** feedback.
  That feedback is visible context but does not count toward the numeric rating.

Host badges are earned from counted review data and logged-session history.
