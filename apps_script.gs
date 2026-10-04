/**
 * Sort Grid Scanner by ArupD
 * Fresh Google Apps Script backend.
 *
 * Bind this script to a NEW Google Spreadsheet.
 * Run setup() once, authorize, then deploy as Web App:
 * Execute as: Me
 * Who has access: Anyone
 */

const CFG = {
  MASTER: "GridMaster",
  LOG: "Scans",
  MASTER_HEADERS: ["Sort Code", "Grid No"],
  LOG_HEADERS: [
    "Timestamp", "Type", "Employee ID", "RunSheet ID",
    "Sort Code", "Grid No", "Scanned Grid", "Status"
  ]
};

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("Open this script from the new Google Sheet (Extensions > Apps Script).");

  ensureSheet_(ss, CFG.MASTER, CFG.MASTER_HEADERS);
  ensureSheet_(ss, CFG.LOG, CFG.LOG_HEADERS);
  return { ok: true, spreadsheetId: ss.getId(), tabs: [CFG.MASTER, CFG.LOG] };
}

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || "health").toLowerCase();
    if (action === "health") {
      const ss = getSpreadsheet_();
      return json_({
        ok: true,
        service: "Sort Grid Scanner by ArupD",
        spreadsheet: ss.getName(),
        actions: ["health", "gridmaster", "lookup"]
      });
    }

    if (action === "gridmaster") {
      const rows = readGridMaster_();
      return json_({ ok: true, rows: rows });
    }

    if (action === "lookup") {
      const requested = normalizeCode_(e && e.parameter ? e.parameter.sortCode : "");
      if (!requested) return json_({ ok: false, error: "Missing Sort Code", sortCode: "" });

      const rows = readGridMaster_();
      const match = rows.find(r => normalizeCode_(r.sortCode) === requested);
      if (!match) {
        return json_({ ok: false, error: "Sort Code not found in GridMaster", sortCode: requested });
      }
      return json_({ ok: true, sortCode: match.sortCode, gridNo: match.gridNo });
    }

    return json_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function doPost(e) {
  try {
    const ss = getSpreadsheet_();
    const sh = ensureSheet_(ss, CFG.LOG, CFG.LOG_HEADERS);
    const raw = e && e.postData ? e.postData.contents : "{}";
    const data = JSON.parse(raw || "{}");

    sh.appendRow([
      data.timestamp ? new Date(data.timestamp) : new Date(),
      cleanText_(data.type),
      cleanText_(data.employeeId),
      cleanText_(data.runSheetId || data.rsId),
      cleanText_(data.sortCode),
      cleanText_(data.gridNo),
      cleanText_(data.scannedGrid),
      cleanText_(data.status)
    ]);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function readGridMaster_() {
  const ss = getSpreadsheet_();
  const sh = ensureSheet_(ss, CFG.MASTER, CFG.MASTER_HEADERS);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const values = sh.getRange(1, 1, lastRow, Math.max(2, sh.getLastColumn())).getDisplayValues();
  const headers = values[0].map(v => normalizeHeader_(v));
  let codeCol = headers.indexOf("sortcode");
  let gridCol = headers.indexOf("gridno");
  if (codeCol < 0) codeCol = 0;
  if (gridCol < 0) gridCol = 1;

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const code = cleanText_(values[i][codeCol]).toUpperCase();
    const grid = cleanText_(values[i][gridCol]).toUpperCase();
    if (code && grid) out.push({ sortCode: code, gridNo: grid });
  }
  return out;
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No bound spreadsheet. Open Apps Script from the target Google Sheet.");
  return ss;
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function normalizeCode_(value) {
  return String(value == null ? "" : value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeHeader_(value) {
  return String(value == null ? "" : value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanText_(value) {
  return String(value == null ? "" : value).trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
