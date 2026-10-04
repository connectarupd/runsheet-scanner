/**
 * Google Apps Script backend for RunSheet app.
 *
 * Google Sheet tabs:
 * 1) Scans: app records
 * 2) GridMaster: manually maintain Sort Code -> Grid No
 *
 * GridMaster columns:
 * A = Sort Code
 * B = Grid No
 *
 * Deploy as Web App: Execute as Me, Who has access = Anyone.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let scans = ss.getSheetByName("Scans");
  if (!scans) scans = ss.insertSheet("Scans");
  if (scans.getLastRow() === 0) {
    scans.appendRow(["Timestamp","Type","Employee ID","RunSheet ID","Sort Code","Grid No","Scanned Grid","Status"]);
  }

  let master = ss.getSheetByName("GridMaster");
  if (!master) {
    master = ss.insertSheet("GridMaster");
    master.appendRow(["Sort Code","Grid No"]);
  }
}

function doGet(e) {
  setup();
  const action = (e && e.parameter && e.parameter.action) || "";
  if(action === "gridmaster"){
    const sh = getOrCreateSheet_("GridMaster", ["Sort Code","Grid No"]);
    const values = sh.getDataRange().getValues();
    const rows = [];
    for(let i=1;i<values.length;i++){
      if(values[i][0] && values[i][1]){
        rows.push({sortCode:String(values[i][0]), gridNo:String(values[i][1])});
      }
    }
    return json({ok:true, rows});
  }

  if (action === "lookup") {
    const sortCode = normalizeCode_(e.parameter.sortCode || "");
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("GridMaster");
    const values = sh.getDataRange().getValues();

    for (let i = 1; i < values.length; i++) {
      const sc = String(values[i][0] || "").trim().toUpperCase();
      if (sc === sortCode) {
        return json({ok:true, sortCode:sortCode, gridNo:String(values[i][1] || "").trim().toUpperCase()});
      }
    }
    return json({ok:false,error:"Sort Code not found",sortCode:sortCode});
  }
  return json({ok:true,service:"RunSheet Scanner"});
}

function doPost(e) {
  try {
    setup();
    const data = JSON.parse(e.postData.contents || "{}");
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scans");
    sh.appendRow([
      new Date(data.timestamp || new Date()),
      data.type || "",
      data.employeeId || "",
      data.runSheetId || "",
      data.sortCode || "",
      data.gridNo || "",
      data.scannedGrid || "",
      data.status || ""
    ]);
    return json({ok:true});
  } catch (err) {
    return json({ok:false,error:String(err)});
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
