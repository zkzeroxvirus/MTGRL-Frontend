const statusElement = document.getElementById("status");
const metaElement = document.getElementById("meta");
const table = document.getElementById("leaderboard");
const thead = table.querySelector("thead");
const tbody = table.querySelector("tbody");
const statElements = {
  players: document.querySelector('[data-stat="players"]'),
  essence: document.querySelector('[data-stat="essence"]'),
  topScore: document.querySelector('[data-stat="top-score"]'),
};

const sheetUrl = "/leaderboard-data";

const ACHIEVEMENT_WEIGHT = 50000;
const CRYPT_BUFF_WEIGHT = 5000;
const TICKET_WEIGHT = 500;
const DEFAULT_COLUMN_INDEXES = {
  player: 1,
  essence: 2,
  achievements: 5,
  cryptBuffs: 6,
  tickets: 7,
};

const updateStatus = (text, tone) => {
  statusElement.textContent = text;
  statusElement.classList.toggle("error", tone === "error");
};

const parseCsvLine = (line) => line
  .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
  .map((cell) => {
    const trimmedCell = cell.trim();
    if (trimmedCell.startsWith("\"") && trimmedCell.endsWith("\"")) {
      return trimmedCell.slice(1, -1).replace(/\"\"/g, "\"");
    }
    return trimmedCell;
  });

const parseCsv = (text) => text
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map(parseCsvLine);

const clearElement = (element) => {
  element.replaceChildren();
};

const parseKvList = (cell) => {
  const result = {};
  if (!cell) {
    return result;
  }
  String(cell).split("|").forEach((part) => {
    if (!part || !part.includes(":")) {
      return;
    }
    const splitIndex = part.indexOf(":");
    const key = part.slice(0, splitIndex).trim();
    const rawValue = part.slice(splitIndex + 1).trim();
    const numericValue = Number(rawValue);
    if (key.length > 0) {
      result[key] = Number.isFinite(numericValue) ? numericValue : 0;
    }
  });
  return result;
};

const countNonZero = (values) => Object.values(values).filter((value) => value > 0).length;

const sumValues = (values) => Object.values(values)
  .filter((value) => Number.isFinite(value))
  .reduce((total, value) => total + value, 0);

const normalizeHeader = (headerRow) => headerRow.map((cell) => String(cell).trim().toLowerCase());

const findColumnIndex = (headerRow, names, fallbackIndex) => {
  if (!headerRow.length) {
    return fallbackIndex;
  }
  const normalizedHeader = normalizeHeader(headerRow);
  const foundIndex = normalizedHeader.findIndex((cell) => names.includes(cell));
  return foundIndex === -1 ? fallbackIndex : foundIndex;
};

const resolveColumnIndexes = (headerRow) => ({
  player: findColumnIndex(headerRow, ["player", "name"], DEFAULT_COLUMN_INDEXES.player),
  essence: findColumnIndex(headerRow, ["essence"], DEFAULT_COLUMN_INDEXES.essence),
  achievements: findColumnIndex(
    headerRow,
    ["achievements", "achievement"],
    DEFAULT_COLUMN_INDEXES.achievements,
  ),
  cryptBuffs: findColumnIndex(
    headerRow,
    ["crypt buffs", "crypt", "buffs"],
    DEFAULT_COLUMN_INDEXES.cryptBuffs,
  ),
  tickets: findColumnIndex(headerRow, ["tickets", "ticket"], DEFAULT_COLUMN_INDEXES.tickets),
});

const renderEmpty = (message, options = {}) => {
  const { clearHeader = true, colSpan = 1 } = options;
  if (clearHeader) {
    clearElement(thead);
  }
  clearElement(tbody);
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.className = "empty";
  cell.colSpan = colSpan;
  cell.textContent = message;
  row.appendChild(cell);
  tbody.appendChild(row);
};

const renderSkeleton = (columns = 4, rows = 6) => {
  clearElement(thead);
  clearElement(tbody);
  const headerRowElement = document.createElement("tr");
  for (let index = 0; index < columns; index += 1) {
    const headerCell = document.createElement("th");
    headerCell.textContent = " ";
    headerRowElement.appendChild(headerCell);
  }
  thead.appendChild(headerRowElement);

  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const row = document.createElement("tr");
    row.className = "skeleton-row";
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const cell = document.createElement("td");
      cell.textContent = "...";
      row.appendChild(cell);
    }
    tbody.appendChild(row);
  }
};

const renderTable = (entries) => {
  if (entries.length === 0) {
    renderEmpty("No leaderboard entries yet.");
    return;
  }

  const headerRowElement = document.createElement("tr");
  ["Rank", "Player", "Score", "Essence", "Ach", "Buffs", "Tickets", "Unlocks"].forEach((label) => {
    const headerCell = document.createElement("th");
    headerCell.textContent = label;
    headerRowElement.appendChild(headerCell);
  });

  clearElement(thead);
  thead.appendChild(headerRowElement);

  clearElement(tbody);
  entries.forEach((entry, index) => {
    const rowElement = document.createElement("tr");
    rowElement.classList.add("leaderboard-row");
    if (index < 3) {
      rowElement.classList.add(`rank-${index + 1}`);
    }

    const cells = [
      String(index + 1),
      entry.name,
      entry.score.toLocaleString(),
      entry.essence.toLocaleString(),
      String(entry.achCount),
      String(entry.buffCount),
      String(entry.ticketCount),
      String(entry.totalUnlocks),
    ];

    cells.forEach((value, cellIndex) => {
      const cellElement = document.createElement("td");
      cellElement.textContent = value;
      if (cellIndex === 1) {
        cellElement.classList.add("player-cell");
      }
      rowElement.appendChild(cellElement);
    });

    tbody.appendChild(rowElement);
  });
};

const updateStats = (entries) => {
  const totalPlayers = entries.length;
  const totalEssence = entries.reduce((total, entry) => total + entry.essence, 0);
  const topScore = totalPlayers ? entries[0].score : 0;

  if (statElements.players) {
    statElements.players.textContent = totalPlayers.toLocaleString();
  }
  if (statElements.essence) {
    statElements.essence.textContent = Math.round(totalEssence).toLocaleString();
  }
  if (statElements.topScore) {
    statElements.topScore.textContent = topScore.toLocaleString();
  }
};

const friendlyErrorMessage = (error) => {
  if (error instanceof Error && error.message.startsWith("Sheet responded with")) {
    return "Leaderboard data source returned an error.";
  }
  if (error instanceof TypeError) {
    return "Failed to connect to the leaderboard data source.";
  }
  return "Unable to load leaderboard data.";
};

const buildEntries = (rows) => {
  if (!rows.length) {
    return [];
  }

  const headerRow = rows[0] ?? [];
  const normalizedHeader = normalizeHeader(headerRow);
  const headerKeywords = [
    "player",
    "name",
    "essence",
    "achievements",
    "achievement",
    "crypt buffs",
    "buffs",
    "tickets",
    "ticket",
  ];
  const hasHeader = headerKeywords.some((keyword) => normalizedHeader.includes(keyword));
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  const columnIndexes = resolveColumnIndexes(hasHeader ? headerRow : []);

  return bodyRows
    .map((row) => {
      const name = String(row[columnIndexes.player] ?? "").trim();
      if (!name) {
        return null;
      }

      const essence = Number(row[columnIndexes.essence]) || 0;
      const achievements = parseKvList(row[columnIndexes.achievements]);
      const cryptBuffs = parseKvList(row[columnIndexes.cryptBuffs]);
      const tickets = parseKvList(row[columnIndexes.tickets]);

      const achCount = countNonZero(achievements);
      const buffCount = countNonZero(cryptBuffs);
      const ticketCount = countNonZero(tickets);
      const totalUnlocks = achCount + buffCount + ticketCount;
      const score = (achCount * ACHIEVEMENT_WEIGHT)
        + (buffCount * CRYPT_BUFF_WEIGHT)
        + (ticketCount * TICKET_WEIGHT)
        + essence;

      return {
        name,
        essence: Math.round(essence),
        achCount,
        buffCount,
        ticketCount,
        totalUnlocks,
        ticketsTotal: sumValues(tickets),
        score: Math.round(score),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
};

const loadLeaderboard = async () => {
  try {
    table.setAttribute("aria-busy", "true");
    renderSkeleton(8, 8);
    const response = await fetch(sheetUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Sheet responded with ${response.status} ${response.statusText}`);
    }
    const csv = await response.text();
    const rows = parseCsv(csv.trim());
    const entries = buildEntries(rows);
    updateStatus("Leaderboard loaded.", "ok");
    renderTable(entries);
    updateStats(entries);
    if (metaElement) {
      metaElement.textContent = `Updated ${new Date().toLocaleString()}`;
    }
  } catch (error) {
    console.error(error);
    const message = friendlyErrorMessage(error);
    updateStatus(message, "error");
    renderEmpty(message);
  } finally {
    table.removeAttribute("aria-busy");
  }
};

loadLeaderboard();
