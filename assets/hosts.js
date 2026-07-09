const statusElement = document.getElementById("host-status");
const authAvatar = document.getElementById("auth-avatar");
const authName = document.getElementById("auth-name");
const authRole = document.getElementById("auth-role");
const discordLogin = document.getElementById("discord-login");
const logoutButton = document.getElementById("logout-button");
const sessionForm = document.getElementById("session-form");
const claimForm = document.getElementById("claim-form");
const reviewForm = document.getElementById("review-form");
const reviewTitle = document.getElementById("review-title");
const reviewContext = document.getElementById("review-context");
const ratingGrid = document.getElementById("rating-grid");
const hostGrid = document.getElementById("host-grid");
const hostStats = document.getElementById("host-stats");
const hostSearch = document.getElementById("host-search");
const showAllHosts = document.getElementById("show-all-hosts");
const sessionTable = document.getElementById("session-table");
const sessionCodeElement = document.getElementById("session-code");
const playerSearch = document.getElementById("player-search");
const syncPlayersButton = document.getElementById("sync-players");
const selectedPlayersElement = document.getElementById("selected-players");
const playerResults = document.getElementById("player-results");
const participantsValue = document.getElementById("participants-value");
const playerSyncMeta = document.getElementById("player-sync-meta");

const metricLabels = {
  rulesClarity: "Rules Clarity",
  runFlow: "Run Flow",
  fairness: "Fairness",
  tableManagement: "Table Management",
  challengeQuality: "Challenge Quality",
  playerExperience: "Player Experience",
};
const metrics = Object.keys(metricLabels);
const weights = {
  rulesClarity: 0.2,
  runFlow: 0.2,
  fairness: 0.25,
  tableManagement: 0.15,
  challengeQuality: 0.1,
  playerExperience: 0.1,
};

const reviewTypeLabels = {
  verified: "Verified participant. Counts toward rating.",
  partial: "Partial participant. Visible feedback, not counted toward rating.",
  unlisted: "Unlisted participant. Visible feedback, not counted toward rating.",
};

let state = {
  hosts: [],
  players: [],
  syncMeta: {},
  sessions: [],
  participants: [],
  reviews: [],
};
let claimedSession = null;
let selectedPlayers = [];
let authState = {
  configured: false,
  guildRoleCheckConfigured: false,
  playerRoleCheckConfigured: false,
  user: null,
};

const defaultState = () => ({
  hosts: [],
  sessions: [],
  participants: [],
  reviews: [],
  players: [],
  syncMeta: {},
});

function emptyRating() {
  return {
    reviewCount: 0,
    visibleReviewCount: 0,
    overall: 0,
    metrics: Object.fromEntries(metrics.map((metric) => [metric, 0])),
    wouldReplayPercent: 0,
  };
}

const getUser = () => {
  if (authState.user) {
    return authState.user;
  }
  return null;
};

const setStatus = (message, tone = "ok") => {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", tone === "error");
};

const authRedirectMessages = {
  "not-configured": "Discord login is not configured yet. Fill .env.dev with DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and SESSION_SECRET, then restart dev compose.",
  "invalid-state": "Discord login expired or failed its safety check. Try logging in again.",
  failed: "Discord login failed. Check the backend logs and confirm the redirect URL matches the Discord app.",
  discord: "Discord login complete.",
};

const applyAuthRedirectMessage = () => {
  const authResult = new URLSearchParams(window.location.search).get("auth");
  if (!authResult || !authRedirectMessages[authResult]) {
    return;
  }
  setStatus(authRedirectMessages[authResult], authResult === "discord" ? "ok" : "error");
};

const apiHeaders = () => {
  return { "Content-Type": "application/json" };
};

const safeFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...apiHeaders(),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed with ${response.status}`);
    error.httpStatus = response.status;
    throw error;
  }
  return data;
};

const loadAuth = async () => {
  try {
    const response = await fetch("/auth/me", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Auth responded with ${response.status}`);
    }
    authState = {
      configured: Boolean(data.configured),
      guildRoleCheckConfigured: Boolean(data.guildRoleCheckConfigured),
      playerRoleCheckConfigured: Boolean(data.playerRoleCheckConfigured),
      user: data.user || null,
    };
  } catch (error) {
    authState = {
      configured: false,
      guildRoleCheckConfigured: false,
      playerRoleCheckConfigured: false,
      user: null,
    };
  }
};

const calculateRating = (hostId, reviews) => {
  const allHostReviews = reviews.filter((review) => review.hostId === hostId);
  const hostReviews = allHostReviews.filter((review) => (
    (review.reviewType || "verified") === "verified" && review.countsTowardRating !== false
  ));
  if (!hostReviews.length) {
    return emptyRating();
  }
  const metricAverages = Object.fromEntries(metrics.map((metric) => {
    const total = hostReviews.reduce((sum, review) => sum + Number(review.ratings[metric] || 0), 0);
    return [metric, Number((total / hostReviews.length).toFixed(2))];
  }));
  const overall = metrics.reduce((sum, metric) => sum + (metricAverages[metric] * weights[metric]), 0);
  const wouldReplayCount = hostReviews.filter((review) => review.wouldReplay).length;
  return {
    reviewCount: hostReviews.length,
    visibleReviewCount: allHostReviews.length,
    overall: Number(overall.toFixed(2)),
    metrics: metricAverages,
    wouldReplayPercent: Math.round((wouldReplayCount / hostReviews.length) * 100),
  };
};

const buildBadges = (host) => {
  const rating = host.rating || emptyRating();
  const reviewCount = rating.reviewCount || 0;
  const hostedRuns = host.hostedRuns || 0;
  const values = rating.metrics || {};
  const badges = [];

  if (reviewCount >= 10 && rating.overall >= 4.5) {
    badges.push({ label: "Consistent Host" });
  }
  if (hostedRuns >= 10) {
    badges.push({ label: "Veteran Host" });
  } else if (hostedRuns >= 1) {
    badges.push({ label: "First Run Logged" });
  }
  if (reviewCount >= 5 && values.rulesClarity >= 4.6) {
    badges.push({ label: "Rules Anchor" });
  }
  if (reviewCount >= 5 && values.runFlow >= 4.6) {
    badges.push({ label: "Smooth Operator" });
  }
  if (reviewCount >= 5 && values.fairness >= 4.7) {
    badges.push({ label: "Fair Table" });
  }
  if (reviewCount >= 5 && values.tableManagement >= 4.6) {
    badges.push({ label: "Table Captain" });
  }
  if (reviewCount >= 5 && values.challengeQuality >= 4.6) {
    badges.push({ label: "Boss Crafter" });
  }
  if (reviewCount >= 5 && rating.wouldReplayPercent >= 90) {
    badges.push({ label: "Replay Favorite" });
  }
  return badges.slice(0, 3);
};

const normalizeState = (incoming) => {
  const base = { ...defaultState(), ...incoming };
  const hosts = base.hosts.map((host) => {
    const normalizedHost = {
      ...host,
      hostedRuns: base.sessions.filter((session) => session.hostId === host.id).length,
      rating: calculateRating(host.id, base.reviews),
    };
    return {
      ...normalizedHost,
      badges: Array.isArray(host.badges) ? host.badges : buildBadges(normalizedHost),
    };
  });
  return { ...base, hosts };
};

const formatDate = (value) => {
  if (!value) {
    return "n/a";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const updateParticipantsValue = () => {
  participantsValue.value = selectedPlayers.map((player) => player.discordId).join("\n");
};

const renderSelectedPlayers = () => {
  selectedPlayersElement.replaceChildren();
  if (!selectedPlayers.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "No players selected.";
    selectedPlayersElement.appendChild(empty);
    updateParticipantsValue();
    return;
  }

  selectedPlayers.forEach((player) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "player-chip";
    chip.innerHTML = `<span>${escapeHtml(player.displayName)}</span><strong>x</strong>`;
    chip.addEventListener("click", () => {
      selectedPlayers = selectedPlayers.filter((entry) => entry.discordId !== player.discordId);
      renderPlayerPicker();
    });
    selectedPlayersElement.appendChild(chip);
  });
  updateParticipantsValue();
};

const getFilteredPlayers = () => {
  const query = playerSearch.value.trim().toLowerCase();
  return (state.players || [])
    .filter((player) => !selectedPlayers.some((entry) => entry.discordId === player.discordId))
    .filter((player) => {
      if (!query) {
        return true;
      }
      return player.displayName.toLowerCase().includes(query) || player.discordId.includes(query);
    })
    .slice(0, 8);
};

const renderPlayerResults = () => {
  playerResults.replaceChildren();
  const matches = getFilteredPlayers();
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = state.players?.length ? "No matching synced players." : "No synced players yet.";
    playerResults.appendChild(empty);
    return;
  }

  matches.forEach((player) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "player-result";
    const avatar = document.createElement("span");
    avatar.className = "avatar player-avatar";
    if (player.avatarUrl) {
      avatar.style.backgroundImage = `url("${player.avatarUrl}")`;
    } else {
      avatar.textContent = player.displayName.slice(0, 2).toUpperCase();
    }
    const name = document.createElement("span");
    name.textContent = player.displayName;
    button.appendChild(avatar);
    button.appendChild(name);
    button.addEventListener("click", () => {
      selectedPlayers.push(player);
      playerSearch.value = "";
      renderPlayerPicker();
    });
    playerResults.appendChild(button);
  });
};

const renderSyncMeta = () => {
  const syncedAt = state.syncMeta?.discordMembersSyncedAt;
  const count = state.syncMeta?.knownPlayerCount ?? state.players?.length ?? 0;
  if (!syncedAt) {
    playerSyncMeta.textContent = "Sync Discord players to enable autocomplete. Selected players are the only accounts that can claim the review code.";
    return;
  }
  playerSyncMeta.textContent = `Synced ${count} player${count === 1 ? "" : "s"} from Discord on ${new Date(syncedAt).toLocaleString()}.`;
};

const renderPlayerPicker = () => {
  renderSelectedPlayers();
  renderPlayerResults();
  renderSyncMeta();
  syncPlayersButton.hidden = !authState.user?.isHost;
};

const renderHostStats = (hosts) => {
  const reviewedHosts = hosts.filter((host) => (host.rating?.reviewCount || 0) > 0).length;
  const activeHosts = hosts.filter((host) => (host.hostedRuns || 0) > 0).length;
  const totalReviews = hosts.reduce((total, host) => total + (host.rating?.reviewCount || 0), 0);
  const visibleReviews = hosts.reduce((total, host) => total + (host.rating?.visibleReviewCount || host.rating?.reviewCount || 0), 0);
  [
    ["Synced Hosts", hosts.length],
    ["With Runs", activeHosts],
    ["Reviewed", reviewedHosts],
    ["Counted Reviews", totalReviews],
    ["All Feedback", visibleReviews],
  ].forEach(([label, value]) => {
    const stat = document.createElement("div");
    stat.className = "stat";
    stat.innerHTML = `<span class="stat-label">${label}</span><span class="stat-value">${Number(value).toLocaleString()}</span>`;
    hostStats.appendChild(stat);
  });
};

const renderHosts = () => {
  hostGrid.replaceChildren();
  hostStats.replaceChildren();
  if (!state.hosts.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = "No hosts yet.";
    hostGrid.appendChild(empty);
    renderHostStats([]);
    return;
  }

  const query = hostSearch.value.trim().toLowerCase();
  const sortedHosts = [...state.hosts].sort((a, b) => {
    const ratingDelta = (b.rating?.overall || 0) - (a.rating?.overall || 0);
    if (ratingDelta !== 0) {
      return ratingDelta;
    }
    const runDelta = (b.hostedRuns || 0) - (a.hostedRuns || 0);
    if (runDelta !== 0) {
      return runDelta;
    }
    return a.displayName.localeCompare(b.displayName);
  });
  const visibleHosts = sortedHosts
    .filter((host) => showAllHosts.checked || host.hostedRuns > 0 || (host.rating?.reviewCount || 0) > 0)
    .filter((host) => !query || host.displayName.toLowerCase().includes(query));

  renderHostStats(sortedHosts);

  if (!visibleHosts.length) {
    const empty = document.createElement("p");
    empty.className = "meta";
    empty.textContent = showAllHosts.checked
      ? "No hosts match that search."
      : "No reviewed hosts yet. Toggle Show all synced hosts to browse the full role roster.";
    hostGrid.appendChild(empty);
    return;
  }

  visibleHosts.slice(0, showAllHosts.checked ? 40 : 12).forEach((host) => {
    const row = document.createElement("article");
    row.className = "host-row";
    const rating = host.rating || emptyRating();
    const initials = host.displayName.slice(0, 2).toUpperCase();
    const badges = (host.badges || []).map((badge) => `<span class="host-badge">${escapeHtml(badge.label)}</span>`).join("");
    row.innerHTML = `
      <div class="host-card-head">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div>
          <h3>${escapeHtml(host.displayName)}</h3>
          <p class="meta">${host.hostedRuns || 0} runs logged${badges ? "" : " · no badges yet"}</p>
          ${badges ? `<div class="host-badges">${badges}</div>` : ""}
        </div>
      </div>
      <div class="host-row-metrics">
        <span><strong>${rating.overall ? rating.overall.toFixed(2) : "--"}</strong> /5</span>
        <span>${rating.reviewCount || 0} counted</span>
        <span>${rating.visibleReviewCount || rating.reviewCount || 0} feedback</span>
        <span>${rating.reviewCount ? `${rating.wouldReplayPercent}% replay` : "No replay data"}</span>
      </div>
    `;
    hostGrid.appendChild(row);
  });

  if (visibleHosts.length > (showAllHosts.checked ? 40 : 12)) {
    const note = document.createElement("p");
    note.className = "meta";
    note.textContent = `Showing ${showAllHosts.checked ? 40 : 12} of ${visibleHosts.length} matching hosts. Use search to narrow the list.`;
    hostGrid.appendChild(note);
  }
};

const renderSessions = () => {
  sessionTable.replaceChildren();
  if (!state.sessions.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="empty" colspan="8">No completed sessions logged yet.</td>`;
    sessionTable.appendChild(row);
    return;
  }

  state.sessions.slice(0, 20).forEach((session) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${escapeHtml(session.code)}</strong></td>
      <td>${escapeHtml(session.hostName)}</td>
      <td>${formatDate(session.runDate)}</td>
      <td>${escapeHtml(session.mode)}</td>
      <td>${escapeHtml(session.outcome)}${session.cryptReached ? " + Crypt" : ""}</td>
      <td>${escapeHtml(session.playerCount)}</td>
      <td>${Array.isArray(session.loggedPlayers) && session.loggedPlayers.length ? session.loggedPlayers.map((player) => escapeHtml(player.displayName)).join(", ") : "--"}</td>
      <td>${formatDate(session.expiresAt)}</td>
    `;
    sessionTable.appendChild(row);
  });
};

const renderUser = () => {
  const user = getUser();
  discordLogin.hidden = Boolean(user);
  logoutButton.hidden = !user;

  if (!authState.configured) {
    authAvatar.textContent = "--";
    authName.textContent = "Discord OAuth not configured";
    authRole.textContent = "Configure Discord OAuth before using Host Registry actions.";
  } else if (!user) {
    authAvatar.textContent = "--";
    authAvatar.style.backgroundImage = "";
    authName.textContent = "Not signed in";
    authRole.textContent = "Sign in with Discord to claim sessions or log host runs.";
  } else {
    authAvatar.textContent = user.avatarUrl ? "" : user.displayName.slice(0, 2).toUpperCase();
    authAvatar.style.backgroundImage = user.avatarUrl ? `url("${user.avatarUrl}")` : "";
    authName.textContent = user.displayName;
    authRole.textContent = user.isHost
      ? "Host role verified. You can log completed runs."
      : user.isPlayer
        ? "Player role verified. You can claim sessions and submit reviews."
        : "Signed in, but the Player role was not found on this Discord account.";
  }
};

const renderRatings = () => {
  ratingGrid.replaceChildren();
  metrics.forEach((metric) => {
    const label = document.createElement("label");
    label.className = "field rating-field";
    label.innerHTML = `
      <span>${metricLabels[metric]}</span>
      <input class="search-input" name="${metric}" type="range" min="1" max="5" value="4" />
      <strong data-rating-value="${metric}">4</strong>
    `;
    const input = label.querySelector("input");
    const value = label.querySelector("strong");
    input.addEventListener("input", () => {
      value.textContent = input.value;
    });
    ratingGrid.appendChild(label);
  });
};

const render = () => {
  state = normalizeState(state);
  renderHosts();
  renderSessions();
  renderUser();
  renderPlayerPicker();
};

const loadState = async () => {
  await loadAuth();
  try {
    const data = await safeFetch("/host-data", { cache: "no-store" });
    state = normalizeState(data);
    setStatus(authState.user ? "Signed in with Discord. Host registry loaded." : "Host registry loaded from backend.");
  } catch (error) {
    state = normalizeState(defaultState());
    setStatus("Unable to reach the Host Registry backend.", "error");
  }
  render();
  applyAuthRedirectMessage();
};

const ensureUser = () => {
  const user = getUser();
  if (!user) {
    throw new Error("Login with Discord first.");
  }
  return user;
};

const ensureHostUser = () => {
  const user = ensureUser();
  if (authState.configured && !user.isHost) {
    throw new Error("Discord Host role required to log sessions.");
  }
  return user;
};

logoutButton.addEventListener("click", async () => {
  try {
    await safeFetch("/auth/logout", { method: "POST" });
  } catch (error) {
  }
  authState.user = null;
  claimedSession = null;
  reviewForm.hidden = true;
  await loadState();
  setStatus("Logged out.");
});

playerSearch.addEventListener("input", () => {
  renderPlayerResults();
});

hostSearch.addEventListener("input", () => {
  renderHosts();
});

showAllHosts.addEventListener("change", () => {
  renderHosts();
});

syncPlayersButton.addEventListener("click", async () => {
  try {
    ensureHostUser();
    syncPlayersButton.disabled = true;
    syncPlayersButton.textContent = "Syncing...";
    const data = await safeFetch("/discord/sync-members", { method: "POST" });
    state.players = data.players || [];
    state.syncMeta = data.syncMeta || {};
    renderPlayerPicker();
    setStatus("Discord player roster synced.");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    syncPlayersButton.disabled = false;
    syncPlayersButton.textContent = "Sync Discord Players";
  }
});

sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(sessionForm);
  const payload = {
    runDate: formData.get("runDate"),
    mode: formData.get("mode"),
    outcome: formData.get("outcome"),
    playerCount: Number(formData.get("playerCount")),
    cryptReached: formData.get("cryptReached") === "on",
    participants: formData.get("participants"),
    notes: formData.get("notes"),
  };
  try {
    ensureHostUser();
    const data = await safeFetch("/host-sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadState();
    selectedPlayers = [];
    renderPlayerPicker();
    sessionCodeElement.hidden = false;
    sessionCodeElement.innerHTML = `<span>Review Code</span><strong>${data.session.code}</strong><small>Expires in 72 hours</small>`;
    setStatus("Completed session logged.");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

claimForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(claimForm);
  const code = formData.get("code").trim();
  try {
    ensureUser();
    const data = await safeFetch("/host-sessions/claim", {
      method: "POST",
      body: JSON.stringify({
        code,
        participantStatus: formData.get("participantStatus"),
        claimNote: formData.get("claimNote"),
      }),
    });
    await loadState();
    claimedSession = data.session;
    reviewTitle.textContent = `Review ${claimedSession.hostName}`;
    reviewContext.textContent = reviewTypeLabels[data.participant?.reviewType || "verified"] || reviewTypeLabels.verified;
    reviewForm.hidden = false;
    setStatus("Session claimed. Review is now available.");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

reviewForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!claimedSession) {
    setStatus("Claim a session before reviewing.", "error");
    return;
  }
  const formData = new FormData(reviewForm);
  const ratings = Object.fromEntries(metrics.map((metric) => [metric, Number(formData.get(metric))]));
  const payload = {
    sessionId: claimedSession.id,
    ratings,
    wouldReplay: formData.get("wouldReplay") === "on",
    comment: formData.get("comment"),
  };
  try {
    await safeFetch("/host-reviews", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadState();
    reviewForm.hidden = true;
    reviewForm.reset();
    renderRatings();
    setStatus("Review submitted.");
  } catch (error) {
    setStatus(error.message, "error");
  }
});

sessionForm.elements.runDate.value = new Date().toISOString().slice(0, 10);
renderRatings();
loadState();
