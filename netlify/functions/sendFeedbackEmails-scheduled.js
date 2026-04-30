const nodemailer = require("nodemailer");
const { getSupabase } = require("./_lib/supabase");

exports.config = {
  schedule: "*/5 * * * *",
};

const SIGNUP_DELAY_MINUTES = 5;
const BATCH_SIZE = 50;

function feedbackUrl(token, role) {
  const base = `${process.env.URL || "https://anytimeshift-betatestingform.netlify.app"}/feedback`;
  return `${base}?token=${encodeURIComponent(token)}&role=${encodeURIComponent(role)}`;
}

exports.handler = async () => {
  console.log("=== Scheduled Feedback Email Function Started ===");
  console.log("Time (UTC):", new Date().toISOString());

  if (!process.env.EMAIL_PASS) {
    console.error("ERROR: EMAIL_PASS not set");
    return { statusCode: 500, body: JSON.stringify({ error: "EMAIL_PASS not configured" }) };
  }

  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - SIGNUP_DELAY_MINUTES * 60 * 1000).toISOString();

  const { data: testers, error } = await supabase
    .from("beta_testers")
    .select("id, email, role, feedback_token")
    .eq("wants_feedback", true)
    .is("feedback_email_sent_at", null)
    .lt("signed_up_at", cutoff)
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Supabase query error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Database error" }) };
  }

  console.log(`Found ${testers.length} pending tester(s)`);
  if (!testers.length) {
    return { statusCode: 200, body: "No pending feedback emails" };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: "info@anytimeshift.com", pass: process.env.EMAIL_PASS },
  });

  try {
    await transporter.verify();
  } catch (verifyError) {
    console.error("Email verification failed:", verifyError.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Email auth failed", details: verifyError.message }),
    };
  }

  let successCount = 0;
  let failCount = 0;
  const errors = [];

  for (const tester of testers) {
    const { id, email, role, feedback_token } = tester;
    const link = feedbackUrl(feedback_token, role);

    console.log(`Processing: ${email} (${role})`);

    try {
      const result = await transporter.sendMail({
        from: '"Anytime Shift" <info@anytimeshift.com>',
        to: email,
        subject: "We'd love your feedback on Anytime Shift",
        text: `Hi,

Thanks again for installing the Anytime Shift beta app.
We'd really appreciate your feedback:
${link}

Anytime Shift Team`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <p>Hi,</p>
            <p>Thanks again for installing the Anytime Shift beta app.</p>
            <p>We'd really appreciate your feedback:</p>
            <p>
              <a href="${link}" style="display:inline-block;background-color:#001f3f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">
                Share Your Feedback
              </a>
            </p>
            <p style="color:#555;">Or copy this link: ${link}</p>
            <p>Thank you,<br>Anytime Shift Team</p>
          </div>
        `,
      });

      console.log(`✓ Sent to ${email} (${result.messageId})`);

      const { error: updateErr } = await supabase
        .from("beta_testers")
        .update({ feedback_email_sent_at: new Date().toISOString() })
        .eq("id", id);

      if (updateErr) {
        console.error(`WARNING: sent but failed to mark for ${email}:`, updateErr.message);
        errors.push({ email, stage: "marking", error: updateErr.message });
      }
      successCount++;
    } catch (sendError) {
      console.error(`✗ Failed for ${email}:`, sendError.message);
      failCount++;
      errors.push({ email, stage: "sending", error: sendError.message });
    }
  }

  const summary = {
    totalProcessed: testers.length,
    successCount,
    failCount,
    errors: errors.length > 0 ? errors : undefined,
  };

  console.log("=== Summary ===");
  console.log(JSON.stringify(summary, null, 2));

  return { statusCode: 200, body: JSON.stringify(summary) };
};
