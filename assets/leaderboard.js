const statusElement = document.getElementById("status");
const table = document.getElementById("leaderboard");
const thead = table.querySelector("thead");
const tbody = table.querySelector("tbody");

const sheetUrl = "/leaderboard-data";

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

const renderTable = (rows) => {
  if (rows.length === 0) {
    renderEmpty("No leaderboard data available yet.");
    return;
  }

  const [headerRow, ...bodyRows] = rows;
  const maxBodyColumns = bodyRows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnCount = Math.max(headerRow.length, maxBodyColumns, 1);
  const safeHeader = headerRow.length ? headerRow.slice(0, columnCount) : [];

  while (safeHeader.length < columnCount) {
    safeHeader.push(`Column ${safeHeader.length + 1}`);
  }

  clearElement(thead);
  const headerRowElement = document.createElement("tr");
  safeHeader.forEach((cell) => {
    const headerCell = document.createElement("th");
    headerCell.textContent = cell;
    headerRowElement.appendChild(headerCell);
  });
  thead.appendChild(headerRowElement);

  if (bodyRows.length === 0) {
    renderEmpty("No leaderboard entries yet.", {
      clearHeader: false,
      colSpan: safeHeader.length,
    });
    return;
  }

  clearElement(tbody);
  bodyRows.forEach((row) => {
    const rowElement = document.createElement("tr");
    for (let index = 0; index < columnCount; index += 1) {
      const cellElement = document.createElement("td");
      cellElement.textContent = row[index] ?? "";
      rowElement.appendChild(cellElement);
    }
    tbody.appendChild(rowElement);
  });
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

const loadLeaderboard = async () => {
  try {
    table.setAttribute("aria-busy", "true");
    renderSkeleton();
    const response = await fetch(sheetUrl);
    if (!response.ok) {
      throw new Error(`Sheet responded with ${response.status} ${response.statusText}`);
    }
    const csv = await response.text();
    const rows = parseCsv(csv.trim());
    updateStatus("Leaderboard loaded.", "ok");
    renderTable(rows);
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
