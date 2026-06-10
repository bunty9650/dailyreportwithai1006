# AI Employee Monitoring System

This repository is a self-contained MVP for the workflow:

`Employee Form -> Data Store -> Analysis Engine -> Daily Feedback -> Admin Dashboard`

## What this system does

- Accepts employee daily entries through a JSON API
- Stores raw reports locally in `data/reports.json`
- Compares today's metrics against the employee's recent history
- Generates an AI-style score, issue detection, and action suggestions
- Serves a lightweight admin dashboard in the browser
- Sends the submitted report to WhatsApp after generating a Gemini-powered weekly/monthly comment

## Run locally

Use the bundled Node runtime from Codex:

```powershell
C:\Users\bunty\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe src\server.js
```

Then open:

`http://localhost:3000`

## API

- `GET /health`
- `GET /api/reports`
- `GET /api/summary`
- `POST /api/analyze`
- `POST /api/report-submit`
- `GET /api/integrations`
- `POST /api/webhooks/ingest`

Example payload:

```json
{
  "employeeId": "EMP001",
  "name": "Ravi Kumar",
  "date": "2026-06-04",
  "callsMade": 45,
  "leadsGenerated": 12,
  "conversions": 2,
  "revenue": 18000,
  "problemsFaced": "Follow-up delay and low intent leads",
  "remarks": "Had a slow start in the morning"
}
```

## Next integrations

### Google Form + Sheet + n8n

1. Create a Google Form with these fields:
   - Name
   - Employee ID
   - Calls Made
   - Leads Generated
   - Conversions
   - Revenue
   - Problems Faced
   - Remarks
2. Link the form to a Google Sheet.
3. Paste [`integrations/google-apps-script/Code.gs`](integrations/google-apps-script/Code.gs) into Apps Script attached to that Sheet.
4. Replace `WEBHOOK_URL` with your deployed app URL.
5. Replace `INGEST_SECRET` and set the same value in `.env` as `INTEGRATION_SECRET`.
6. Create the installable trigger by running `createInstallableTrigger()`.
7. In n8n, either:
   - use a `Google Sheets Trigger` node for new rows, or
   - use a `Webhook` node and forward rows to `POST /api/webhooks/ingest`

### Gemini comments for WhatsApp and sheet

Set these environment variables:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)
- `WHATSAPP_NUMBER` if you want to change the redirect destination

The `POST /api/report-submit` endpoint will:

1. read the employee report
2. fetch weekly/monthly sheet history for that employee
3. generate a Gemini comment
4. append the comment back into Google Sheets
5. return a WhatsApp URL for the frontend to open

### Deployment note

The Apps Script webhook must point to a publicly reachable URL. For local development, use a tunnel like ngrok or Cloudflare Tunnel and update `WEBHOOK_URL`.

### Live sheet stats

Set `SHEET_WEBAPP_URL` in your `.env` to the deployed Google Apps Script web app URL. The local server will proxy that endpoint at `/api/sheet-stats` so the dashboard can show live sheet data without browser CORS issues.

If you deploy to Vercel, put `SHEET_WEBAPP_URL` in the Vercel project environment variables too, because Vercel does not read your local `setting.env` file.

### Docs

- [System architecture](docs/architecture.md)
- [n8n flow](integrations/n8n-employee-monitoring-workflow.md)
