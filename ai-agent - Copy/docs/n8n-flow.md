# n8n Workflow

## Trigger

- Google Sheets new row

## Steps

1. Read the new row
2. Fetch employee history
3. Calculate recent averages
4. Send structured payload to AI
5. Save returned feedback
6. Notify employee
7. Update admin summary

## Suggested nodes

- Google Sheets Trigger
- Google Sheets Read
- Function
- OpenAI or HTTP Request
- Google Sheets Update
- Email or WhatsApp send

