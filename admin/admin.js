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
  let testerById = {};

  // Question metadata — labels + groupings used by the rich expanded view
  // and by the rating-chart label lookup.
  const QUESTION_SECTIONS = [
    {
      title: "Login & Onboarding",
      questions: [
        { key: "loginExperience",     label: "Login experience",      type: "rating" },
        { key: "loginMethod",         label: "Login method",          type: "choice" },
        { key: "hadLoginIssues",      label: "Had login issues",      type: "choice" },
        { key: "firstStepClarity",    label: "First step clarity",    type: "rating" },
        { key: "navigationEase",      label: "Navigation ease",       type: "rating" },
        { key: "hadRepetitiveSteps",  label: "Repetitive steps",      type: "choice" },
      ],
    },
    {
      title: "For Shift Seekers",
      role: "employee",
      questions: [
        { key: "emp_findJobs",          label: "Finding jobs",         type: "rating" },
        { key: "emp_jobDetailsClarity", label: "Job details clarity", type: "rating" },
        { key: "emp_applyingJobs",      label: "Applying for jobs",   type: "rating" },
        { key: "emp_notifications",     label: "Job notifications",   type: "rating" },
      ],
    },
    {
      title: "For Businesses",
      role: "employer",
      questions: [
        { key: "biz_createJob",          label: "Creating/posting a job",       type: "rating" },
        { key: "biz_jobDetails",         label: "Entering job details",         type: "rating" },
        { key: "biz_trackingCandidates", label: "Tracking candidates",          type: "rating" },
        { key: "biz_managingJobs",       label: "Managing active jobs",         type: "rating" },
        { key: "biz_workerManagement",   label: "Worker management after hire", type: "rating" },
      ],
    },
    {
      title: "Payments (Stripe)",
      questions: [
        { key: "stripeSetup",    label: "Stripe setup experience",     type: "rating" },
        { key: "stripeWhyNeed",  label: "Was Stripe's purpose clear",  type: "rating" },
        { key: "paymentClarity", label: "Payment flow clarity",        type: "rating" },
      ],
    },
    {
      title: "Design & Performance",
      questions: [
        { key: "appDesign",   label: "App design",  type: "rating" },
        { key: "easeOfUse",   label: "Ease of use", type: "rating" },
        { key: "performance", label: "Performance", type: "rating" },
      ],
    },
    {
      title: "Overall",
      questions: [
        { key: "overallRating", label: "Overall rating",  type: "rating" },
        { key: "recommend",     label: "Would recommend", type: "rating" },
      ],
    },
  ];

  const TEXT_QUESTIONS = [
    { key: "loginIssueDetails",      label: "Login issue details" },
    { key: "repetitiveStepsDetails", label: "Repetitive steps — details" },
    { key: "emp_jobFlowIssues",      label: "Confusing steps in the job flow (Shift Seekers)" },
    { key: "biz_missingInfo",        label: "Anything missing or unclear (Businesses)" },
    { key: "stripeIssues",           label: "Stripe / payment issues" },
    { key: "bugsEncountered",        label: "Bugs or crashes encountered" },
    { key: "workedWell",             label: "What worked really well" },
    { key: "mostFrustrating",        label: "Most frustrating or confusing part" },
    { key: "oneChange",              label: "ONE change that would make the app much better" },
    { key: "featureWishes",          label: "Wished-for features" },
  ];

  const STRUCTURED_KEYS = QUESTION_SECTIONS.flatMap((s) => s.questions.map((q) => q.key));
  const TEXT_KEYS = TEXT_QUESTIONS.map((q) => q.key);
  const ALL_KEYS = [...STRUCTURED_KEYS, ...TEXT_KEYS];

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

  function ratingClass(n) {
    if (typeof n !== "number") return "empty";
    if (n >= 4) return "good";
    if (n >= 3) return "mid";
    return "bad";
  }

  function ratingPill(n) {
    if (typeof n !== "number") return `<span class="rating-pill empty">—</span>`;
    return `<span class="rating-pill ${ratingClass(n)}">${n} / 5</span>`;
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
    if (res.status === 401 || !res.ok) {
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
        return;
      }
      if (!res.ok) {
        loginErr.textContent = "Invalid password.";
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
    testerById = Object.fromEntries(allTesters.map((t) => [t.id, t]));

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
    const labelByKey = Object.fromEntries(
      QUESTION_SECTIONS.flatMap((s) => s.questions).map((q) => [q.key, q.label])
    );
    const labels = ratings.map((r) => labelByKey[r.question] || r.question);
    charts["chart-ratings"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
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

  // ---- feedback ----
  function getFilteredFeedback() {
    const role = document.getElementById("fb-filter-role").value;
    const ratingFilter = document.getElementById("fb-filter-rating").value;
    const search = document.getElementById("fb-filter-search").value.toLowerCase();

    return allFeedback.filter((f) => {
      if (role && f.role !== role) return false;

      const overall = f.responses?.overallRating;
      if (ratingFilter === "5" && overall !== 5) return false;
      if (ratingFilter === "4" && !(typeof overall === "number" && overall >= 4)) return false;
      if (ratingFilter === "3" && !(typeof overall === "number" && overall >= 3)) return false;
      if (ratingFilter === "lt3" && !(typeof overall === "number" && overall < 3)) return false;

      if (search) {
        const tester = testerById[f.tester_id] || {};
        const haystack =
          (tester.email || "") +
          " " +
          Object.values(f.responses || {})
            .map((v) => String(v ?? ""))
            .join(" ");
        if (!haystack.toLowerCase().includes(search)) return false;
      }
      return true;
    });
  }

  function renderFeedback() {
    const rows = getFilteredFeedback();

    if (rows.length === 0) {
      tbodyFeedback.innerHTML = `<tr><td colspan="7" class="empty">No feedback responses match these filters.</td></tr>`;
      return;
    }

    tbodyFeedback.innerHTML = rows
      .map((f) => {
        const tester = testerById[f.tester_id] || {};
        const overall = f.responses?.overallRating;
        const recommend = f.responses?.recommend;
        const platform = tester.platform;
        return `
        <tr data-row-id="${escapeHtml(f.id)}">
          <td>${fmtDate(f.submitted_at)}</td>
          <td>${
            tester.email
              ? `<a href="mailto:${escapeHtml(tester.email)}">${escapeHtml(tester.email)}</a>`
              : "—"
          }</td>
          <td>${platform ? badge(platform === "android" ? "Android" : "iOS", platform) : "—"}</td>
          <td>${badge(f.role === "employee" ? "Shift Seeker" : "Business", f.role)}</td>
          <td>${ratingPill(overall)}</td>
          <td>${ratingPill(recommend)}</td>
          <td><button class="view-btn" data-toggle-id="${escapeHtml(f.id)}">View</button></td>
        </tr>
        <tr id="detail-${escapeHtml(f.id)}" class="detail-row" style="display:none;">
          <td colspan="7" class="fb-detail">${renderFeedbackDetail(f, tester)}</td>
        </tr>
      `;
      })
      .join("");
  }

  function renderFeedbackDetail(f, tester) {
    const r = f.responses || {};

    const meta = `
      <div class="fb-meta">
        ${
          tester.email
            ? `<span><strong>Email:</strong> <a href="mailto:${escapeHtml(tester.email)}">${escapeHtml(tester.email)}</a></span>`
            : ""
        }
        ${
          tester.platform
            ? `<span><strong>Platform:</strong> ${badge(tester.platform === "android" ? "Android" : "iOS", tester.platform)}</span>`
            : ""
        }
        <span><strong>Role:</strong> ${badge(f.role === "employee" ? "Shift Seeker" : "Business", f.role)}</span>
        <span><strong>Submitted:</strong> ${fmtDate(f.submitted_at)}</span>
      </div>
    `;

    const sections = QUESTION_SECTIONS.filter((s) => !s.role || s.role === f.role)
      .map((s) => {
        const items = s.questions
          .filter((q) => r[q.key] !== undefined && r[q.key] !== null && r[q.key] !== "")
          .map((q) => {
            const v = r[q.key];
            if (q.type === "rating" && typeof v === "number") {
              const pct = Math.max(0, Math.min(100, (v / 5) * 100));
              const cls = ratingClass(v);
              return `
                <div class="fb-q">
                  <span class="fb-q-label">${escapeHtml(q.label)}</span>
                  <div class="fb-q-rating">
                    <div class="fb-rating-bar"><div class="fb-rating-fill fb-rating-${cls}" style="width:${pct}%"></div></div>
                    <span class="fb-rating-num">${v} / 5</span>
                  </div>
                </div>
              `;
            }
            return `
              <div class="fb-q">
                <span class="fb-q-label">${escapeHtml(q.label)}</span>
                <span class="fb-q-choice">${escapeHtml(v)}</span>
              </div>
            `;
          })
          .join("");

        if (!items) return "";
        return `<div class="fb-section"><h4>${escapeHtml(s.title)}</h4>${items}</div>`;
      })
      .filter(Boolean)
      .join("");

    const textAnswers = TEXT_QUESTIONS.filter(
      (q) => typeof r[q.key] === "string" && r[q.key].trim() !== ""
    )
      .map(
        (q) => `
        <div class="fb-text-q">
          <div class="fb-text-label">${escapeHtml(q.label)}</div>
          <div class="fb-text-value">${escapeHtml(r[q.key])}</div>
        </div>
      `
      )
      .join("");

    const textBlock = textAnswers
      ? `<div class="fb-section fb-section-text"><h4>Open feedback</h4>${textAnswers}</div>`
      : `<div class="fb-section fb-section-text"><h4>Open feedback</h4><div class="fb-empty">No text answers were filled in.</div></div>`;

    return meta + sections + textBlock;
  }

  // ---- CSV export ----
  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportFeedbackCSV() {
    const rows = getFilteredFeedback();
    if (rows.length === 0) {
      alert("No feedback rows to export with the current filters.");
      return;
    }

    const headers = ["submitted_at", "email", "platform", "role", ...STRUCTURED_KEYS, ...TEXT_KEYS];

    const lines = [headers.join(",")];
    for (const f of rows) {
      const t = testerById[f.tester_id] || {};
      const cells = [
        f.submitted_at,
        t.email || "",
        t.platform || "",
        f.role || "",
        ...ALL_KEYS.map((k) => f.responses?.[k] ?? ""),
      ];
      lines.push(cells.map(csvEscape).join(","));
    }
    // BOM so Excel opens UTF-8 cleanly
    const csv = "﻿" + lines.join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anytimeshift-feedback-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---- event delegation: View buttons ----
  tbodyFeedback.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-toggle-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-toggle-id");
    const row = document.getElementById(`detail-${id}`);
    if (!row) return;
    const opening = row.style.display === "none";
    row.style.display = opening ? "table-row" : "none";
    btn.textContent = opening ? "Hide" : "View";
  });

  // ---- filter wiring ----
  ["filter-platform", "filter-role", "filter-search"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderSignups);
  });
  ["fb-filter-role", "fb-filter-rating", "fb-filter-search"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderFeedback);
  });
  document.getElementById("export-feedback-csv").addEventListener("click", exportFeedbackCSV);

  // Try to load on page open — cookie may already be valid
  tryLoad();
})();
