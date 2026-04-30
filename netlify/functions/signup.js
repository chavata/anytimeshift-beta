const nodemailer = require("nodemailer");
const { getSupabase } = require("./_lib/supabase");
const { getAppLink } = require("./_lib/appLinks");
const { checkAndRecord, getClientIp } = require("./_lib/rateLimit");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method Not Allowed" }) };
  }

  if (!process.env.EMAIL_PASS) {
    return { statusCode: 500, body: JSON.stringify({ message: "EMAIL_PASS not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON" }) };
  }

  // Honeypot — bots fill hidden fields. Pretend success, drop silently.
  if (body.website && String(body.website).trim() !== "") {
    return { statusCode: 200, body: JSON.stringify({ message: "Signup processed successfully" }) };
  }

  const { platform, role, email, wantsFeedback } = body;
  if (!platform || !role || !email) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing required fields" }) };
  }

  const normalizedPlatform = String(platform).trim().toLowerCase();
  const roleRaw = String(role).trim().toLowerCase();
  const normalizedRole =
    roleRaw.includes("shift") || roleRaw.includes("employee") ? "employee" : "employer";
  const normalizedEmail = String(email).trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid email" }) };
  }

  const appLink = getAppLink(normalizedPlatform, normalizedRole);
  if (!appLink) {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid platform" }) };
  }

  const ip = getClientIp(event);
  const rl = await checkAndRecord("signup", ip);
  if (!rl.allowed) {
    return {
      statusCode: 429,
      body: JSON.stringify({
        message: `Too many signup attempts. Please try again in ${rl.config.windowMinutes} minutes.`,
      }),
    };
  }

  const supabase = getSupabase();

  const { data: existing, error: findErr } = await supabase
    .from("beta_testers")
    .select("id")
    .eq("email", normalizedEmail)
    .eq("platform", normalizedPlatform)
    .eq("role", normalizedRole)
    .maybeSingle();

  if (findErr) {
    console.error("Supabase find error:", findErr);
    return { statusCode: 500, body: JSON.stringify({ message: "Database error" }) };
  }

  if (!existing) {
    const { error: insertErr } = await supabase.from("beta_testers").insert({
      email: normalizedEmail,
      platform: normalizedPlatform,
      role: normalizedRole,
      wants_feedback: !!wantsFeedback,
    });
    if (insertErr) {
      console.error("Supabase insert error:", insertErr);
      return { statusCode: 500, body: JSON.stringify({ message: "Database error" }) };
    }
  } else if (wantsFeedback) {
    // If they're re-submitting and now want feedback, flip the flag on
    await supabase
      .from("beta_testers")
      .update({ wants_feedback: true })
      .eq("id", existing.id);
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: "info@anytimeshift.com", pass: process.env.EMAIL_PASS },
  });

  try {
    await transporter.verify();
  } catch (err) {
    console.error("Email transporter verify failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ message: "Email service unavailable" }) };
  }

  const platformLabel = normalizedPlatform === "android" ? "Android" : "iOS";
  const roleLabel = normalizedRole === "employee" ? "Shift Seeker" : "Business";

  const text = [
    "Hi,",
    "",
    "Thanks for signing up for the Anytime Shift beta!",
    "",
    "Here is your app link:",
    appLink.url,
    "",
    `Platform: ${platformLabel}`,
    `Role: ${roleLabel}`,
    "",
    wantsFeedback
      ? "You'll receive a follow-up email later with a short feedback form."
      : "You can reply to this email anytime with feedback.",
    "",
    "Thank you,",
    "Anytime Shift Team",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <p>Hi,</p>
      <p>Thanks for signing up for the <strong>Anytime Shift beta</strong>.</p>
      <p><strong>Your app link:</strong></p>
      <p>
        <a href="${appLink.url}"
           style="background:#1e3a8a;color:#fff;padding:12px 18px;
                  border-radius:8px;text-decoration:none;font-weight:bold">
          Open Beta App
        </a>
      </p>
      <p style="color:#555">Or copy: ${appLink.url}</p>
      <p><strong>${appLink.label}</strong></p>
      <p>
        ${
          wantsFeedback
            ? "You'll receive a follow-up email later with a short feedback form."
            : "You can reply to this email anytime with feedback."
        }
      </p>
      <p>Thank you,<br/>Anytime Shift Team</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: '"Anytime Shift" <info@anytimeshift.com>',
      to: normalizedEmail,
      subject: "Your Anytime Shift beta app link",
      text,
      html,
    });
  } catch (err) {
    console.error("sendMail failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ message: "Failed to send email" }) };
  }

  // Internal alert for Android signups (fire-and-forget)
  if (normalizedPlatform === "android") {
    transporter
      .sendMail({
        from: '"Anytime Shift Internal" <info@anytimeshift.com>',
        to: "info@anytimeshift.com",
        subject: `New beta signup – ${appLink.label}`,
        text: `Email: ${normalizedEmail}\nPlatform: ${normalizedPlatform}\nRole: ${normalizedRole}`,
      })
      .catch(() => {});
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Signup processed successfully" }),
  };
};
