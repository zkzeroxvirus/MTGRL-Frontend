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
const hostProfileBackdrop = document.getElementById("host-profile-backdrop");
const hostProfileContent = document.getElementById("host-profile-content");
const hostProfileClose = document.getElementById("host-profile-close");
const sessionTable = document.getElementById("session-table");
const sessionActionsHead = document.getElementById("session-actions-head");
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
let selectedHostId = null;
let selectedSessionId = null;
let authState = {
  configured: false,
  guildRoleCheckConfigured: false,
  playerRoleCheckConfigured: false,
  adminRoleCheckConfigured: false,
  moderatorRoleCheckConfigured: false,
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

const canModerate = () => Boolean(authState.user?.isAdmin || authState.user?.isModerator);

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
      adminRoleCheckConfigured: Boolean(data.adminRoleCheckConfigured),
      moderatorRoleCheckConfigured: Boolean(data.moderatorRoleCheckConfigured),
      user: data.user || null,
    };
  } catch (error) {
    authState = {
      configured: false,
      guildRoleCheckConfigured: false,
      playerRoleCheckConfigured: false,
      adminRoleCheckConfigured: false,
      moderatorRoleCheckConfigured: false,
      user: null,
    };
  }
};

const calculateRating = (hostId, reviews) => {
  const allHostReviews = reviews.filter((review) => review.hostId === hostId && review.status !== "hidden");
  const hostReviews = allHostReviews.filter((review) => (
    review.status !== "hidden"
    && (review.reviewType || "verified") === "verified"
    && review.countsTowardRating !== false
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

const averageReviewRating = (review) => {
  const values = metrics.map((metric) => Number(review.ratings?.[metric] || 0)).filter(Boolean);
  if (!values.length) {
    return 0;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
};

const getHostProfileData = (hostId) => {
  const host = state.hosts.find((entry) => entry.id === hostId);
  if (!host) {
    return null;
  }
  const sessions = state.sessions
    .filter((session) => session.hostId === hostId)
    .sort((a, b) => new Date(b.runDate || b.createdAt || 0) - new Date(a.runDate || a.createdAt || 0));
  const reviews = state.reviews
    .filter((review) => review.hostId === hostId && (review.status !== "hidden" || canModerate()))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return { host, sessions, reviews };
};

const getSessionProfileData = (sessionId) => {
  const session = state.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return null;
  }
  const host = state.hosts.find((entry) => entry.id === session.hostId);
  const reviews = state.reviews
    .filter((review) => review.sessionId === sessionId)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const participants = state.participants
    .filter((participant) => participant.sessionId === sessionId)
    .sort((a, b) => String(a.role || "").localeCompare(String(b.role || "")));
  return { session, host, reviews, participants };
};

const reviewShortLabel = (review) => {
  const type = review.reviewType || "verified";
  if (type === "partial") {
    return "Partial";
  }
  if (type === "unlisted") {
    return "Unlisted";
  }
  return "Verified";
};

const reviewStatusLabel = (review) => {
  if (review.status === "hidden") {
    return "Hidden";
  }
  if (review.countsTowardRating === false) {
    return "Excluded";
  }
  return "Visible";
};

const closeHostProfile = () => {
  selectedHostId = null;
  selectedSessionId = null;
  hostProfileBackdrop.hidden = true;
  document.body.classList.remove("has-open-modal");
};

const renderHostProfile = () => {
  const profile = getHostProfileData(selectedHostId);
  if (!profile) {
    closeHostProfile();
    return;
  }

  const { host, sessions, reviews } = profile;
  const rating = host.rating || emptyRating();
  const initials = host.displayName.slice(0, 2).toUpperCase();
  const badges = host.badges || [];
  const metricRows = metrics.map((metric) => {
    const value = Number(rating.metrics?.[metric] || 0);
    const percent = Math.max(0, Math.min(100, (value / 5) * 100));
    return `
      <div class="profile-metric-row">
        <span>${metricLabels[metric]}</span>
        <div class="profile-meter" aria-hidden="true"><span style="width: ${percent}%"></span></div>
        <strong>${value ? value.toFixed(2) : "--"}</strong>
      </div>
    `;
  }).join("");
  const badgeMarkup = badges.length
    ? badges.map((badge) => `
        <div class="profile-badge">
          <strong>${escapeHtml(badge.label)}</strong>
          <span>${escapeHtml(badge.reason || "Earned from logged sessions and reviews.")}</span>
        </div>
      `).join("")
    : `<p class="meta">No badges yet. Badges appear after logged sessions and strong counted reviews.</p>`;
  const reviewMarkup = reviews.length
    ? reviews.slice(0, 6).map((review) => `
        <article class="profile-feedback">
          <div>
            <strong>${escapeHtml(review.reviewerName || "Player")}</strong>
            <span class="host-badge">${escapeHtml(reviewShortLabel(review))}</span>
          </div>
          <p>${escapeHtml(review.comment || "No written comment.")}</p>
          <small>${averageReviewRating(review) || "--"} /5 average &middot; ${formatDate(review.createdAt)}${review.wouldReplay ? " &middot; would replay" : ""}</small>
        </article>
      `).join("")
    : `<p class="meta">No visible feedback for this host yet.</p>`;
  const sessionMarkup = sessions.length
    ? sessions.slice(0, 6).map((session) => `
        <div class="profile-session-row">
          <strong>${formatDate(session.runDate)}</strong>
          <span>${escapeHtml(session.mode)} &middot; ${escapeHtml(session.outcome)}${session.cryptReached ? " + Crypt" : ""}</span>
          <span>${escapeHtml(session.playerCount)} player${Number(session.playerCount) === 1 ? "" : "s"}</span>
        </div>
      `).join("")
    : `<p class="meta">No logged sessions found in the recent host data.</p>`;

  hostProfileContent.innerHTML = `
    <div class="profile-hero">
      <div class="avatar profile-avatar">${host.avatarUrl ? "" : escapeHtml(initials)}</div>
      <div>
        <span class="eyebrow">Host Profile</span>
        <h2 id="host-profile-title">${escapeHtml(host.displayName)}</h2>
        <p>${rating.visibleReviewCount || rating.reviewCount || 0} visible feedback entries &middot; ${host.hostedRuns || 0} logged runs</p>
      </div>
      <div class="profile-score">
        <strong>${rating.overall ? rating.overall.toFixed(2) : "--"}</strong>
        <span>/5</span>
      </div>
    </div>
    <div class="profile-stat-grid">
      <div class="stat"><span class="stat-label">Counted</span><span class="stat-value">${rating.reviewCount || 0}</span></div>
      <div class="stat"><span class="stat-label">All Feedback</span><span class="stat-value">${rating.visibleReviewCount || rating.reviewCount || 0}</span></div>
      <div class="stat"><span class="stat-label">Replay</span><span class="stat-value">${rating.reviewCount ? `${rating.wouldReplayPercent}%` : "--"}</span></div>
    </div>
    <div class="profile-grid">
      <section class="profile-panel">
        <h3>Badges</h3>
        <div class="profile-badge-list">${badgeMarkup}</div>
      </section>
      <section class="profile-panel">
        <h3>Category Ratings</h3>
        <div class="profile-metric-list">${metricRows}</div>
      </section>
      <section class="profile-panel">
        <h3>Recent Feedback</h3>
        <div class="profile-feedback-list">${reviewMarkup}</div>
      </section>
      <section class="profile-panel">
        <h3>Recent Sessions</h3>
        <div class="profile-session-list">${sessionMarkup}</div>
      </section>
    </div>
  `;
  const avatar = hostProfileContent.querySelector(".profile-avatar");
  if (avatar && host.avatarUrl) {
    avatar.style.backgroundImage = `url("${host.avatarUrl}")`;
  }
};

const openHostProfile = (hostId) => {
  selectedHostId = hostId;
  selectedSessionId = null;
  renderHostProfile();
  hostProfileBackdrop.hidden = false;
  document.body.classList.add("has-open-modal");
  hostProfileClose.focus();
};

const sessionPlayersMarkup = (session) => {
  if (!Array.isArray(session.loggedPlayers) || !session.loggedPlayers.length) {
    return `<p class="meta">No players were listed by the host.</p>`;
  }
  return session.loggedPlayers.map((player) => `
    <span class="player-chip session-player-chip">${escapeHtml(player.displayName)}</span>
  `).join("");
};

const sessionParticipantsMarkup = (participants) => {
  if (!participants.length) {
    return `<p class="meta">No claims or participant records yet.</p>`;
  }
  return participants.map((participant) => `
    <div class="profile-session-row">
      <strong>${escapeHtml(participant.displayName || "Unknown")}</strong>
      <span>${escapeHtml(participant.role || "participant")}</span>
      <span>${escapeHtml(participant.reviewType || participant.participantStatus || "--")}</span>
    </div>
  `).join("");
};

const reviewMetricsMarkup = (review) => metrics.map((metric) => `
  <span>${metricLabels[metric]} <strong>${Number(review.ratings?.[metric] || 0) || "--"}</strong></span>
`).join("");

const reviewModerationButtons = (review) => {
  if (!canModerate()) {
    return "";
  }
  const isHidden = review.status === "hidden";
  const isVerified = (review.reviewType || "verified") === "verified";
  const canCount = isVerified && review.countsTowardRating !== false;
  return `
    <div class="profile-actions">
      <button class="button ${isHidden ? "secondary" : "danger"} small" type="button" data-review-id="${escapeHtml(review.id)}" data-review-action="${isHidden ? "restore" : "hide"}">${isHidden ? "Restore" : "Hide"}</button>
      ${isVerified ? `<button class="button secondary small" type="button" data-review-id="${escapeHtml(review.id)}" data-review-action="${canCount ? "exclude" : "include"}">${canCount ? "Exclude Rating" : "Include Rating"}</button>` : ""}
    </div>
  `;
};

const renderSessionProfile = () => {
  const profile = getSessionProfileData(selectedSessionId);
  if (!profile) {
    closeHostProfile();
    return;
  }

  const { session, reviews, participants } = profile;
  const verifiedReviews = reviews.filter((review) => (review.reviewType || "verified") === "verified");
  const countedReviews = verifiedReviews.filter((review) => review.status !== "hidden" && review.countsTowardRating !== false);
  const hiddenReviews = reviews.filter((review) => review.status === "hidden");
  const reviewMarkup = reviews.length
    ? reviews.map((review) => `
      <article class="profile-feedback ${review.status === "hidden" ? "is-hidden-review" : ""}">
        <div>
          <strong>${escapeHtml(review.reviewerName || "Player")}</strong>
          <span class="host-badge">${escapeHtml(reviewShortLabel(review))}</span>
          <span class="host-badge">${escapeHtml(reviewStatusLabel(review))}</span>
        </div>
        <p>${escapeHtml(review.comment || "No written comment.")}</p>
        <div class="review-metric-pills">${reviewMetricsMarkup(review)}</div>
        <small>${averageReviewRating(review) || "--"} /5 average &middot; ${formatDate(review.createdAt)}${review.wouldReplay ? " &middot; would replay" : ""}</small>
        ${review.moderationReason ? `<small>Last moderation note: ${escapeHtml(review.moderationReason)}</small>` : ""}
        ${reviewModerationButtons(review)}
      </article>
    `).join("")
    : `<p class="meta">No reviews have been submitted for this session.</p>`;

  hostProfileContent.innerHTML = `
    <div class="profile-hero">
      <div class="avatar profile-avatar">${escapeHtml(session.hostName?.slice(0, 2).toUpperCase() || "MT")}</div>
      <div>
        <span class="eyebrow">Session Profile</span>
        <h2 id="host-profile-title">${escapeHtml(session.code)}</h2>
        <p>${escapeHtml(session.hostName)} &middot; ${formatDate(session.runDate)} &middot; ${escapeHtml(session.mode)}</p>
      </div>
      <div class="profile-score">
        <strong>${reviews.length}</strong>
        <span>reviews</span>
      </div>
    </div>
    <div class="profile-stat-grid">
      <div class="stat"><span class="stat-label">Players</span><span class="stat-value">${escapeHtml(session.playerCount)}</span></div>
      <div class="stat"><span class="stat-label">Counted</span><span class="stat-value">${countedReviews.length}</span></div>
      <div class="stat"><span class="stat-label">Hidden</span><span class="stat-value">${hiddenReviews.length}</span></div>
    </div>
    <div class="profile-grid">
      <section class="profile-panel">
        <h3>Session Details</h3>
        <div class="key-values">
          <div class="key-value"><span class="key">Outcome</span><span class="value">${escapeHtml(session.outcome)}${session.cryptReached ? " + Crypt" : ""}</span></div>
          <div class="key-value"><span class="key">Expires</span><span class="value">${formatDate(session.expiresAt)}</span></div>
          <div class="key-value"><span class="key">Created</span><span class="value">${formatDate(session.createdAt)}</span></div>
        </div>
        ${session.notes ? `<p>${escapeHtml(session.notes)}</p>` : `<p class="meta">No session notes.</p>`}
        ${canModerate() ? `<button class="button danger small" type="button" data-session-id="${escapeHtml(session.id)}">Delete Session</button>` : ""}
      </section>
      <section class="profile-panel">
        <h3>Listed Players</h3>
        <div class="selected-players">${sessionPlayersMarkup(session)}</div>
      </section>
      <section class="profile-panel">
        <h3>Claims</h3>
        <div class="profile-session-list">${sessionParticipantsMarkup(participants)}</div>
      </section>
      <section class="profile-panel profile-panel-wide">
        <h3>Player Reviews</h3>
        <div class="profile-feedback-list">${reviewMarkup}</div>
      </section>
    </div>
  `;
};

const openSessionProfile = (sessionId) => {
  selectedSessionId = sessionId;
  selectedHostId = null;
  renderSessionProfile();
  hostProfileBackdrop.hidden = false;
  document.body.classList.add("has-open-modal");
  hostProfileClose.focus();
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
  syncPlayersButton.hidden = !(authState.user?.isHost || authState.user?.isAdmin);
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
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Open ${host.displayName} host profile`);
    const rating = host.rating || emptyRating();
    const initials = host.displayName.slice(0, 2).toUpperCase();
    const badges = (host.badges || []).map((badge) => `<span class="host-badge">${escapeHtml(badge.label)}</span>`).join("");
    row.innerHTML = `
      <div class="host-card-head">
        <div class="avatar">${escapeHtml(initials)}</div>
        <div>
          <h3>${escapeHtml(host.displayName)}</h3>
          <p class="meta">${host.hostedRuns || 0} runs logged${badges ? "" : " &middot; no badges yet"}</p>
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
    row.addEventListener("click", () => openHostProfile(host.id));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openHostProfile(host.id);
      }
    });
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
  sessionActionsHead.hidden = !canModerate();
  if (!state.sessions.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="empty" colspan="${canModerate() ? 9 : 8}">No completed sessions logged yet.</td>`;
    sessionTable.appendChild(row);
    return;
  }

  state.sessions.slice(0, canModerate() ? 100 : 20).forEach((session) => {
    const row = document.createElement("tr");
    row.className = "session-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Open session ${session.code}`);
    row.dataset.sessionProfileId = session.id;
    row.innerHTML = `
      <td><strong>${escapeHtml(session.code)}</strong></td>
      <td>${escapeHtml(session.hostName)}</td>
      <td>${formatDate(session.runDate)}</td>
      <td>${escapeHtml(session.mode)}</td>
      <td>${escapeHtml(session.outcome)}${session.cryptReached ? " + Crypt" : ""}</td>
      <td>${escapeHtml(session.playerCount)}</td>
      <td>${Array.isArray(session.loggedPlayers) && session.loggedPlayers.length ? session.loggedPlayers.map((player) => escapeHtml(player.displayName)).join(", ") : "--"}</td>
      <td>${formatDate(session.expiresAt)}</td>
      ${canModerate() ? `<td><button class="button danger small session-delete" type="button" data-session-id="${escapeHtml(session.id)}">Delete</button></td>` : ""}
    `;
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openSessionProfile(session.id);
      }
    });
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
    const roles = [];
    if (user.isAdmin) {
      roles.push("Admin");
    }
    if (user.isModerator) {
      roles.push("Moderator");
    }
    if (user.isHost) {
      roles.push("Host");
    }
    if (user.isPlayer) {
      roles.push("Player");
    }
    authRole.textContent = roles.length
      ? `${roles.join(", ")} role${roles.length === 1 ? "" : "s"} verified.`
      : "Signed in, but no configured MTGR role was found on this Discord account.";
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
  if (!hostProfileBackdrop.hidden) {
    if (selectedHostId) {
      renderHostProfile();
    } else if (selectedSessionId) {
      renderSessionProfile();
    }
  }
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

const ensureHostOrAdminUser = () => {
  const user = ensureUser();
  if (authState.configured && !user.isHost && !user.isAdmin) {
    throw new Error("Discord Host or Admin role required.");
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

hostProfileClose.addEventListener("click", closeHostProfile);

hostProfileBackdrop.addEventListener("click", (event) => {
  if (event.target === hostProfileBackdrop) {
    closeHostProfile();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !hostProfileBackdrop.hidden) {
    closeHostProfile();
  }
});

syncPlayersButton.addEventListener("click", async () => {
  try {
    ensureHostOrAdminUser();
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

const deleteSession = async (sessionId, button = null) => {
  const session = state.sessions.find((entry) => entry.id === sessionId);
  if (!session) {
    return;
  }
  const confirmed = window.confirm(`Delete test run ${session.code} by ${session.hostName}? This also removes attached claims and reviews.`);
  if (!confirmed) {
    return;
  }
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Deleting...";
    }
    await safeFetch(`/host-sessions/${encodeURIComponent(session.id)}`, { method: "DELETE" });
    closeHostProfile();
    await loadState();
    setStatus(`Deleted test run ${session.code}.`);
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = "Delete";
    }
    setStatus(error.message, "error");
  }
};

sessionTable.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-session-id]");
  if (deleteButton) {
    await deleteSession(deleteButton.dataset.sessionId, deleteButton);
    return;
  }
  const row = event.target.closest("[data-session-profile-id]");
  if (row) {
    openSessionProfile(row.dataset.sessionProfileId);
  }
});

hostProfileContent.addEventListener("click", async (event) => {
  const reviewButton = event.target.closest("[data-review-action]");
  if (reviewButton) {
    try {
      reviewButton.disabled = true;
      const data = await safeFetch(`/host-reviews/${encodeURIComponent(reviewButton.dataset.reviewId)}/moderate`, {
        method: "POST",
        body: JSON.stringify({ action: reviewButton.dataset.reviewAction }),
      });
      state.hosts = data.hosts || state.hosts;
      await loadState();
      selectedSessionId = selectedSessionId || state.reviews.find((review) => review.id === data.review?.id)?.sessionId || null;
      if (selectedSessionId) {
        renderSessionProfile();
      }
      setStatus(`Review ${reviewButton.dataset.reviewAction} complete.`);
    } catch (error) {
      reviewButton.disabled = false;
      setStatus(error.message, "error");
    }
    return;
  }

  const sessionButton = event.target.closest("[data-session-id]");
  if (sessionButton) {
    await deleteSession(sessionButton.dataset.sessionId, sessionButton);
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
