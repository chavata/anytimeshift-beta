const { getSupabase } = require("./_lib/supabase");
const { verifySessionCookie } = require("./_lib/auth");

const ROW_LIMIT = 500;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  if (!process.env.ADMIN_SECRET) {
    return { statusCode: 500, body: JSON.stringify({ message: "Admin auth not configured" }) };
  }

  const cookieHeader = event.headers.cookie || event.headers.Cookie;
  if (!verifySessionCookie(cookieHeader, process.env.ADMIN_SECRET)) {
    return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };
  }

  const supabase = getSupabase();

  const [testersRes, feedbackRes] = await Promise.all([
    supabase
      .from("beta_testers")
      .select("id, email, platform, role, wants_feedback, signed_up_at, feedback_email_sent_at")
      .order("signed_up_at", { ascending: false })
      .limit(ROW_LIMIT),
    supabase
      .from("feedback_responses")
      .select("id, tester_id, role, responses, submitted_at")
      .order("submitted_at", { ascending: false })
      .limit(ROW_LIMIT),
  ]);

  if (testersRes.error || feedbackRes.error) {
    console.error("Supabase errors:", testersRes.error, feedbackRes.error);
    return { statusCode: 500, body: JSON.stringify({ message: "Database error" }) };
  }

  const testers = testersRes.data || [];
  const feedback = feedbackRes.data || [];

  // ---- KPIs ----
  const totalSignups = testers.length;
  const totalFeedback = feedback.length;
  const wantsFeedbackCount = testers.filter((t) => t.wants_feedback).length;
  const completionRate =
    wantsFeedbackCount > 0 ? Math.round((totalFeedback / wantsFeedbackCount) * 100) : 0;
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = testers.filter((t) => new Date(t.signed_up_at).getTime() >= dayAgo).length;

  // ---- Counts for donut charts ----
  const platformCounts = { android: 0, ios: 0 };
  const roleCounts = { employee: 0, employer: 0 };
  const wantsFeedbackCounts = { yes: 0, no: 0 };

  for (const t of testers) {
    if (t.platform in platformCounts) platformCounts[t.platform]++;
    if (t.role in roleCounts) roleCounts[t.role]++;
    if (t.wants_feedback) wantsFeedbackCounts.yes++;
    else wantsFeedbackCounts.no++;
  }

  // ---- Signups per day (last 30 days) ----
  const days = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days[d.toISOString().slice(0, 10)] = 0;
  }
  for (const t of testers) {
    const date = new Date(t.signed_up_at).toISOString().slice(0, 10);
    if (date in days) days[date]++;
  }
  const signupsTimeseries = Object.entries(days).map(([date, count]) => ({ date, count }));

  // ---- Average ratings per question (across all feedback) ----
  const ratingSums = {};
  const ratingCounts = {};
  for (const f of feedback) {
    if (!f.responses || typeof f.responses !== "object") continue;
    for (const [key, value] of Object.entries(f.responses)) {
      if (typeof value === "number" && value >= 1 && value <= 5) {
        ratingSums[key] = (ratingSums[key] || 0) + value;
        ratingCounts[key] = (ratingCounts[key] || 0) + 1;
      }
    }
  }
  const ratingAverages = Object.keys(ratingSums)
    .map((key) => ({
      question: key,
      avg: Math.round((ratingSums[key] / ratingCounts[key]) * 100) / 100,
      count: ratingCounts[key],
    }))
    .sort((a, b) => b.avg - a.avg);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({
      kpis: { totalSignups, totalFeedback, completionRate, last24h },
      charts: {
        platformCounts,
        roleCounts,
        wantsFeedbackCounts,
        signupsTimeseries,
        ratingAverages,
      },
      testers,
      feedback,
    }),
  };
};
