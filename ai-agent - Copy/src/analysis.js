const WEIGHTS = {
  callsMade: 0.3,
  leadsGenerated: 0.25,
  conversions: 0.3,
  revenue: 0.15
};

export function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const normalized = String(value).replace(/,/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function percentChange(current, baseline) {
  if (baseline === 0) {
    if (current === 0) {
      return 0;
    }
    return 100;
  }

  return round(((current - baseline) / baseline) * 100, 1);
}

function scoreComponent(current, baseline) {
  if (baseline <= 0) {
    return current > 0 ? 7 : 5;
  }

  const deltaPct = ((current - baseline) / baseline) * 100;
  return clamp(5 + deltaPct / 10, 0, 10);
}

function topNegativeTrend(trends) {
  return Object.entries(trends)
    .filter(([, trend]) => trend.deltaPct < 0)
    .sort((a, b) => a[1].deltaPct - b[1].deltaPct)[0] || null;
}

function detectIssueCategories(report, trends) {
  const issues = [];
  const problemsText = `${report.problemsFaced || ""} ${report.remarks || ""}`.toLowerCase();

  if (trends.callsMade.deltaPct <= -15) {
    issues.push("Poor call volume");
  }

  if (trends.leadsGenerated.deltaPct <= -15) {
    issues.push("Lead generation is down");
  }

  if (trends.conversions.deltaPct <= -15) {
    issues.push("Conversion drop");
  }

  if (trends.revenue.deltaPct <= -15) {
    issues.push("Revenue decline");
  }

  if (problemsText.includes("follow") || problemsText.includes("callback")) {
    issues.push("Follow-up process risk");
  }

  if (problemsText.includes("closing") || problemsText.includes("objection")) {
    issues.push("Closing or objection handling issue");
  }

  if (problemsText.includes("lead") && problemsText.includes("quality")) {
    issues.push("Lead quality concern");
  }

  return [...new Set(issues)];
}

function buildSuggestions(report, trends, issues) {
  const suggestions = [];

  if (trends.callsMade.deltaPct <= -10) {
    suggestions.push("Increase outbound call blocks by 20% tomorrow.");
  }

  if (trends.leadsGenerated.deltaPct <= -10) {
    suggestions.push("Review lead source quality and prospecting timing.");
  }

  if (trends.conversions.deltaPct <= -10) {
    suggestions.push("Spend time on objection handling and closing scripts.");
  }

  if (trends.revenue.deltaPct <= -10) {
    suggestions.push("Prioritize high-intent prospects and faster follow-up.");
  }

  const text = `${report.problemsFaced || ""} ${report.remarks || ""}`.toLowerCase();
  if (text.includes("follow") || issues.includes("Follow-up process risk")) {
    suggestions.push("Set a same-day follow-up rule for every qualified lead.");
  }

  if (suggestions.length === 0) {
    suggestions.push("Maintain current rhythm and push for a small improvement target.");
  }

  return [...new Set(suggestions)].slice(0, 3);
}

function buildStrengths(trends) {
  const strengths = [];

  if (trends.callsMade.deltaPct >= 10) {
    strengths.push("Strong call activity");
  }

  if (trends.leadsGenerated.deltaPct >= 10) {
    strengths.push("Lead generation improved");
  }

  if (trends.conversions.deltaPct >= 10) {
    strengths.push("Conversion rate improved");
  }

  if (trends.revenue.deltaPct >= 10) {
    strengths.push("Revenue momentum is healthy");
  }

  return strengths;
}

function buildSummary(report, trends, score) {
  const topDrop = topNegativeTrend(trends);
  const topDropLabel = topDrop ? topDrop[0] : null;

  if (!topDropLabel) {
    return `${report.name} is performing steadily with an overall score of ${round(score, 1)}/10.`;
  }

  const labelMap = {
    callsMade: "calls",
    leadsGenerated: "leads",
    conversions: "conversions",
    revenue: "revenue"
  };

  const delta = trends[topDropLabel].deltaPct;
  return `${report.name} shows the biggest dip in ${labelMap[topDropLabel]} (${delta}% vs recent average).`;
}

export function analyzeReport(report, history = []) {
  const recentHistory = history.slice(-7);
  const averages = {
    callsMade: recentHistory.length
      ? recentHistory.reduce((sum, item) => sum + toNumber(item.callsMade), 0) / recentHistory.length
      : 0,
    leadsGenerated: recentHistory.length
      ? recentHistory.reduce((sum, item) => sum + toNumber(item.leadsGenerated), 0) / recentHistory.length
      : 0,
    conversions: recentHistory.length
      ? recentHistory.reduce((sum, item) => sum + toNumber(item.conversions), 0) / recentHistory.length
      : 0,
    revenue: recentHistory.length
      ? recentHistory.reduce((sum, item) => sum + toNumber(item.revenue), 0) / recentHistory.length
      : 0
  };

  const current = {
    callsMade: toNumber(report.callsMade),
    leadsGenerated: toNumber(report.leadsGenerated),
    conversions: toNumber(report.conversions),
    revenue: toNumber(report.revenue)
  };

  const trends = {
    callsMade: {
      current: current.callsMade,
      baseline: round(averages.callsMade, 1),
      deltaPct: round(percentChange(current.callsMade, averages.callsMade), 1)
    },
    leadsGenerated: {
      current: current.leadsGenerated,
      baseline: round(averages.leadsGenerated, 1),
      deltaPct: round(percentChange(current.leadsGenerated, averages.leadsGenerated), 1)
    },
    conversions: {
      current: current.conversions,
      baseline: round(averages.conversions, 1),
      deltaPct: round(percentChange(current.conversions, averages.conversions), 1)
    },
    revenue: {
      current: current.revenue,
      baseline: round(averages.revenue, 1),
      deltaPct: round(percentChange(current.revenue, averages.revenue), 1)
    }
  };

  const score =
    scoreComponent(current.callsMade, averages.callsMade) * WEIGHTS.callsMade +
    scoreComponent(current.leadsGenerated, averages.leadsGenerated) * WEIGHTS.leadsGenerated +
    scoreComponent(current.conversions, averages.conversions) * WEIGHTS.conversions +
    scoreComponent(current.revenue, averages.revenue) * WEIGHTS.revenue;

  const issueCategories = detectIssueCategories(report, trends);
  const strengths = buildStrengths(trends);
  const actionSuggestions = buildSuggestions(report, trends, issueCategories);
  const summary = buildSummary(report, trends, score);
  const likelyReason =
    issueCategories[0] ||
    "No major issue detected";

  return {
    score: round(score, 1),
    summary,
    strengths,
    issues: issueCategories,
    likelyReason,
    actionSuggestions,
    trends,
    baselineWindow: recentHistory.length
  };
}

export function formatEmployeeMessage(report, analysis) {
  const lines = [
    `Hi ${report.name || "Team Member"},`,
    "",
    "Aaj ki performance summary:",
    `- Calls: ${toNumber(report.callsMade)} (${analysis.trends.callsMade.deltaPct >= 0 ? "+" : ""}${analysis.trends.callsMade.deltaPct}% vs avg)`,
    `- Leads: ${toNumber(report.leadsGenerated)} (${analysis.trends.leadsGenerated.deltaPct >= 0 ? "+" : ""}${analysis.trends.leadsGenerated.deltaPct}% vs avg)`,
    `- Conversions: ${toNumber(report.conversions)} (${analysis.trends.conversions.deltaPct >= 0 ? "+" : ""}${analysis.trends.conversions.deltaPct}% vs avg)`,
    `- Revenue: ${toNumber(report.revenue)} (${analysis.trends.revenue.deltaPct >= 0 ? "+" : ""}${analysis.trends.revenue.deltaPct}% vs avg)`,
    "",
    `Issue: ${analysis.likelyReason}`,
    `Suggestion: ${analysis.actionSuggestions[0]}`,
    "",
    `Overall Score: ${analysis.score}/10`
  ];

  return lines.join("\n");
}
