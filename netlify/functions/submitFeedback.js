const { getSupabase } = require("./_lib/supabase");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON" }) };
  }

  const { token, role, ...responses } = payload;

  if (!token) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing token" }) };
  }
  if (!role) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing role" }) };
  }

  const supabase = getSupabase();

  const { data: tester, error: findErr } = await supabase
    .from("beta_testers")
    .select("id")
    .eq("feedback_token", token)
    .maybeSingle();

  if (findErr) {
    console.error("Lookup error:", findErr);
    return { statusCode: 500, body: JSON.stringify({ message: "Database error" }) };
  }
  if (!tester) {
    return { statusCode: 404, body: JSON.stringify({ message: "Invalid token" }) };
  }

  const { error: upsertErr } = await supabase.from("feedback_responses").upsert(
    {
      tester_id: tester.id,
      role,
      responses,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "tester_id" }
  );

  if (upsertErr) {
    console.error("Upsert error:", upsertErr);
    return { statusCode: 500, body: JSON.stringify({ message: "Failed to save feedback" }) };
  }

  return { statusCode: 200, body: JSON.stringify({ message: "Feedback submitted" }) };
};
