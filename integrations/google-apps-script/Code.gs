const WEBHOOK_URL = "http://localhost:3000/api/webhooks/ingest";
const INGEST_SECRET = "replace-with-a-long-random-secret";
const SHEET_NAME = "Sheet1";
const SHEET_COLUMNS = [
  "date",
  "time",
  "manager",
  "leads",
  "calls",
  "connected_calls",
  "interested",
  "hot",
  "registration",
  "admissions",
  "sources",
  "prospects",
  "plan",
  "remarks",
  "name",
  "weekly_comment",
  "monthly_comment",
  "ai_comment",
  "next_action",
  "strengths",
  "improvement_areas"
];

function createInstallableTrigger() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.newTrigger("onFormSubmitHandler")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
}

function onFormSubmitHandler(e) {
  const row = extractRowFromEvent(e);
  const payload = {
    kind: "google-sheet",
    source: "google-form",
    origin: "apps-script",
    timestamp: new Date().toISOString(),
    row: row
  };

  const response = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: {
      "x-ingest-secret": INGEST_SECRET
    },
    muteHttpExceptions: true
  });

  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}

function doPost(e) {
  try {
    const sheet = SpreadsheetApp.openById("11SdnTPhyiB9eir6UgIJs-9Wji8ubuvhOTESxft1y9ns").getSheetByName(SHEET_NAME);
    const raw = e.postData && e.postData.contents ? e.postData.contents : "";
    let data = {};

    try {
      data = JSON.parse(raw);
    } catch (err) {
      data = e.parameter || {};
    }

    if (INGEST_SECRET && String(data.secret || "") !== String(INGEST_SECRET)) {
      return ContentService
        .createTextOutput(JSON.stringify({ error: "unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    Logger.log("DATA: " + JSON.stringify(data));

    const now = new Date();
    const date = Utilities.formatDate(now, "Asia/Kolkata", "dd/MM/yyyy");
    const time = Utilities.formatDate(now, "Asia/Kolkata", "HH:mm:ss");

    sheet.appendRow([
      data.date || date,
      data.time || time,
      data.manager || "",
      data.leads || "",
      data.calls || "",
      data.connected_calls || "",
      data.interested || "",
      data.hot || "",
      data.registration || "",
      data.admissions || "",
      data.sources || "",
      data.prospects || "",
      data.plan || "",
      data.remarks || "",
      data.name || "",
      data.weekly_comment || "",
      data.monthly_comment || "",
      data.ai_comment || "",
      data.next_action || "",
      data.strengths || "",
      data.improvement_areas || ""
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    const sheet = SpreadsheetApp.openById("11SdnTPhyiB9eir6UgIJs-9Wji8ubuvhOTESxft1y9ns").getSheetByName(SHEET_NAME);
    const values = sheet.getDataRange().getValues();
    if (!values || values.length === 0) {
      return jsonResponse({
        ok: true,
        columns: [],
        rows: [],
        stats: emptyStats(),
        personPerformance: null,
        filters: normalizeFilters(params)
      });
    }

    var parsed = parseSheetValues(values);
    var filteredRows = applySheetFilters(parsed.rows, params);
    var columns = buildDisplayColumns(parsed.columns, filteredRows);
    var displayRows = filteredRows.map(function (row) {
      return formatRowForDisplay(row);
    });

    return jsonResponse({
      ok: true,
      columns: columns,
      rows: displayRows,
      stats: buildStats(filteredRows),
      personPerformance: buildPersonPerformance(filteredRows, params),
      filters: normalizeFilters(params)
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: error.message
    });
  }
}

function parseSheetValues(values) {
  var firstRow = values[0] || [];
  var firstRowLabels = firstRow.map(function (cell) {
    return String(cell || "").trim();
  });
  var looksLikeHeaderRow = firstRowLabels.some(function (header) {
    return /date|time|manager|leads|calls|connected|interested|hot|registration|admissions|sources|prospects|plan|remarks|name/i.test(header);
  });

  var columns = [];
  var rows = [];

  if (looksLikeHeaderRow) {
    columns = firstRowLabels.slice();
    var maxLength = values.reduce(function (max, row) {
      return Math.max(max, row.length);
    }, columns.length);

    var targetLength = Math.max(maxLength, SHEET_COLUMNS.length);
    while (columns.length < targetLength) {
      columns.push(SHEET_COLUMNS[columns.length] || "Column " + (columns.length + 1));
    }

    rows = values.slice(1).map(function (row) {
      return rowToObject(columns, row);
    });
  } else {
    var arrayMaxLength = values.reduce(function (max, row) {
      return Math.max(max, row.length);
    }, 0);
    columns = SHEET_COLUMNS.slice();

    while (columns.length < arrayMaxLength) {
      columns.push(SHEET_COLUMNS[columns.length] || "Column " + (columns.length + 1));
    }

    rows = values.map(function (row) {
      return rowToObject(columns, row);
    });
  }

  return {
    columns: columns,
    rows: rows
  };
}

function rowToObject(columns, row) {
  var entry = {};
  columns.forEach(function (column, index) {
    entry[column] = row[index] !== undefined ? row[index] : "";
  });
  return entry;
}

function buildDisplayColumns(columns, rows) {
  var seen = {};
  var display = [];

  columns.forEach(function (column) {
    var normalized = String(column || "").trim();
    if (!normalized || seen[normalized]) {
      return;
    }

    seen[normalized] = true;
    display.push(normalized);
  });

  rows.forEach(function (row) {
    Object.keys(row).forEach(function (key) {
      if (!seen[key]) {
        seen[key] = true;
        display.push(key);
      }
    });
  });

  return display;
}

function normalizeFilters(params) {
  return {
    startDate: String(params.startDate || params.start || ""),
    endDate: String(params.endDate || params.end || ""),
    person: String(params.person || params.manager || params.name || "")
  };
}

function applySheetFilters(rows, params) {
  var filters = normalizeFilters(params);
  var startKey = normalizeDateKey(filters.startDate);
  var endKey = normalizeDateKey(filters.endDate);
  var personKey = normalizeText(filters.person);

  return rows.filter(function (row) {
    var rowDateKey = getRowDateKey(row);
    var rowPerson = normalizeText(getRowPerson(row));

    if (startKey && rowDateKey && rowDateKey < startKey) {
      return false;
    }

    if (endKey && rowDateKey && rowDateKey > endKey) {
      return false;
    }

    if (personKey) {
      var matchesPerson = rowPerson === personKey || normalizeText(String(row.name || row.Name || "")) === personKey;
      if (!matchesPerson) {
        return false;
      }
    }

    return true;
  });
}

function getRowPerson(row) {
  return String(
    row.manager ||
    row.Manager ||
    row["Team Leader"] ||
    row.teamLeader ||
    row["Manager Name"] ||
    row.name ||
    row.Name ||
    row["Employee Name"] ||
    row["employeeName"] ||
    ""
  );
}

function getRowDateKey(row) {
  return normalizeDateKey(
    row.date ||
    row.Date ||
    row.Timestamp ||
    row.timestamp ||
    row["Submission Date"] ||
    ""
  );
}

function normalizeDateKey(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, "Asia/Kolkata", "yyyy-MM-dd");
  }

  var text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    var parts = text.split("/");
    return parts[2] + "-" + parts[1] + "-" + parts[0];
  }

  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "Asia/Kolkata", "yyyy-MM-dd");
  }

  return text.toLowerCase();
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getField(row, candidates) {
  for (var i = 0; i < candidates.length; i += 1) {
    var key = candidates[i];
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function getNumericField(row, candidates) {
  return toNumber(getField(row, candidates));
}

function formatDateTimeCell(value, kind) {
  if (value instanceof Date) {
    if (kind === "date") {
      return Utilities.formatDate(value, "Asia/Kolkata", "dd/MM/yyyy");
    }

    if (kind === "time") {
      return Utilities.formatDate(value, "Asia/Kolkata", "HH:mm:ss");
    }

    return Utilities.formatDate(value, "Asia/Kolkata", "dd/MM/yyyy HH:mm:ss");
  }

  var text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (kind === "date" && /^\d{4}-\d{2}-\d{2}/.test(text)) {
    var parts = text.slice(0, 10).split("-");
    return parts[2] + "/" + parts[1] + "/" + parts[0];
  }

  return text;
}

function formatCellForDisplay(column, value) {
  var key = String(column || "").toLowerCase();

  if (/date|timestamp/.test(key)) {
    return formatDateTimeCell(value, "date");
  }

  if (/time/.test(key)) {
    return formatDateTimeCell(value, "time");
  }

  return value instanceof Date ? formatDateTimeCell(value, "datetime") : value;
}

function formatRowForDisplay(row) {
  var display = {};
  Object.keys(row || {}).forEach(function (key) {
    display[key] = formatCellForDisplay(key, row[key]);
  });
  return display;
}

function extractRowFromEvent(e) {
  const namedValues = (e && e.namedValues) || {};
  const values = (e && e.values) || [];
  const headers = Object.keys(namedValues);

  const row = {};
  headers.forEach(function (header) {
    const entry = namedValues[header];
    row[header] = Array.isArray(entry) ? entry[0] : entry;
  });

  if (!row.Timestamp && values.length > 0) {
    row.Timestamp = values[0];
  }

  return row;
}

function emptyStats() {
  return {
    totalRows: 0,
    totalLeads: 0,
    totalCalls: 0,
    totalConnectedCalls: 0,
    totalInterested: 0,
    totalHot: 0,
    totalRegistration: 0,
    totalAdmissions: 0,
    topManagers: [],
    latestRows: [],
    sourceBreakdown: {}
  };
}

function buildStats(rows) {
  var stats = emptyStats();

  rows.forEach(function (row) {
    stats.totalRows += 1;
    stats.totalLeads += getNumericField(row, ["leads", "Leads", "Lead"]);
    stats.totalCalls += getNumericField(row, ["calls", "Calls", "Call"]);
    stats.totalConnectedCalls += getNumericField(row, ["connected_calls", "connectedCalls", "Connected Calls", "Connected Call"]);
    stats.totalInterested += getNumericField(row, ["interested", "Interested", "Interested Hot", "Interested Leads"]);
    stats.totalHot += getNumericField(row, ["hot", "Hot", "Hot Leads", "Hot Lead"]);
    stats.totalRegistration += getNumericField(row, ["registration", "Registration", "Registrations"]);
    stats.totalAdmissions += getNumericField(row, ["admissions", "Admissions", "Admission"]);

    var manager = String(getField(row, ["manager", "Manager", "Team Leader", "teamLeader", "name", "Name"]) || "Unknown");
    if (!stats.sourceBreakdown[manager]) {
      stats.sourceBreakdown[manager] = {
        manager: manager,
        reports: 0,
        leads: 0,
        calls: 0,
        connected_calls: 0,
        interested: 0,
        hot: 0,
        registration: 0,
        admissions: 0
      };
    }

    var bucket = stats.sourceBreakdown[manager];
    bucket.reports += 1;
    bucket.leads += getNumericField(row, ["leads", "Leads", "Lead"]);
    bucket.calls += getNumericField(row, ["calls", "Calls", "Call"]);
    bucket.connected_calls += getNumericField(row, ["connected_calls", "connectedCalls", "Connected Calls", "Connected Call"]);
    bucket.interested += getNumericField(row, ["interested", "Interested", "Interested Hot", "Interested Leads"]);
    bucket.hot += getNumericField(row, ["hot", "Hot", "Hot Leads", "Hot Lead"]);
    bucket.registration += getNumericField(row, ["registration", "Registration", "Registrations"]);
    bucket.admissions += getNumericField(row, ["admissions", "Admissions", "Admission"]);
  });

  stats.topManagers = Object.keys(stats.sourceBreakdown)
    .map(function (key) {
      return stats.sourceBreakdown[key];
    })
    .sort(function (a, b) {
      return b.admissions - a.admissions || b.registration - a.registration || b.leads - a.leads;
    })
    .slice(0, 5);

  stats.latestRows = rows.slice().reverse();
  return stats;
}

function buildPersonPerformance(rows, params) {
  var filters = normalizeFilters(params);
  var focus = String(filters.person || "").trim();
  if (!focus) {
    return {
      label: "All rows",
      hasSelection: false,
      totalRows: rows.length
    };
  }

  var summary = {
    label: focus,
    hasSelection: true,
    totalRows: rows.length,
    totalLeads: 0,
    totalCalls: 0,
    totalConnectedCalls: 0,
    totalInterested: 0,
    totalHot: 0,
    totalRegistration: 0,
    totalAdmissions: 0
  };

  rows.forEach(function (row) {
    summary.totalLeads += getNumericField(row, ["leads", "Leads", "Lead"]);
    summary.totalCalls += getNumericField(row, ["calls", "Calls", "Call"]);
    summary.totalConnectedCalls += getNumericField(row, ["connected_calls", "connectedCalls", "Connected Calls", "Connected Call"]);
    summary.totalInterested += getNumericField(row, ["interested", "Interested", "Interested Hot", "Interested Leads"]);
    summary.totalHot += getNumericField(row, ["hot", "Hot", "Hot Leads", "Hot Lead"]);
    summary.totalRegistration += getNumericField(row, ["registration", "Registration", "Registrations"]);
    summary.totalAdmissions += getNumericField(row, ["admissions", "Admissions", "Admission"]);
  });

  return summary;
}

function normalizeSheetRow(entry) {
  return {
    date: String(entry.Date || entry.date || ""),
    time: String(entry.Time || entry.time || ""),
    manager: String(entry.manager || entry.Manager || entry["Team Leader"] || entry.teamLeader || ""),
    leads: toNumber(entry.leads || entry.Leads || entry.Lead),
    calls: toNumber(entry.calls || entry.Calls || entry.Call),
    connected_calls: toNumber(entry.connected_calls || entry.connectedCalls || entry["connected_calls"] || entry["Connected Calls"] || entry["Connected Call"]),
    interested: toNumber(entry.interested || entry.Interested || entry["Interested Hot"] || entry["Interested Leads"]),
    hot: toNumber(entry.hot || entry.Hot || entry["Hot Leads"] || entry["Hot Lead"]),
    registration: toNumber(entry.registration || entry.Registration || entry.Registrations),
    admissions: toNumber(entry.admissions || entry.Admissions || entry.Admission),
    sources: String(entry.sources || entry.Sources || ""),
    prospects: String(entry.prospects || entry.Prospects || ""),
    plan: String(entry.plan || entry.Plan || ""),
    remarks: String(entry.remarks || entry.Remarks || ""),
    name: String(entry.name || entry.Name || "")
  };
}

function normalizeSheetArrayRow(row) {
  var entry = {};
  SHEET_COLUMNS.forEach(function (key, index) {
    entry[key] = row[index];
  });
  return normalizeSheetRow(entry);
}

function toNumber(value) {
  var n = Number(String(value || 0).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function testWebhook() {
  const sample = {
    kind: "google-sheet",
    source: "google-form",
    origin: "apps-script",
    row: {
      "Timestamp": new Date().toISOString(),
      "Employee ID": "EMP001",
      "Name": "Ravi Kumar",
      "Calls Made": 45,
      "Leads Generated": 12,
      "Conversions": 2,
      "Revenue": 18000,
      "Problems Faced": "Follow-up delay",
      "Remarks": "Had a slow start"
    }
  };

  const response = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(sample),
    headers: {
      "x-ingest-secret": INGEST_SECRET
    },
    muteHttpExceptions: true
  });

  Logger.log(response.getResponseCode());
  Logger.log(response.getContentText());
}
