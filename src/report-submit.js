import { buildWhatsAppMessage, callGeminiJson, fallbackInsight, normalizeDate, summarizeRows } from "./report-ai.js";

const DEFAULT_WHATSAPP_NUMBER = "919289062707";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function isConfiguredGeminiKey(value) {
  const text = String(value || "").trim();
  console.log("🔐 GEMINI KEY CHECK:", text);
  if (!text) {
    return false;
  }

  return !/^(your_real_key|replace-with-|paste_your_|paste-your-)/i.test(text);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getText(value) {
  return String(value || "").trim();
}

function normalizeReportInput(payload = {}) {
  const employeeName = getText(payload.employeeName || payload.name);
  const managerName = getText(payload.managerName || payload.manager);

  return {
    date: getText(payload.date || new Date().toLocaleDateString("en-GB")),
    time: getText(payload.time || ""),
    employeeName,
    managerName,
    name: employeeName || getText(payload.name),
    calls: toNumber(payload.calls ?? payload.totalCalls ?? payload.callsMade),
    leads: toNumber(payload.leads ?? payload.leadsGenerated),
    connected_calls: toNumber(payload.connected_calls ?? payload.connectedCalls),
    interested: toNumber(payload.interested),
    hot: toNumber(payload.hot ?? payload.hotProspects),
    registration: toNumber(payload.registration),
    admissions: toNumber(payload.admissions),
    sources: getText(payload.sources || payload.leadSourcesText),
    prospects: getText(payload.prospects || payload.topProspectsText),
    plan: getText(payload.plan || payload.tomorrowPlan),
    remarks: getText(payload.remarks),
    useGemini: payload.useGemini === undefined ? true : String(payload.useGemini) !== "false" && payload.useGemini !== false && payload.useGemini !== 0,
    raw: payload
  };
}

function dateToUtcKey(value) {
  const normalized = normalizeDate(value || new Date().toISOString());
  if (!normalized || !/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return new Date().toISOString().slice(0, 10);
  }

  return normalized;
}

function shiftDateKey(dateKey, deltaDays) {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function buildWindow(dateKey, totalDays) {
  const endDate = dateToUtcKey(dateKey);
  const startDate = shiftDateKey(endDate, -(Math.max(totalDays, 1) - 1));
  return { startDate, endDate };
}

async function fetchSheetRows(sheetWebappUrl, { person = "", startDate = "", endDate = "" } = {}) {
  if (!sheetWebappUrl) {
    return [];
  }

  const targetUrl = new URL(sheetWebappUrl);
  if (person) {
    targetUrl.searchParams.set("person", person);
  }
  if (startDate) {
    targetUrl.searchParams.set("startDate", startDate);
  }
  if (endDate) {
    targetUrl.searchParams.set("endDate", endDate);
  }

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Sheet web app returned ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data?.rows) ? data.rows : [];
}

function pickHistoryPerson(report) {
  return report.employeeName || report.name || report.managerName || report.manager || "";
}

function buildSheetAppendPayload(report, aiComment, meta = {}) {
  const personName = report.employeeName || report.name || "";

  return {
    secret: meta.integrationSecret || "",
    date: report.date,
    time: report.time || new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    }),
    manager: report.managerName || "",
    leads: report.leads,
    calls: report.calls,
    connected_calls: report.connected_calls,
    interested: report.interested,
    hot: report.hot,
    registration: report.registration,
    admissions: report.admissions,
    sources: report.sources,
    prospects: report.prospects,
    plan: report.plan,
    remarks: report.remarks,
    name: personName,
    weekly_comment: aiComment.weeklyComment,
    monthly_comment: aiComment.monthlyComment,
    ai_comment: aiComment.overallComment,
    next_action: aiComment.nextAction,
    strengths: Array.isArray(aiComment.strengths) ? aiComment.strengths.join("; ") : "",
    improvement_areas: Array.isArray(aiComment.improvementAreas) ? aiComment.improvementAreas.join("; ") : ""
  };
}

async function appendReportToSheet(sheetWebappUrl, payload) {
  if (!sheetWebappUrl) {
    return { skipped: true };
  }

  const response = await fetch(sheetWebappUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Sheet write failed with ${response.status}: ${text.slice(0, 200)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, raw: text };
  }
}

function buildWhatsAppUrl(message, whatsappNumber = DEFAULT_WHATSAPP_NUMBER) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

async function processReportSubmission({ payload, env = {} }) {
  const report = normalizeReportInput(payload);
  const person = pickHistoryPerson(report);
  const reportDateKey = dateToUtcKey(report.date);
  const weeklyWindow = buildWindow(reportDateKey, 7);
  const monthlyWindow = buildWindow(reportDateKey, 30);
  const sheetWebappUrl = String(env.SHEET_WEBAPP_URL || "").trim();
  const integrationSecret = String(env.INTEGRATION_SECRET || "").trim();
  const geminiApiKey = report.useGemini && isConfiguredGeminiKey(env.GEMINI_API_KEY) ? String(env.GEMINI_API_KEY || "").trim() : "";
  const geminiModel = String(env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
  const whatsappNumber = String(env.WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER).trim() || DEFAULT_WHATSAPP_NUMBER;

  if (!sheetWebappUrl) {
    throw new Error("SHEET_WEBAPP_URL is not configured.");
  }

  if (!integrationSecret) {
    throw new Error("INTEGRATION_SECRET is not configured.");
  }

  if (!report.employeeName || !report.managerName || !report.date) {
    throw new Error("Employee name, manager name, and date are required.");
  }

  const [weeklyRows, monthlyRows] = await Promise.all([
    fetchSheetRows(sheetWebappUrl, {
      person,
      startDate: weeklyWindow.startDate,
      endDate: weeklyWindow.endDate
    }).catch(() => []),
    fetchSheetRows(sheetWebappUrl, {
      person,
      startDate: monthlyWindow.startDate,
      endDate: monthlyWindow.endDate
    }).catch(() => [])
  ]);

  const weeklySummary = summarizeRows(weeklyRows);
  const monthlySummary = summarizeRows(monthlyRows);
  const aiComment = await callGeminiJson({
    apiKey: geminiApiKey,
    model: geminiModel,
    report,
    weeklySummary,
    monthlySummary
  }).catch(() => fallbackInsight({ report, weeklySummary, monthlySummary }));

  const sheetPayload = buildSheetAppendPayload(report, aiComment, {
    integrationSecret
  });

  const sheetResponse = await appendReportToSheet(sheetWebappUrl, sheetPayload);
  const whatsappMessage = buildWhatsAppMessage({ report, aiComment });
  const whatsappUrl = buildWhatsAppUrl(whatsappMessage, whatsappNumber);

  return {
    ok: true,
    report,
    weeklyWindow,
    monthlyWindow,
    weeklySummary,
    monthlySummary,
    aiComment,
    aiProvider: geminiApiKey ? "gemini" : "fallback",
    aiWarning: geminiApiKey ? "" : "Gemini API key is missing or placeholder. Using fallback insight.",
    sheetResponse,
    whatsappMessage,
    whatsappUrl
  };
}

export {
  appendReportToSheet,
  buildSheetAppendPayload,
  buildWhatsAppUrl,
  dateToUtcKey,
  fetchSheetRows,
  normalizeReportInput,
  processReportSubmission
};
