import crypto from "node:crypto";
import { toNumber } from "./analysis.js";

export const DEFAULT_ROW_KEYS = {
  timestamp: ["Timestamp", "timestamp", "Date"],
  date: ["Date", "date", "Submission Date"],
  employeeId: ["Employee ID", "employeeId", "Emp ID", "EmpID"],
  name: ["Name", "Employee Name", "employeeName"],
  callsMade: ["Calls Made", "callsMade", "Calls"],
  leadsGenerated: ["Leads Generated", "leadsGenerated", "Leads"],
  conversions: ["Conversions", "conversions", "Closed"],
  revenue: ["Revenue", "revenue", "Sales"],
  problemsFaced: ["Problems Faced", "problemsFaced", "Problems"],
  remarks: ["Remarks", "remarks", "Notes"]
};

export function createId(prefix = "rep") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function getHeaderValue(row = {}, keys = []) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

export function normalizeSheetRow(row = {}, overrides = {}) {
  const mapping = {
    ...DEFAULT_ROW_KEYS,
    ...overrides
  };

  const timestamp = getHeaderValue(row, mapping.timestamp);
  const normalizedDate = timestamp
    ? String(timestamp).split("T")[0].split(" ")[0]
    : String(getHeaderValue(row, mapping.date) || new Date().toISOString().slice(0, 10));

  return {
    id: String(getHeaderValue(row, ["Entry ID", "entryId"]) || createId()),
    source: "google-sheet",
    origin: String(getHeaderValue(row, ["Source", "source"]) || "google-form"),
    timestamp: timestamp ? String(timestamp) : new Date().toISOString(),
    employeeId: String(getHeaderValue(row, mapping.employeeId) || "").trim(),
    name: String(getHeaderValue(row, mapping.name) || "").trim(),
    date: normalizedDate,
    callsMade: toNumber(getHeaderValue(row, mapping.callsMade)),
    leadsGenerated: toNumber(getHeaderValue(row, mapping.leadsGenerated)),
    conversions: toNumber(getHeaderValue(row, mapping.conversions)),
    revenue: toNumber(getHeaderValue(row, mapping.revenue)),
    problemsFaced: String(getHeaderValue(row, mapping.problemsFaced) || "").trim(),
    remarks: String(getHeaderValue(row, mapping.remarks) || "").trim(),
    raw: row
  };
}

export function normalizeWebhookPayload(payload = {}) {
  const candidate = payload.row || payload.report || payload.data || payload;
  return {
    id: String(candidate.id || payload.id || createId()),
    source: String(payload.source || candidate.source || "webhook"),
    origin: String(payload.origin || candidate.origin || "unknown"),
    timestamp: String(payload.timestamp || candidate.timestamp || new Date().toISOString()),
    employeeId: String(payload.employeeId || candidate.employeeId || "").trim(),
    name: String(payload.name || candidate.name || "").trim(),
    date: String(payload.date || candidate.date || new Date().toISOString().slice(0, 10)),
    callsMade: toNumber(payload.callsMade ?? candidate.callsMade),
    leadsGenerated: toNumber(payload.leadsGenerated ?? candidate.leadsGenerated),
    conversions: toNumber(payload.conversions ?? candidate.conversions),
    revenue: toNumber(payload.revenue ?? candidate.revenue),
    problemsFaced: String(payload.problemsFaced || candidate.problemsFaced || "").trim(),
    remarks: String(payload.remarks || candidate.remarks || "").trim(),
    raw: payload
  };
}

export function isSecretValid(expectedSecret, receivedSecret) {
  if (!expectedSecret) {
    return true;
  }

  return String(expectedSecret) === String(receivedSecret || "");
}
