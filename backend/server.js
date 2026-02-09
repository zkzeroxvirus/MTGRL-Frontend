import express from "express";
import { google } from "googleapis";

const app = express();
const port = process.env.PORT || 3000;

const sheetId = process.env.LEADERBOARD_SHEET_ID;
const sheetGid = Number.parseInt(process.env.LEADERBOARD_SHEET_GID || "0", 10);
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "/app/service_account.json";

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
    res.set("Content-Type", "text/csv; charset=utf-8");
    return res.status(200).send(toCsv(rows));
  } catch (error) {
    console.error("Failed to load sheet data", error);
    return res.status(500).json({ error: "Failed to load sheet data" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Leaderboard backend listening on ${port}`);
});
