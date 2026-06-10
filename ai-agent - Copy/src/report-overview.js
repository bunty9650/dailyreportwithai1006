import { callGeminiOverviewJson, summarizeRows } from "./report-ai.js";
import { fetchSheetRows } from "./report-submit.js";

function isConfiguredGeminiKey(value) {
  const text = String(value || "").trim();
  if (!text) {
    return false;
  }

  return !/^(your_real_key|replace-with-|paste_your_|paste-your-)/i.test(text);
}

async function processReportOverview({ query = {}, env = {} } = {}) {
  const sheetWebappUrl = String(env.SHEET_WEBAPP_URL || "").trim();
  const geminiApiKey = isConfiguredGeminiKey(env.GEMINI_API_KEY) ? String(env.GEMINI_API_KEY || "").trim() : "";
  const geminiModel = String(env.GEMINI_MODEL || "gemini-2.5-flash").trim() || "gemini-2.5-flash";

  if (!sheetWebappUrl) {
    throw new Error("SHEET_WEBAPP_URL is not configured.");
  }

  const requestedPerson = String(query.person || query.manager || query.name || "").trim();
  const scope = String(query.scope || (requestedPerson ? "person" : "overall") || "overall").trim().toLowerCase();
  const isPersonScope = scope === "person" || Boolean(requestedPerson);

  const filters = {
    startDate: String(query.startDate || query.start || ""),
    endDate: String(query.endDate || query.end || ""),
    person: isPersonScope ? requestedPerson : "",
    scope: isPersonScope ? "person" : "overall"
  };

  const rows = await fetchSheetRows(sheetWebappUrl, filters);
  const summary = summarizeRows(rows);
  const insight = await callGeminiOverviewJson({
    apiKey: geminiApiKey,
    model: geminiModel,
    filters,
    summary
  });

  return {
    ok: true,
    filters,
    totalRows: rows.length,
    summary,
    insight,
    scope: filters.scope,
    aiProvider: geminiApiKey ? "gemini" : "fallback",
    aiWarning: geminiApiKey ? "" : "Gemini API key is missing or placeholder. Using fallback insight."
  };
}

export {
  processReportOverview
};
