import { processReportOverview } from "../src/report-overview.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const result = await processReportOverview({
      query: req.query || {},
      env: {
        SHEET_WEBAPP_URL: process.env.SHEET_WEBAPP_URL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL
      }
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
