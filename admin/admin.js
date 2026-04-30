(function () {
  const loginView = document.getElementById("loginView");
  const dashboardView = document.getElementById("dashboardView");
  const loadingMsg = document.getElementById("loadingMsg");
  const dashboardContent = document.getElementById("dashboardContent");

  const passwordInput = document.getElementById("passwordInput");
  const loginBtn = document.getElementById("loginBtn");
  const loginErr = document.getElementById("loginErr");
  const logoutBtn = document.getElementById("logoutBtn");

  const tbodySignups = document.getElementById("tbody-signups");
  const tbodyFeedback = document.getElementById("tbody-feedback");

  const charts = {};
  let allTesters = [];
  let allFeedback = [];

  // ---- helpers ----
  function fmtDate(s) {
    if (!s) return "—";
    const d = new Date(s);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function badge(text, kind) {
    return `<span class="badge ${kind}">${escapeHtml(text)}</span>`;
  }

  function showLogin() {
    loginView.style.display = "flex";
    dashboardView.style.display = "none";
    setTimeout(() => passwordInput.focus(), 0);
  }

  function showDashboard() {
    loginView.style.display = "none";
    dashboardView.style.display = "block";
  }

  // ---- data load ----
  async function tryLoad() {
    let res;
    try {
      res = await fetch("/.netlify/functions/adminData", { credentials: "same-origin" });
    } catch {
      showLogin();
      return;
    }
    if (res.status === 401) {
      showLogin();
      return;
    }
    if (!res.ok) {
      showLogin();
      return;
    }
    const data = await res.json();
    showDashboard();
    render(data);
  }

  // ---- login flow ----
  loginBtn.addEventListener("click", login);
  passwordInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });

  async function login() {
    loginErr.textContent = "";
    if (!passwordInput.value) {
      loginErr.textContent = "Enter your password.";
      return;
    }
    loginBtn.disabled = true;
    try {
      const res = await fetch("/.netlify/functions/adminLogin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password: passwordInput.value }),
      });
      if (res.status === 429) {
        loginErr.textContent = "Too many attempts. Wait a few minutes.";
        loginBtn.disabled = false;
        return;
      }
      if (!res.ok) {
        loginErr.textContent = "Invalid password.";
        loginBtn.disabled = false;
        return;
      }
      passwordInput.value = "";
      await tryLoad();
    } catch {
      loginErr.textContent = "Network error. Try again.";
    } finally {
      loginBtn.disabled = false;
    }
  }

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/.netlify/functions/adminLogout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      /* ignore */
    }
    location.reload();
  });

  // ---- render ----
  function render(data) {
    loadingMsg.style.display = "none";
    dashboardContent.style.display = "block";

    allTesters = data.testers || [];
    allFeedback = data.feedback || [];

    document.getElementById("kpi-totalSignups").textContent = data.kpis.totalSignups;
    document.getElementById("kpi-totalFeedback").textContent = data.kpis.totalFeedback;
    document.getElementById("kpi-completionRate").textContent = data.kpis.completionRate;
    document.getElementById("kpi-last24h").textContent = data.kpis.last24h;

    renderDonut(
      "chart-platform",
      { Android: data.charts.platformCounts.android, iOS: data.charts.platformCounts.ios },
      ["#10b981", "#3b82f6"]
    );

    renderDonut(
      "chart-role",
      {
        "Shift Seeker": data.charts.roleCounts.employee,
        Business: data.charts.roleCounts.employer,
      },
      ["#f59e0b", "#8b5cf6"]
    );

    renderDonut(
      "chart-feedback",
      { Yes: data.charts.wantsFeedbackCounts.yes, No: data.charts.wantsFeedbackCounts.no },
      ["#10b981", "#ef4444"]
    );

    renderTimeseries(data.charts.signupsTimeseries);
    renderRatings(data.charts.ratingAverages);
    renderSignups();
    renderFeedback();
  }

  function destroyChart(id) {
    if (charts[id]) {
      charts[id].destroy();
      delete charts[id];
    }
  }

  function renderDonut(id, dict, colors) {
    destroyChart(id);
    const ctx = document.getElementById(id).getContext("2d");
    charts[id] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: Object.keys(dict),
        datasets: [{ data: Object.values(dict), backgroundColor: colors, borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
      },
    });
  }

  function renderTimeseries(series) {
    destroyChart("chart-timeseries");
    const ctx = document.getElementById("chart-timeseries").getContext("2d");
    charts["chart-timeseries"] = new Chart(ctx, {
      type: "line",
      data: {
        labels: series.map((p) => p.date),
        datasets: [
          {
            label: "Signups",
            data: series.map((p) => p.count),
            borderColor: "#001f3f",
            backgroundColor: "rgba(0, 31, 63, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: false } },
      },
    });
  }

  function renderRatings(ratings) {
    destroyChart("chart-ratings");
    const ctx = document.getElementById("chart-ratings").getContext("2d");
    charts["chart-ratings"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ratings.map((r) => r.question),
        datasets: [
          {
            label: "Average rating",
            data: ratings.map((r) => r.avg),
            backgroundColor: ratings.map((r) =>
              r.avg >= 4 ? "#10b981" : r.avg >= 3 ? "#f59e0b" : "#ef4444"
            ),
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { min: 0, max: 5, ticks: { stepSize: 1 } } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const r = ratings[ctx.dataIndex];
                return ` ${r.avg} (n=${r.count})`;
              },
            },
          },
        },
      },
    });
  }

  function renderSignups() {
    const platform = document.getElementById("filter-platform").value;
    const role = document.getElementById("filter-role").value;
    const search = document.getElementById("filter-search").value.toLowerCase();

    const rows = allTesters.filter((t) => {
      if (platform && t.platform !== platform) return false;
      if (role && t.role !== role) return false;
      if (search && !t.email.toLowerCase().includes(search)) return false;
      return true;
    });

    if (rows.length === 0) {
      tbodySignups.innerHTML = `<tr><td colspan="6" class="empty">No signups match these filters.</td></tr>`;
      return;
    }

    tbodySignups.innerHTML = rows
      .map(
        (t) => `
      <tr>
        <td>${escapeHtml(t.email)}</td>
        <td>${badge(t.platform === "android" ? "Android" : "iOS", t.platform)}</td>
        <td>${badge(t.role === "employee" ? "Shift Seeker" : "Business", t.role)}</td>
        <td>${badge(t.wants_feedback ? "Yes" : "No", t.wants_feedback ? "yes" : "no")}</td>
        <td>${fmtDate(t.signed_up_at)}</td>
        <td>${fmtDate(t.feedback_email_sent_at)}</td>
      </tr>
    `
      )
      .join("");
  }

  function renderFeedback() {
    if (allFeedback.length === 0) {
      tbodyFeedback.innerHTML = `<tr><td colspan="5" class="empty">No feedback responses yet.</td></tr>`;
      return;
    }

    tbodyFeedback.innerHTML = allFeedback
      .map((f) => {
        const overall = f.responses?.overallRating ?? "—";
        const recommend = f.responses?.recommend ?? "—";
        return `
        <tr data-row-id="${escapeHtml(f.id)}">
          <td>${fmtDate(f.submitted_at)}</td>
          <td>${badge(f.role === "employee" ? "Shift Seeker" : "Business", f.role)}</td>
          <td>${overall} / 5</td>
          <td>${recommend} / 5</td>
          <td><button class="view-btn" data-toggle-id="${escapeHtml(f.id)}">View</button></td>
        </tr>
        <tr id="detail-${escapeHtml(f.id)}" style="display:none;">
          <td colspan="5" class="feedback-detail">
            <pre>${escapeHtml(JSON.stringify(f.responses, null, 2))}</pre>
          </td>
        </tr>
      `;
      })
      .join("");
  }

  // Event delegation for the View buttons
  tbodyFeedback.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-toggle-id");
    const row = document.getElementById(`detail-${id}`);
    if (!row) return;
    row.style.display = row.style.display === "none" ? "table-row" : "none";
  });

  ["filter-platform", "filter-role", "filter-search"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderSignups);
  });

  // Try to load on page open — cookie may already be valid
  tryLoad();
})();
