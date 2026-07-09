import express from "express";
import { google } from "googleapis";
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const app = express();
const port = process.env.PORT || 3000;
const dataDir = process.env.MTGR_DATA_DIR || path.join(process.cwd(), "data");
const hostDataPath = path.join(dataDir, "host-reviews.json");

const sheetId = process.env.LEADERBOARD_SHEET_ID;
const sheetGid = Number.parseInt(process.env.LEADERBOARD_SHEET_GID || "0", 10);
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/app/service_account.json";
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const discordClientId = process.env.DISCORD_CLIENT_ID || "";
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET || "";
const discordRedirectUri = process.env.DISCORD_REDIRECT_URI || `${publicBaseUrl}/auth/discord/callback`;
const discordGuildId = process.env.DISCORD_GUILD_ID || "";
const discordHostRoleId = process.env.DISCORD_HOST_ROLE_ID || "";
const discordPlayerRoleId = process.env.DISCORD_PLAYER_ROLE_ID || "";
const discordBotToken = process.env.DISCORD_BOT_TOKEN || "";
const sessionSecret = process.env.SESSION_SECRET || "";
const authConfigured = Boolean(discordClientId && discordClientSecret && sessionSecret);
const discordApiBase = "https://discord.com/api/v10";

app.use(express.json({ limit: "256kb" }));

const ratingMetrics = [
  "rulesClarity",
  "runFlow",
  "fairness",
  "tableManagement",
  "challengeQuality",
  "playerExperience",
];

const metricWeights = {
  rulesClarity: 0.2,
  runFlow: 0.2,
  fairness: 0.25,
  tableManagement: 0.15,
  challengeQuality: 0.1,
  playerExperience: 0.1,
};

const defaultHostData = {
  hosts: [
    {
      id: "demo-ashen",
      discordId: "demo-ashen",
      displayName: "Ashen",
      avatarUrl: "",
      status: "active",
      specialties: ["Doom timing", "Crypt pressure"],
    },
    {
      id: "demo-kevin",
      discordId: "demo-kevin",
      displayName: "Kevin",
      avatarUrl: "",
      status: "active",
      specialties: ["New player tables", "Rules clarity"],
    },
  ],
  sessions: [],
  participants: [],
  reviews: [],
  users: [],
  syncMeta: {},
};

const readHostData = async () => {
  try {
    const raw = await fs.readFile(hostDataPath, "utf8");
    return { ...defaultHostData, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return structuredClone(defaultHostData);
  }
};

const writeHostData = async (data) => {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(hostDataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const createId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const createSessionCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "MTGR-";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const base64UrlEncode = (value) => Buffer.from(value).toString("base64url");

const base64UrlJson = (value) => base64UrlEncode(JSON.stringify(value));

const signValue = (value) => crypto
  .createHmac("sha256", sessionSecret || "dev-only-session-secret")
  .update(value)
  .digest("base64url");

const parseCookies = (req) => Object.fromEntries(
  String(req.headers.cookie || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .map((cookie) => {
      const index = cookie.indexOf("=");
      if (index === -1) {
        return [cookie, ""];
      }
      return [cookie.slice(0, index), decodeURIComponent(cookie.slice(index + 1))];
    }),
);

const createSignedToken = (payload) => {
  const body = base64UrlJson(payload);
  return `${body}.${signValue(body)}`;
};

const readSignedToken = (token) => {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature || signValue(body) !== signature) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() < Date.now()) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
};

const isHttpsRequest = (req) => req.secure || req.get("x-forwarded-proto") === "https";

const setCookie = (res, name, value, options = {}) => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.secure) {
    parts.push("Secure");
  }
  res.append("Set-Cookie", parts.join("; "));
};

const clearCookie = (res, name, secure = false) => {
  setCookie(res, name, "", { maxAge: 0, secure });
};

const createAvatarUrl = (user) => {
  if (!user.avatar) {
    return "";
  }
  const extension = user.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
};

const discordFetch = async (route, accessToken) => {
  const response = await fetch(`${discordApiBase}${route}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Discord API responded with ${response.status}`);
  }
  return data;
};

const discordBotFetch = async (route) => {
  const response = await fetch(`${discordApiBase}${route}`, {
    headers: {
      Authorization: `Bot ${discordBotToken}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `Discord bot API responded with ${response.status}`);
  }
  return data;
};

const exchangeDiscordCode = async (code) => {
  const response = await fetch(`${discordApiBase}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${discordClientId}:${discordClientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: discordRedirectUri,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Discord token exchange failed with ${response.status}`);
  }
  return data;
};

const getDiscordProfile = async (accessToken) => {
  const user = await discordFetch("/users/@me", accessToken);
  let member = null;
  if (discordGuildId) {
    member = await discordFetch(`/users/@me/guilds/${discordGuildId}/member`, accessToken);
  }
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  return {
    discordId: user.id,
    displayName: member?.nick || user.global_name || user.username,
    username: user.username,
    avatarUrl: member?.avatar
      ? `https://cdn.discordapp.com/guilds/${discordGuildId}/users/${user.id}/avatars/${member.avatar}.png?size=128`
      : createAvatarUrl(user),
    roles,
    isHost: discordHostRoleId ? roles.includes(discordHostRoleId) : false,
    isPlayer: discordPlayerRoleId ? roles.includes(discordPlayerRoleId) : true,
  };
};

const normalizeSessionUser = (payload) => {
  if (!payload?.discordId || !payload?.displayName) {
    return null;
  }
  return {
    discordId: String(payload.discordId),
    displayName: String(payload.displayName),
    avatarUrl: String(payload.avatarUrl || ""),
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    isHost: Boolean(payload.isHost),
    isPlayer: payload.isPlayer !== false,
    authProvider: payload.authProvider || "discord",
  };
};

const getSessionUser = (req) => normalizeSessionUser(readSignedToken(parseCookies(req).mtgr_session));

const normalizeUser = (req) => getSessionUser(req);

const assertUser = (req, res) => {
  const user = normalizeUser(req);
  if (!user) {
    res.status(401).json({ error: "Missing MTGR user identity" });
    return null;
  }
  return user;
};

const sanitizeText = (value, fallback = "") => String(value ?? fallback).trim().slice(0, 400);

const normalizeDiscordId = (value) => {
  const text = String(value || "").trim();
  const mentionMatch = text.match(/^<@!?(\d+)>$/);
  const id = mentionMatch ? mentionMatch[1] : text.match(/\d{6,}/)?.[0];
  return id || "";
};

const parseLoggedPlayers = (value) => {
  const entries = Array.isArray(value)
    ? value
    : String(value || "").split(/\r?\n|,/).map((entry) => ({ raw: entry }));

  const seen = new Set();
  return entries
    .map((entry) => {
      const raw = typeof entry === "string" ? entry : entry.raw || entry.discordId || "";
      const discordId = normalizeDiscordId(entry.discordId || raw);
      if (!discordId || seen.has(discordId)) {
        return null;
      }
      seen.add(discordId);
      const rawName = typeof entry === "object" ? entry.displayName : "";
      const displayName = sanitizeText(rawName || String(raw).replace(discordId, "").replace(/[<@!>]/g, "").trim(), "Unknown Player");
      return { discordId, displayName };
    })
    .filter(Boolean)
    .slice(0, 6);
};

const upsertKnownUser = (data, user) => {
  if (!user?.discordId) {
    return null;
  }
  const existing = data.users.find((entry) => entry.discordId === user.discordId);
  const next = {
    discordId: user.discordId,
    displayName: sanitizeText(user.displayName, "Unknown Player"),
    username: sanitizeText(user.username),
    avatarUrl: String(user.avatarUrl || ""),
    roles: Array.isArray(user.roles) ? user.roles : [],
    isHost: Boolean(user.isHost),
    isPlayer: user.isPlayer !== false,
    lastSeenAt: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, next);
    return existing;
  }
  data.users.push(next);
  return next;
};

const buildKnownPlayers = (data) => [...data.users]
  .filter((user) => user.isPlayer)
  .sort((a, b) => a.displayName.localeCompare(b.displayName))
  .map((user) => ({
    discordId: user.discordId,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl || "",
  }));

const syncDiscordMembers = async () => {
  if (!discordBotToken || !discordGuildId) {
    throw new Error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required for member sync");
  }

  const members = [];
  let after = "0";
  while (true) {
    const batch = await discordBotFetch(`/guilds/${discordGuildId}/members?limit=1000&after=${after}`);
    if (!Array.isArray(batch) || !batch.length) {
      break;
    }
    members.push(...batch);
    after = batch[batch.length - 1]?.user?.id || after;
    if (batch.length < 1000) {
      break;
    }
  }

  return members
    .filter((member) => !member.user?.bot)
    .map((member) => {
      const roles = Array.isArray(member.roles) ? member.roles : [];
      return {
        discordId: member.user.id,
        displayName: member.nick || member.user.global_name || member.user.username,
        username: member.user.username,
        avatarUrl: member.avatar
          ? `https://cdn.discordapp.com/guilds/${discordGuildId}/users/${member.user.id}/avatars/${member.avatar}.png?size=128`
          : createAvatarUrl(member.user),
        roles,
        isHost: discordHostRoleId ? roles.includes(discordHostRoleId) : false,
        isPlayer: discordPlayerRoleId ? roles.includes(discordPlayerRoleId) : true,
      };
    });
};

const getHostAverage = (hostId, reviews) => {
  const hostReviews = reviews.filter((review) => review.hostId === hostId);
  if (!hostReviews.length) {
    return {
      reviewCount: 0,
      overall: 0,
      metrics: Object.fromEntries(ratingMetrics.map((metric) => [metric, 0])),
      wouldReplayPercent: 0,
    };
  }

  const metrics = Object.fromEntries(ratingMetrics.map((metric) => {
    const total = hostReviews.reduce((sum, review) => sum + Number(review.ratings?.[metric] || 0), 0);
    return [metric, Number((total / hostReviews.length).toFixed(2))];
  }));
  const overall = ratingMetrics.reduce((sum, metric) => sum + (metrics[metric] * metricWeights[metric]), 0);
  const wouldReplayCount = hostReviews.filter((review) => review.wouldReplay).length;

  return {
    reviewCount: hostReviews.length,
    overall: Number(overall.toFixed(2)),
    metrics,
    wouldReplayPercent: Math.round((wouldReplayCount / hostReviews.length) * 100),
  };
};

const buildHostSummary = (data) => data.hosts.map((host) => {
  const sessions = data.sessions.filter((session) => session.hostId === host.id);
  return {
    ...host,
    hostedRuns: sessions.length,
    rating: getHostAverage(host.id, data.reviews),
  };
});

const csvEscape = (value) => {
  const text = value == null ? "" : String(value);
  if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
    return `"${text.replace(/\"/g, '""')}"`;
  }
  return text;
};

const toCsv = (rows) => rows.map((row) => row.map(csvEscape).join(",")).join("\n");

const getSheetTitleByGid = async (sheetsApi) => {
  const response = await sheetsApi.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets.properties",
  });

  const sheet = response.data.sheets?.find(
    (entry) => entry.properties?.sheetId === sheetGid,
  );

  return sheet?.properties?.title;
};

const createSheetsClient = async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
};

app.get("/auth/me", (req, res) => {
  res.status(200).json({
    configured: authConfigured,
    guildRoleCheckConfigured: Boolean(discordGuildId && discordHostRoleId),
    playerRoleCheckConfigured: Boolean(discordGuildId && discordPlayerRoleId),
    user: getSessionUser(req),
  });
});

app.get("/auth/discord/login", (req, res) => {
  if (!authConfigured) {
    return res.redirect("/hosts.html?auth=not-configured");
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const secure = isHttpsRequest(req);
  setCookie(res, "mtgr_oauth_state", createSignedToken({
    state,
    expiresAt: new Date(Date.now() + (10 * 60 * 1000)).toISOString(),
  }), { maxAge: 600, secure });

  const scope = ["identify"];
  if (discordGuildId) {
    scope.push("guilds.members.read");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: discordClientId,
    redirect_uri: discordRedirectUri,
    scope: scope.join(" "),
    state,
  });

  return res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const secure = isHttpsRequest(req);
  const stateCookie = readSignedToken(parseCookies(req).mtgr_oauth_state);
  clearCookie(res, "mtgr_oauth_state", secure);

  if (!authConfigured) {
    return res.redirect("/hosts.html?auth=not-configured");
  }
  if (!req.query.code || !req.query.state || stateCookie?.state !== req.query.state) {
    return res.redirect("/hosts.html?auth=invalid-state");
  }

  try {
    const token = await exchangeDiscordCode(String(req.query.code));
    const profile = await getDiscordProfile(token.access_token);
    try {
      const data = await readHostData();
      upsertKnownUser(data, profile);
      await writeHostData(data);
    } catch (profileError) {
      console.error("Failed to store Discord profile", profileError);
    }
    setCookie(res, "mtgr_session", createSignedToken({
      ...profile,
      authProvider: "discord",
      expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
    }), { maxAge: 7 * 24 * 60 * 60, secure });
    return res.redirect("/hosts.html?auth=discord");
  } catch (error) {
    console.error("Discord OAuth failed", error);
    return res.redirect("/hosts.html?auth=failed");
  }
});

app.post("/auth/logout", (req, res) => {
  clearCookie(res, "mtgr_session", isHttpsRequest(req));
  res.status(200).json({ ok: true });
});

app.get("/leaderboard-data", async (req, res) => {
  if (!sheetId) {
    return res.status(500).json({ error: "LEADERBOARD_SHEET_ID is not set" });
  }

  try {
    const sheetsApi = await createSheetsClient();
    const sheetTitle = await getSheetTitleByGid(sheetsApi);

    if (!sheetTitle) {
      return res.status(404).json({ error: "Sheet tab not found for provided GID" });
    }

    const data = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: sheetTitle,
    });

    const rows = data.data.values || [];
    if (req.query.format === "json") {
      return res.status(200).json({ rows });
    }
    res.set("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(toCsv(rows));
  } catch (error) {
    console.error("Failed to load sheet data", error);
    return res.status(500).json({ error: "Failed to load sheet data" });
  }
});

app.get("/host-data", async (req, res) => {
  try {
    const data = await readHostData();
    res.status(200).json({
      hosts: buildHostSummary(data),
      players: buildKnownPlayers(data),
      syncMeta: data.syncMeta || {},
      sessions: data.sessions.slice(-20).reverse(),
      participants: data.participants,
      reviews: data.reviews.slice(-50).reverse(),
      metrics: ratingMetrics,
      weights: metricWeights,
    });
  } catch (error) {
    console.error("Failed to load host data", error);
    res.status(500).json({ error: "Failed to load host data" });
  }
});

app.post("/discord/sync-members", async (req, res) => {
  const user = assertUser(req, res);
  if (!user) {
    return;
  }
  if (discordHostRoleId && !user.isHost) {
    return res.status(403).json({ error: "Discord Host role required to sync members" });
  }

  try {
    const members = await syncDiscordMembers();
    const data = await readHostData();
    members.forEach((member) => upsertKnownUser(data, member));

    const hostUsers = members.filter((member) => member.isHost);
    hostUsers.forEach((hostUser) => {
      let host = data.hosts.find((entry) => entry.discordId === hostUser.discordId);
      if (!host) {
        host = {
          id: createId("host"),
          discordId: hostUser.discordId,
          displayName: hostUser.displayName,
          avatarUrl: hostUser.avatarUrl,
          status: "active",
          specialties: [],
        };
        data.hosts.push(host);
      } else {
        host.displayName = hostUser.displayName;
        host.avatarUrl = hostUser.avatarUrl;
        host.status = "active";
      }
    });

    data.syncMeta = {
      ...(data.syncMeta || {}),
      discordMembersSyncedAt: new Date().toISOString(),
      discordMembersSyncedBy: user.discordId,
      knownPlayerCount: buildKnownPlayers(data).length,
      knownHostCount: data.hosts.filter((host) => host.status === "active").length,
    };
    await writeHostData(data);
    res.status(200).json({
      ok: true,
      players: buildKnownPlayers(data),
      syncMeta: data.syncMeta,
    });
  } catch (error) {
    console.error("Discord member sync failed", error);
    res.status(500).json({ error: error.message || "Discord member sync failed" });
  }
});

app.post("/host-sessions", async (req, res) => {
  const user = assertUser(req, res);
  if (!user) {
    return;
  }
  if (authConfigured && discordHostRoleId && !user.isHost) {
    return res.status(403).json({ error: "Discord Host role required to log sessions" });
  }

  const data = await readHostData();
  let host = data.hosts.find((entry) => entry.discordId === user.discordId);
  if (!host) {
    host = {
      id: createId("host"),
      discordId: user.discordId,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: "active",
      specialties: [],
    };
    data.hosts.push(host);
  }

  const now = new Date().toISOString();
  let code = createSessionCode();
  while (data.sessions.some((session) => session.code === code)) {
    code = createSessionCode();
  }

  const session = {
    id: createId("session"),
    code,
    hostId: host.id,
    hostDiscordId: host.discordId,
    hostName: host.displayName,
    runDate: sanitizeText(req.body?.runDate, now.slice(0, 10)),
    mode: sanitizeText(req.body?.mode, "Standard"),
    outcome: sanitizeText(req.body?.outcome, "completed"),
    cryptReached: Boolean(req.body?.cryptReached),
    playerCount: Math.max(1, Math.min(6, Number.parseInt(req.body?.playerCount || "1", 10) || 1)),
    loggedPlayers: parseLoggedPlayers(req.body?.participants),
    notes: sanitizeText(req.body?.notes),
    createdAt: now,
    expiresAt: new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString(),
  };

  data.sessions.push(session);
  data.participants.push({
    id: createId("participant"),
    sessionId: session.id,
    discordId: user.discordId,
    displayName: user.displayName,
    role: "host",
    joinedAt: now,
  });
  session.loggedPlayers.forEach((player) => {
    data.participants.push({
      id: createId("participant"),
      sessionId: session.id,
      discordId: player.discordId,
      displayName: player.displayName,
      role: "logged-player",
      loggedByDiscordId: user.discordId,
      loggedAt: now,
    });
  });
  await writeHostData(data);
  res.status(201).json({ session, host: { ...host, hostedRuns: 1, rating: getHostAverage(host.id, data.reviews) } });
});

app.post("/host-sessions/claim", async (req, res) => {
  const user = assertUser(req, res);
  if (!user) {
    return;
  }

  const code = sanitizeText(req.body?.code).toUpperCase();
  const data = await readHostData();
  const session = data.sessions.find((entry) => entry.code.toUpperCase() === code);
  if (!session) {
    return res.status(404).json({ error: "Session code not found" });
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ error: "Session code has expired" });
  }
  if (session.hostDiscordId === user.discordId) {
    return res.status(400).json({ error: "Hosts are already attached to their own sessions" });
  }
  if (discordPlayerRoleId && !user.isPlayer) {
    return res.status(403).json({ error: "Discord Player role required to claim sessions" });
  }
  const loggedPlayerIds = Array.isArray(session.loggedPlayers)
    ? session.loggedPlayers.map((player) => player.discordId)
    : [];
  if (loggedPlayerIds.length && !loggedPlayerIds.includes(user.discordId)) {
    return res.status(403).json({ error: "This Discord account was not logged as a participant for this session" });
  }

  let participant = data.participants.find(
    (entry) => entry.sessionId === session.id && entry.discordId === user.discordId,
  );
  if (!participant) {
    participant = {
      id: createId("participant"),
      sessionId: session.id,
      discordId: user.discordId,
      displayName: user.displayName,
      role: "player",
      joinedAt: new Date().toISOString(),
    };
    data.participants.push(participant);
  } else if (participant.role === "logged-player") {
    participant.role = "player";
    participant.displayName = user.displayName;
    participant.avatarUrl = user.avatarUrl;
    participant.joinedAt = new Date().toISOString();
    await writeHostData(data);
    return res.status(200).json({ session, participant });
  }
  await writeHostData(data);

  res.status(200).json({ session, participant });
});

app.post("/host-reviews", async (req, res) => {
  const user = assertUser(req, res);
  if (!user) {
    return;
  }

  const data = await readHostData();
  const sessionId = sanitizeText(req.body?.sessionId);
  const session = data.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  const participant = data.participants.find(
    (entry) => entry.sessionId === session.id && entry.discordId === user.discordId && entry.role === "player",
  );
  if (!participant) {
    return res.status(403).json({ error: "Only claimed session participants can review" });
  }
  if (data.reviews.some((review) => review.sessionId === session.id && review.reviewerDiscordId === user.discordId)) {
    return res.status(409).json({ error: "You already reviewed this session" });
  }

  const ratings = {};
  for (const metric of ratingMetrics) {
    const value = Number(req.body?.ratings?.[metric]);
    if (!Number.isFinite(value) || value < 1 || value > 5) {
      return res.status(400).json({ error: `Invalid rating for ${metric}` });
    }
    ratings[metric] = Math.round(value);
  }

  const review = {
    id: createId("review"),
    sessionId: session.id,
    hostId: session.hostId,
    reviewerDiscordId: user.discordId,
    reviewerName: user.displayName,
    ratings,
    wouldReplay: Boolean(req.body?.wouldReplay),
    comment: sanitizeText(req.body?.comment),
    createdAt: new Date().toISOString(),
  };

  data.reviews.push(review);
  await writeHostData(data);
  res.status(201).json({ review, hosts: buildHostSummary(data) });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Leaderboard backend listening on ${port}`);
});
