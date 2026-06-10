# System Architecture

## Core flow

1. Employee submits daily performance data
2. Data is stored in a tabular source or API store
3. Analysis engine compares today vs recent history
4. Feedback is generated for the employee
5. Admin dashboard aggregates trends and risks

## MVP components

- `src/server.js`
  - HTTP API
  - Static dashboard hosting
- `src/analysis.js`
  - Trend detection
  - Score calculation
  - Issue classification
- `src/storage.js`
  - Local JSON persistence
- `public/`
  - Dashboard UI

## Production target

Replace local storage with:

- Google Sheets as primary input store
- n8n for orchestration
- OpenAI API for narrative analysis
- WhatsApp API or email for delivery

