function money(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function number(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function metricCard(label, value, hint) {
  return `
    <article class="metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${hint}</small>
    </article>
  `;
}

function renderList(container, items, emptyText, type = "top") {
  if (!items.length) {
    container.innerHTML = `<div class="list-item"><div><strong>${emptyText}</strong><span>Add sample data to see insights here.</span></div></div>`;
    return;
  }

  container.innerHTML = items
    .map((item) => {
      const scoreClass = type === "weak" || Number(item.score) < 6 ? "score-pill bad" : "score-pill";
      const secondLine = type === "weak" ? item.issue || "Needs review" : `Revenue: Rs ${money(item.revenue || 0)}`;
      return `
        <div class="list-item">
          <div>
            <strong>${item.name || "Unknown"}</strong>
            <span>${item.employeeId || "-"} · ${secondLine}</span>
          </div>
          <div class="${scoreClass}">${number(item.score || 0)}/10</div>
        </div>
      `;
    })
    .join("");
}

function renderReports(items) {
  const tbody = document.getElementById("recentReports");
  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">No reports yet. Send a POST request to /api/analyze or /api/seed to start.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${item.name || "-"}</td>
          <td>${item.employeeId || "-"}</td>
          <td>${item.date || "-"}</td>
          <td>${number(item.score || 0)}</td>
          <td><span class="issue-tag">${item.likelyReason || "No issue"}</span></td>
          <td>Rs ${money(item.revenue || 0)}</td>
        </tr>
      `
    )
    .join("");
}

async function loadDashboard() {
  const [healthRes, summaryRes, reportsRes, analysesRes] = await Promise.all([
    fetch("/health"),
    fetch("/api/summary"),
    fetch("/api/reports"),
    fetch("/api/analyses")
  ]);

  const health = await healthRes.json();
  const summary = await summaryRes.json();
  const reportsData = await reportsRes.json();
  const analysesData = await analysesRes.json();

  document.getElementById("healthStatus").textContent = health.ok ? "Online" : "Offline";
  document.getElementById("healthDetail").textContent = `${health.service} is ready for submissions.`;

  const metrics = document.getElementById("metrics");
  metrics.innerHTML = [
    metricCard("Total reports", summary.totalReports || 0, "All employee submissions stored"),
    metricCard("Total revenue", `Rs ${money(summary.totalRevenue || 0)}`, "Combined revenue across reports"),
    metricCard("Average score", number(summary.averageScore || 0), "Based on AI comparison model"),
    metricCard("Total calls", number(summary.totalCalls || 0), "Activity volume across employees")
  ].join("");

  document.getElementById("summaryText").innerHTML = `
    <p><strong>System summary:</strong> ${summary.totalReports || 0} reports processed with an average score of ${number(summary.averageScore || 0)}/10.</p>
    <p><strong>Top recurring issue:</strong> ${summary.commonProblems?.[0]?.problem || "No issue detected yet"}.</p>
    <p><strong>Action:</strong> Use this dashboard to coach weak performers and track week-over-week improvement.</p>
  `;

  renderList(document.getElementById("topPerformers"), summary.topPerformers || [], "No top performers yet", "top");
  renderList(document.getElementById("weakEmployees"), summary.weakEmployees || [], "No weak performers yet", "weak");
  renderReports((analysesData.analyses || []).slice(0, 8));
}

document.getElementById("refreshBtn").addEventListener("click", loadDashboard);
loadDashboard().catch((error) => {
  document.getElementById("healthStatus").textContent = "Offline";
  document.getElementById("healthDetail").textContent = error.message;
});
