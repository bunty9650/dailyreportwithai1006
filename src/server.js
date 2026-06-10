import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeReport, formatEmployeeMessage, toNumber, round } from "./analysis.js";
import { addAnalysisEntry, addReportEntry, getEmployeeHistory, getLatestReports, listAnalyses, listReports } from "./storage.js";
import { isSecretValid, normalizeSheetRow, normalizeWebhookPayload } from "./integrations.js";
import { processReportSubmission } from "./report-submit.js";
import { processReportOverview } from "./report-overview.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const publicDir = path.join(projectRoot, "public");

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional env file; ignore if missing.
  }
}

await loadEnvFile(path.join(projectRoot, "setting.env"));
await loadEnvFile(path.join(projectRoot, ".env"));

const PORT = Number(process.env.PORT || 3000);
const APP_NAME = process.env.APP_NAME || "AI Employee Monitoring System";
const INTEGRATION_SECRET = String(process.env.INTEGRATION_SECRET || "");
const WEBHOOK_PATH = String(process.env.WEBHOOK_PATH || "/api/webhooks/ingest");
const SHEET_WEBAPP_URL = String(process.env.SHEET_WEBAPP_URL || "");
const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "");
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "");
const WHATSAPP_NUMBER = String(process.env.WHATSAPP_NUMBER || "");
const rootIndexPath = path.join(projectRoot, "index.html");

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, statusCode, content, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType
  });
  res.end(content);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function normalizeReportInput(input) {
  return {
    employeeId: String(input.employeeId || "").trim(),
    name: String(input.name || "").trim(),
    date: String(input.date || new Date().toISOString().slice(0, 10)),
    callsMade: toNumber(input.callsMade),
    leadsGenerated: toNumber(input.leadsGenerated),
    conversions: toNumber(input.conversions),
    revenue: toNumber(input.revenue),
    problemsFaced: String(input.problemsFaced || "").trim(),
    remarks: String(input.remarks || "").trim()
  };
}

function extractBearerToken(headerValue = "") {
  const value = String(headerValue || "").trim();
  if (!value) {
    return "";
  }

  if (/^Bearer\s+/i.test(value)) {
    return value.replace(/^Bearer\s+/i, "").trim();
  }

  return value;
}

function isValidReport(report) {
  return Boolean(
    report.employeeId &&
      report.name &&
      report.date &&
      Number.isFinite(report.callsMade) &&
      Number.isFinite(report.leadsGenerated) &&
      Number.isFinite(report.conversions) &&
      Number.isFinite(report.revenue)
  );
}

async function analyzeAndPersistReport(input, meta = {}) {
  const normalized = normalizeReportInput(input);
  const history = await getEmployeeHistory(normalized.employeeId, 7);
  const savedReport = await addReportEntry({
    ...normalized,
    source: meta.source || normalized.source || "manual",
    origin: meta.origin || normalized.origin || "manual",
    raw: meta.raw || normalized.raw || null
  });
  const analysis = analyzeReport(savedReport, history);
  const employeeMessage = formatEmployeeMessage(savedReport, analysis);
  const analysisEntry = await addAnalysisEntry({
    id: savedReport.id,
    createdAt: new Date().toISOString(),
    employeeId: savedReport.employeeId,
    name: savedReport.name,
    date: savedReport.date,
    source: savedReport.source || meta.source || "manual",
    origin: savedReport.origin || meta.origin || "manual",
    score: analysis.score,
    likelyReason: analysis.likelyReason,
    summary: analysis.summary,
    actionSuggestions: analysis.actionSuggestions,
    strengths: analysis.strengths,
    issues: analysis.issues,
    trends: analysis.trends,
    employeeMessage
  });

  return { report: savedReport, analysis: analysisEntry, employeeMessage };
}

function aggregateSummary(reports, analyses) {
  const totalRevenue = reports.reduce((sum, item) => sum + toNumber(item.revenue), 0);
  const totalCalls = reports.reduce((sum, item) => sum + toNumber(item.callsMade), 0);
  const totalLeads = reports.reduce((sum, item) => sum + toNumber(item.leadsGenerated), 0);
  const totalConversions = reports.reduce((sum, item) => sum + toNumber(item.conversions), 0);

  const topPerformers = [...analyses]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((item) => ({
      employeeId: item.employeeId,
      name: item.name,
      score: item.score,
      revenue: item.revenue
    }));

  const weakEmployees = [...analyses]
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((item) => ({
      employeeId: item.employeeId,
      name: item.name,
      score: item.score,
      issue: item.likelyReason
    }));

  const problemCounts = analyses.reduce((acc, item) => {
    const key = item.likelyReason || "No issue";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const commonProblems = Object.entries(problemCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([problem, count]) => ({ problem, count }));

  return {
    totalReports: reports.length,
    totalRevenue,
    totalCalls,
    totalLeads,
    totalConversions,
    averageScore: analyses.length
      ? round(analyses.reduce((sum, item) => sum + toNumber(item.score), 0) / analyses.length, 1)
      : 0,
    topPerformers,
    weakEmployees,
    commonProblems
  };
}

async function serveStaticFile(res, filePath) {
  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType =
      ext === ".html"
        ? "text/html; charset=utf-8"
        : ext === ".css"
          ? "text/css; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    sendText(res, 404, "Not found");
  }
}

async function fetchSheetStatsFromRemote(search = "") {
  if (!SHEET_WEBAPP_URL) {
    return null;
  }

  const targetUrl = new URL(SHEET_WEBAPP_URL);
  if (search) {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    params.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });
  }

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: {
      "accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Sheet web app returned ${response.status}`);
  }

  return response.json();
}

function normalizeDateKey(value) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split("/");
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text.toLowerCase();
}

function collectColumnsFromRows(rows) {
  const seen = new Set();
  const columns = [];

  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }

  return columns;
}

function filterLocalRows(rows, searchParams) {
  const startDate = String(searchParams.get("startDate") || searchParams.get("start") || "");
  const endDate = String(searchParams.get("endDate") || searchParams.get("end") || "");
  const person = String(searchParams.get("person") || searchParams.get("manager") || searchParams.get("name") || "").trim().toLowerCase();
  const startKey = normalizeDateKey(startDate);
  const endKey = normalizeDateKey(endDate);

  return rows.filter((row) => {
    const rowDate = normalizeDateKey(row.date || row.Date || row.timestamp || row.Timestamp || "");
    const rowPerson = String(row.manager || row.name || row["Manager Name"] || row["Employee Name"] || row.Manager || row.Name || row.employeeId || row.EmployeeId || "").trim().toLowerCase();

    if (startKey && rowDate && rowDate < startKey) {
      return false;
    }

    if (endKey && rowDate && rowDate > endKey) {
      return false;
    }

    if (person && rowPerson !== person) {
      return false;
    }

    return true;
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;

    if (req.method === "GET" && pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        service: APP_NAME,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/reports") {
      const reports = await listReports();
      sendJson(res, 200, { reports });
      return;
    }

    if (req.method === "GET" && pathname === "/api/analyses") {
      const analyses = await listAnalyses();
      sendJson(res, 200, { analyses });
      return;
    }

    if (req.method === "GET" && pathname === "/api/summary") {
      const reports = await listReports();
      const analyses = await listAnalyses();
      sendJson(res, 200, aggregateSummary(reports, analyses));
      return;
    }

    if (req.method === "GET" && pathname === "/api/sheet-stats") {
      try {
        const remote = await fetchSheetStatsFromRemote(url.search);
        if (remote) {
          try {
            const aiOverview = await processReportOverview({
              query: Object.fromEntries(url.searchParams.entries()),
              env: {
                SHEET_WEBAPP_URL,
                GEMINI_API_KEY,
                GEMINI_MODEL
              }
            });
            remote.aiOverview = aiOverview;
          } catch (error) {
            remote.aiOverview = {
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            };
          }
          sendJson(res, 200, remote);
          return;
        }
      } catch (error) {
        sendJson(res, 502, {
          ok: false,
          error: "Could not fetch remote Google Sheet stats.",
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }

      const reports = await listReports();
      const analyses = await listAnalyses();
      const filteredReports = filterLocalRows(reports, url.searchParams);
      const filteredAnalyses = analyses.filter((item) => {
        const rowDate = normalizeDateKey(item.date || item.Date || "");
        const rowPerson = String(item.name || item.manager || item["Manager Name"] || item["Employee Name"] || item.employeeId || "").trim().toLowerCase();
        const startDate = normalizeDateKey(String(url.searchParams.get("startDate") || url.searchParams.get("start") || ""));
        const endDate = normalizeDateKey(String(url.searchParams.get("endDate") || url.searchParams.get("end") || ""));
        const person = String(url.searchParams.get("person") || url.searchParams.get("manager") || url.searchParams.get("name") || "").trim().toLowerCase();

        if (startDate && rowDate && rowDate < startDate) {
          return false;
        }

        if (endDate && rowDate && rowDate > endDate) {
          return false;
        }

        if (person && rowPerson !== person) {
          return false;
        }

        return true;
      });

      sendJson(res, 200, {
        ok: true,
        source: "local-cache",
        columns: collectColumnsFromRows(filteredReports),
        rows: filteredReports,
        stats: aggregateSummary(filteredReports, filteredAnalyses),
        aiOverview: await (async () => {
          try {
            return await processReportOverview({
              query: Object.fromEntries(url.searchParams.entries()),
              env: {
                SHEET_WEBAPP_URL,
                GEMINI_API_KEY,
                GEMINI_MODEL
              }
            });
          } catch (error) {
            return {
              ok: false,
              error: error instanceof Error ? error.message : String(error)
            };
          }
        })(),
        personPerformance: {
          label: String(url.searchParams.get("person") || url.searchParams.get("manager") || url.searchParams.get("name") || "All rows"),
          hasSelection: Boolean(url.searchParams.get("person") || url.searchParams.get("manager") || url.searchParams.get("name")),
          totalRows: filteredReports.length
        },
        filters: {
          startDate: String(url.searchParams.get("startDate") || url.searchParams.get("start") || ""),
          endDate: String(url.searchParams.get("endDate") || url.searchParams.get("end") || ""),
          person: String(url.searchParams.get("person") || url.searchParams.get("manager") || url.searchParams.get("name") || "")
        }
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/integrations") {
      sendJson(res, 200, {
        webhookPath: WEBHOOK_PATH,
        requiresSecret: Boolean(INTEGRATION_SECRET),
        headers: {
          "x-ingest-secret": "your shared secret",
          "content-type": "application/json"
        },
        acceptedKinds: ["google-sheet", "n8n", "manual"],
        note: "Use Google Apps Script or n8n HTTP Request to POST normalized rows to this webhook."
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/analyze") {
      const payload = normalizeReportInput(await readRequestBody(req));

      if (!isValidReport(payload)) {
        sendJson(res, 400, {
          error: "Invalid payload. employeeId, name, date, callsMade, leadsGenerated, conversions, and revenue are required."
        });
        return;
      }

      const result = await analyzeAndPersistReport(payload, { source: "manual", origin: "api/analyze" });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/report-submit") {
      const payload = await readRequestBody(req);

      try {
        const result = await processReportSubmission({
          payload,
          env: {
            SHEET_WEBAPP_URL,
            INTEGRATION_SECRET,
            GEMINI_API_KEY,
            GEMINI_MODEL,
            WHATSAPP_NUMBER
          }
        });

        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }

    if (req.method === "GET" && pathname === "/api/report-overview") {
      try {
        const result = await processReportOverview({
          query: Object.fromEntries(url.searchParams.entries()),
          env: {
            SHEET_WEBAPP_URL,
            GEMINI_API_KEY,
            GEMINI_MODEL
          }
        });

        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 502, {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }

    if (req.method === "POST" && pathname === WEBHOOK_PATH) {
      const receivedSecret = extractBearerToken(req.headers["x-ingest-secret"]) || extractBearerToken(req.headers.authorization);
      if (!isSecretValid(INTEGRATION_SECRET, receivedSecret)) {
        sendJson(res, 401, { error: "Unauthorized webhook." });
        return;
      }

      const payload = await readRequestBody(req);
      const kind = String(payload.kind || payload.source || "webhook");
      const normalized =
        kind === "google-sheet" || payload.row || payload.range || payload.values
          ? normalizeSheetRow(payload.row || payload)
          : normalizeWebhookPayload(payload);

      if (!isValidReport(normalized)) {
        sendJson(res, 400, {
          error: "Invalid webhook payload. employeeId, name, callsMade, leadsGenerated, conversions, and revenue are required."
        });
        return;
      }

      const result = await analyzeAndPersistReport(normalized, {
        source: normalized.source || "webhook",
        origin: normalized.origin || kind,
        raw: payload
      });

      sendJson(res, 200, {
        ok: true,
        kind,
        ...result
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/seed") {
      const payload = await readRequestBody(req);
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      const results = [];

      for (const entry of entries) {
        const normalized = normalizeReportInput(entry);
        if (!isValidReport(normalized)) {
          continue;
        }

        const result = await analyzeAndPersistReport(normalized, { source: "seed", origin: "api/seed" });
        results.push(result);
      }

      sendJson(res, 200, { inserted: results.length, results });
      return;
    }

    if (req.method === "GET" && pathname === "/") {
      await serveStaticFile(res, rootIndexPath);
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/public/")) {
      const relative = pathname.replace("/public/", "");
      await serveStaticFile(res, path.join(publicDir, relative));
      return;
    }

    if (req.method === "GET" && pathname === "/dashboard") {
      await serveStaticFile(res, rootIndexPath);
      return;
    }

    sendText(res, 404, "Not found");
  } catch (error) {
    sendJson(res, 500, {
      error: "Server error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, () => {
  console.log(`${APP_NAME} running on http://localhost:${PORT}`);
});
