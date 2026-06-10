# n8n Workflow: Employee Monitoring

Use this as the real automation layer after Google Forms writes to Google Sheets.

## Flow

1. `Google Sheets Trigger`
2. `Set` node to normalize column names
3. `HTTP Request` node to send the row to this app's webhook
4. Optional `OpenAI` node if you want n8n to generate the narrative instead of the app
5. Optional `Email` or `WhatsApp` node for delivery

## Webhook target

- Default local webhook path: `POST /api/webhooks/ingest`
- Header: `x-ingest-secret: <shared-secret>`

## Canonical payload

```json
{
  "kind": "google-sheet",
  "source": "google-form",
  "origin": "n8n",
  "row": {
    "Timestamp": "2026-06-04T08:00:00.000Z",
    "Employee ID": "EMP001",
    "Name": "Ravi Kumar",
    "Calls Made": 45,
    "Leads Generated": 12,
    "Conversions": 2,
    "Revenue": 18000,
    "Problems Faced": "Follow-up delay",
    "Remarks": "Morning shift"
  }
}
```

## n8n notes

- Use the `Webhook` node if you want n8n to receive the form row directly from Apps Script or any other app.
- Use the `Google Sheets Trigger` node if you want n8n to watch the sheet for new rows.
- Use the `Respond to Webhook` node if you want the workflow to return the AI report immediately.

## Recommended production setup

Google Form -> Google Sheet -> n8n -> OpenAI -> Email/WhatsApp -> Admin dashboard

