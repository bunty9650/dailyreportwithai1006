import { processReportSubmission } from "../src/report-submit.js";

async function readRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string" && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const payload = await readRequestBody(req);
    const result = await processReportSubmission({
      payload,
      env: {
        SHEET_WEBAPP_URL: process.env.SHEET_WEBAPP_URL,
        INTEGRATION_SECRET: process.env.INTEGRATION_SECRET,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL,
        WHATSAPP_NUMBER: process.env.WHATSAPP_NUMBER
      }
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
