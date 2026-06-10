# Integration Setup

## 1. Google Form

Create a form with these fields:

- Name
- Employee ID
- Calls Made
- Leads Generated
- Conversions
- Revenue
- Problems Faced
- Remarks

Link the form to a Google Sheet.

## 2. Apps Script

Open the Sheet, then:

1. Extensions
2. Apps Script
3. Paste [`integrations/google-apps-script/Code.gs`](../integrations/google-apps-script/Code.gs)
4. Set `WEBHOOK_URL` to your deployed endpoint
5. Set `INGEST_SECRET` to the same value as `INTEGRATION_SECRET`
6. Run `createInstallableTrigger()` once to register the submit trigger
7. Deploy the script as a web app so `doGet` can return JSON stats for the dashboard

## 3. n8n

Use one of these patterns:

### Pattern A: Sheet trigger

- Google Sheets Trigger
- Set / Code node
- HTTP Request to `POST /api/webhooks/ingest`
- Optional OpenAI node
- Optional Email or WhatsApp node

### Pattern B: Webhook trigger

- Webhook node receives the row
- Normalize data
- Optional OpenAI node
- Respond to Webhook node returns the result

## 4. Local testing

If the endpoint is local:

- expose it through a tunnel
- update `WEBHOOK_URL`
- keep `INTEGRATION_SECRET` and the header value matched
- set `SHEET_WEBAPP_URL` in `.env` so the local server can proxy sheet stats from the deployed Apps Script web app

## 5. Payload contract

The webhook accepts either:

- a full row object with Google Sheet headers, or
- a normalized object with `employeeId`, `name`, `callsMade`, `leadsGenerated`, `conversions`, `revenue`
