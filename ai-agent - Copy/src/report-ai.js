const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickText(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") {
      return String(row[key]);
    }
  }
  return "";
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [dd, mm, yyyy] = text.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
}

function summarizeRows(rows = []) {
  const normalized = rows.map((row) => ({
    row,
    date: normalizeDate(pickText(row, ["date", "Date", "Timestamp", "timestamp", "Submission Date"])),
    manager: pickText(row, ["manager", "Manager", "Manager Name", "Team Leader", "teamLeader", "name", "Name", "Employee Name", "employeeName"]),
    leads: toNumber(row.leads ?? row.Leads ?? row.Lead),
    calls: toNumber(row.calls ?? row.Calls ?? row.Call),
    connectedCalls: toNumber(row.connected_calls ?? row.connectedCalls ?? row["Connected Calls"] ?? row["Connected Call"]),
    interested: toNumber(row.interested ?? row.Interested ?? row["Interested Hot"] ?? row["Interested Leads"]),
    hot: toNumber(row.hot ?? row.Hot ?? row["Hot Leads"] ?? row["Hot Lead"]),
    registration: toNumber(row.registration ?? row.Registration ?? row.Registrations),
    admissions: toNumber(row.admissions ?? row.Admissions ?? row.Admission)
  }));

  const summary = {
    totalRows: normalized.length,
    totalLeads: 0,
    totalCalls: 0,
    totalConnectedCalls: 0,
    totalInterested: 0,
    totalHot: 0,
    totalRegistration: 0,
    totalAdmissions: 0,
    latestDate: "",
    latestManager: "",
    lastEntry: null
  };

  for (const item of normalized) {
    summary.totalLeads += item.leads;
    summary.totalCalls += item.calls;
    summary.totalConnectedCalls += item.connectedCalls;
    summary.totalInterested += item.interested;
    summary.totalHot += item.hot;
    summary.totalRegistration += item.registration;
    summary.totalAdmissions += item.admissions;

    if (item.date && (!summary.latestDate || item.date > summary.latestDate)) {
      summary.latestDate = item.date;
      summary.latestManager = item.manager;
      summary.lastEntry = item.row;
    }
  }

  const latestEntry = normalized.length ? normalized[normalized.length - 1] : null;
  const previousEntry = normalized.length > 1 ? normalized[normalized.length - 2] : null;

  summary.averageLeads = summary.totalRows ? Number((summary.totalLeads / summary.totalRows).toFixed(1)) : 0;
  summary.averageCalls = summary.totalRows ? Number((summary.totalCalls / summary.totalRows).toFixed(1)) : 0;
  summary.averageConnectedCalls = summary.totalRows ? Number((summary.totalConnectedCalls / summary.totalRows).toFixed(1)) : 0;
  summary.averageInterested = summary.totalRows ? Number((summary.totalInterested / summary.totalRows).toFixed(1)) : 0;
  summary.averageHot = summary.totalRows ? Number((summary.totalHot / summary.totalRows).toFixed(1)) : 0;
  summary.averageRegistration = summary.totalRows ? Number((summary.totalRegistration / summary.totalRows).toFixed(1)) : 0;
  summary.averageAdmissions = summary.totalRows ? Number((summary.totalAdmissions / summary.totalRows).toFixed(1)) : 0;
  summary.latestEntry = latestEntry
    ? {
        date: latestEntry.date,
        manager: latestEntry.manager,
        leads: latestEntry.leads,
        calls: latestEntry.calls,
        connectedCalls: latestEntry.connectedCalls,
        interested: latestEntry.interested,
        hot: latestEntry.hot,
        registration: latestEntry.registration,
        admissions: latestEntry.admissions
      }
    : null;
  summary.previousEntry = previousEntry
    ? {
        date: previousEntry.date,
        manager: previousEntry.manager,
        leads: previousEntry.leads,
        calls: previousEntry.calls,
        connectedCalls: previousEntry.connectedCalls,
        interested: previousEntry.interested,
        hot: previousEntry.hot,
        registration: previousEntry.registration,
        admissions: previousEntry.admissions
      }
    : null;

  return summary;
}

function fallbackInsight({ report, weeklySummary, monthlySummary }) {
  const name = report.name || "Employee";
  const weeklyLine = weeklySummary.totalRows
    ? `Weekly average calls ${weeklySummary.averageCalls}, leads ${weeklySummary.averageLeads}, admissions ${weeklySummary.averageAdmissions}.`
    : "Weekly data is not available yet.";
  const monthlyLine = monthlySummary.totalRows
    ? `Monthly average calls ${monthlySummary.averageCalls}, leads ${monthlySummary.averageLeads}, admissions ${monthlySummary.averageAdmissions}.`
    : "Monthly data is not available yet.";

  return {
    weeklyComment: `${name} ka weekly performance steady hai. ${weeklyLine}`,
    monthlyComment: `${name} ka monthly trend compare karne par consistency dekhni hogi. ${monthlyLine}`,
    overallComment: `${name} ki report received. Focus on follow-up quality, conversion improvement, and consistency.`,
    strengths: weeklySummary.totalRows ? ["Weekly activity captured"] : ["Fresh report captured"],
    improvementAreas: ["Follow-up discipline", "Conversion ratio", "Call quality"],
    nextAction: "Next 7 days me follow-up velocity aur closing ratio par focus karo."
  };
}

function buildPrompt({ report, weeklySummary, monthlySummary }) {
  return `
You are an employee performance coach for a sales/reporting team.
Write concise professional Hinglish comments.

Return ONLY valid JSON with keys:
- weeklyComment (string)
- monthlyComment (string)
- overallComment (string)
- strengths (array of strings)
- improvementAreas (array of strings)
- nextAction (string)

Context:
Employee name: ${report.name || "Unknown"}
Manager: ${report.managerName || report.manager || "Unknown"}
Date: ${report.date || ""}
Current report:
- Calls: ${report.calls || report.totalCalls || 0}
- Leads: ${report.leads || 0}
- Connected calls: ${report.connected_calls || report.connectedCalls || 0}
- Interested: ${report.interested || 0}
- Hot: ${report.hot || 0}
- Registration: ${report.registration || 0}
- Admissions: ${report.admissions || 0}
- Remarks: ${report.remarks || ""}

Weekly summary:
${JSON.stringify(weeklySummary, null, 2)}

Monthly summary:
${JSON.stringify(monthlySummary, null, 2)}

Latest entry to focus on:
${JSON.stringify(weeklySummary.latestEntry || monthlySummary.latestEntry || {}, null, 2)}

Previous entry for comparison:
${JSON.stringify(weeklySummary.previousEntry || monthlySummary.previousEntry || {}, null, 2)}

Style:
- Be specific.
- Mention improvement or decline.
- Avoid generic fluff.
- Make the comments useful for an admin portal and WhatsApp summary.
- Base the comment on the latest entry and the averages from the summaries.
- Do not invent metrics that are not present above.
`.trim();
}

function fallbackOverviewInsight({ filters, summary }) {
  const label = filters.person || "Selected report";
  const totalRows = summary.totalRows || 0;
  const trendHint = totalRows
    ? `Average calls ${summary.averageCalls}, leads ${summary.averageLeads}, admissions ${summary.averageAdmissions}.`
    : "No rows matched the selected filters.";

  return {
    overallComment: `${label} ka overall trend ${totalRows ? "steady" : "available nahi"} lag raha hai. ${trendHint}`,
    strengths: totalRows ? ["Selected data loaded", "Historical comparison available"] : ["No matching data"],
    improvementAreas: ["Consistency", "Follow-up quality", "Conversion improvement"],
    nextAction: totalRows
      ? "Selected range me latest entry ko previous report se compare karke next follow-up plan improve karo."
      : "Please widen the date range or select another person.",
    score: totalRows ? Math.min(10, Math.max(1, Number((summary.averageAdmissions + summary.averageRegistration).toFixed(1)))) : 0
  };
}

async function callGeminiJson({ apiKey, model = DEFAULT_GEMINI_MODEL, report, weeklySummary, monthlySummary }) {
  if (!apiKey) {
    return fallbackInsight({ report, weeklySummary, monthlySummary });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const schema = {
    type: "object",
    properties: {
      weeklyComment: { type: "string" },
      monthlyComment: { type: "string" },
      overallComment: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      improvementAreas: { type: "array", items: { type: "string" } },
      nextAction: { type: "string" }
    },
    required: ["weeklyComment", "monthlyComment", "overallComment", "strengths", "improvementAreas", "nextAction"]
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You are a concise, practical employee performance analyst." }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt({ report, weeklySummary, monthlySummary }) }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.4
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

  try {
    const parsed = JSON.parse(text);
    return {
      weeklyComment: String(parsed.weeklyComment || ""),
      monthlyComment: String(parsed.monthlyComment || ""),
      overallComment: String(parsed.overallComment || ""),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      improvementAreas: Array.isArray(parsed.improvementAreas) ? parsed.improvementAreas.map(String) : [],
      nextAction: String(parsed.nextAction || "")
    };
  } catch {
    return fallbackInsight({ report, weeklySummary, monthlySummary });
  }
}

function buildOverviewPrompt({ filters, summary }) {
  return `
You are an employee performance analyst for an admin dashboard.
Write a short, factual overall performance report in Hinglish.

Return ONLY valid JSON with keys:
- overallComment (string)
- strengths (array of strings)
- improvementAreas (array of strings)
- nextAction (string)
- score (number)

Filters:
- Person: ${filters.person || "All people"}
- Start date: ${filters.startDate || "not selected"}
- End date: ${filters.endDate || "not selected"}

Summary:
${JSON.stringify(summary, null, 2)}

Rules:
- Base the comment on the selected data only.
- Use the latest entry and the averages to judge performance.
- If data is insufficient, say that clearly.
- Do not invent extra numbers.
- Keep the tone professional and actionable.
`.trim();
}

async function callGeminiOverviewJson({ apiKey, model = DEFAULT_GEMINI_MODEL, filters = {}, summary = {} }) {
  if (!apiKey) {
    return fallbackOverviewInsight({ filters, summary });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const schema = {
    type: "object",
    properties: {
      overallComment: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      improvementAreas: { type: "array", items: { type: "string" } },
      nextAction: { type: "string" },
      score: { type: "number" }
    },
    required: ["overallComment", "strengths", "improvementAreas", "nextAction", "score"]
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: "You are a concise, practical employee performance analyst." }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildOverviewPrompt({ filters, summary }) }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.3
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned ${response.status}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

  try {
    const parsed = JSON.parse(text);
    return {
      overallComment: String(parsed.overallComment || ""),
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      improvementAreas: Array.isArray(parsed.improvementAreas) ? parsed.improvementAreas.map(String) : [],
      nextAction: String(parsed.nextAction || ""),
      score: Number(parsed.score || 0)
    };
  } catch {
    return fallbackOverviewInsight({ filters, summary });
  }
}

function buildWhatsAppMessage({ report, aiComment }) {
  const personName = report.employeeName || report.name || report.managerName || "Team Member";
  const metaLines = [];

  if (report.managerName) {
    metaLines.push(`- Manager: ${report.managerName}`);
  }

  if (report.employeeName && report.employeeName !== personName) {
    metaLines.push(`- Employee: ${report.employeeName}`);
  }

  const lines = [
    `Hi ${personName},`,
    "",
    ...metaLines,
    ...(metaLines.length ? [""] : []),
    "Aaj ki performance summary:",
    `- Calls: ${report.calls || report.totalCalls || 0}`,
    `- Leads: ${report.leads || 0}`,
    `- Connected Calls: ${report.connected_calls || report.connectedCalls || 0}`,
    `- Interested: ${report.interested || 0}`,
    `- Hot: ${report.hot || 0}`,
    `- Registration: ${report.registration || 0}`,
    `- Admissions: ${report.admissions || 0}`,
    "",
    `Weekly Comment: ${aiComment.weeklyComment}`,
    `Monthly Comment: ${aiComment.monthlyComment}`,
    `Overall: ${aiComment.overallComment}`,
    `Next Action: ${aiComment.nextAction}`
  ];

  return lines.join("\n");
}

export {
  buildWhatsAppMessage,
  callGeminiJson,
  callGeminiOverviewJson,
  fallbackInsight,
  fallbackOverviewInsight,
  normalizeDate,
  summarizeRows
};
