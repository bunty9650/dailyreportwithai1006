import { processReportOverview } from "../src/report-overview.js";

export default async function handler(req, res) {
  try {
    const sheetWebappUrl = process.env.SHEET_WEBAPP_URL;

    if (!sheetWebappUrl) {
      res.status(200).json({
        ok: true,
        source: "missing-env",
        rows: [],
        stats: {
          totalRows: 0,
          totalLeads: 0,
          totalCalls: 0,
          totalConnectedCalls: 0,
          totalInterested: 0,
          totalHot: 0,
          totalRegistration: 0,
          totalAdmissions: 0,
          topManagers: [],
          latestRows: []
        },
        note: "SHEET_WEBAPP_URL is not set"
      });
      return;
    }

    const targetUrl = new URL(sheetWebappUrl);
    const sourceUrl = new URL(req.url, "http://localhost");
    sourceUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: {
        accept: "application/json"
      },
      cache: "no-store"
    });

    const text = await response.text();

    if (!response.ok) {
      res.status(502).json({
        ok: false,
        error: `Sheet web app returned ${response.status}`,
        body: text.slice(0, 500)
      });
      return;
    }

    try {
      const json = JSON.parse(text);
      try {
        json.aiOverview = await processReportOverview({
          query: req.query || {},
          env: {
            SHEET_WEBAPP_URL: process.env.SHEET_WEBAPP_URL,
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            GEMINI_MODEL: process.env.GEMINI_MODEL
          }
        });
      } catch (error) {
        json.aiOverview = {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
      res.status(200).json(json);
      return;
    } catch {
      res.status(502).json({
        ok: false,
        error: "Sheet web app did not return JSON",
        body: text.slice(0, 500)
      });
      return;
    }
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
