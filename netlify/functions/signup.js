const nodemailer = require("nodemailer");
const axios = require("axios");

const BETA_TESTERS_API = "https://api.anytimeshift.com/beta_testers";
const GAS_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec";

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { platform, role, email, wantsFeedback } = body;

    if (!platform || !role || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing required fields" }),
      };
    }

    if (!process.env.EMAIL_PASS) {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "EMAIL_PASS not configured" }),
      };
    }

    // Normalize values
    const normalizedPlatform = String(platform).trim().toLowerCase();
    const roleRaw = String(role).trim().toLowerCase();

    // UI sends: "Shift Seeker" | "Business"
    const normalizedRole =
      roleRaw.includes("shift") || roleRaw.includes("employee")
        ? "employee"
        : "employer";

    let appLink = "";
    let appLabel = "";

    // Determine app link
    if (normalizedPlatform === "android") {
      if (normalizedRole === "employee") {
        appLink = "https://play.google.com/apps/internaltest/4701244117919733299";
        appLabel = "Android – Shift Seeker";
      } else {
        appLink = "https://play.google.com/apps/internaltest/4700935281386516321";
        appLabel = "Android – Business";
      }
    } else if (normalizedPlatform === "ios") {
      if (normalizedRole === "employee") {
        appLink = "https://testflight.apple.com/join/hUTzGr2L";
        appLabel = "iOS – Shift Seeker";
      } else {
        appLink = "https://testflight.apple.com/join/g7Qp7977";
        appLabel = "iOS – Business";
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid platform" }),
      };
    }

    // Save to external API (optional)
    try {
      await axios.post(
        BETA_TESTERS_API,
        {
          platform: normalizedPlatform,
          role: normalizedRole,
          email,
          wantsFeedback: !!wantsFeedback,
        },
        { timeout: 8000 }
      );
    } catch (err) {
      console.log("Warning: BETA_TESTERS_API failed:", err.message);
    }

    // Save to Google Apps Script
    try {
      await axios.post(
        GAS_ENDPOINT,
        {
          action: "registerBetaTester",
          email,
          platform: normalizedPlatform,
          role: normalizedRole,
          wantsFeedback: !!wantsFeedback,
          initialEmailSentAt: new Date().toISOString(),
        },
        { timeout: 8000 }
      );
    } catch (err) {
      console.log("Warning: GAS endpoint failed:", err.message);
    }

    // Mail transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "info@anytimeshift.com",
        pass: process.env.EMAIL_PASS,
      },
    });

    // Verify transporter
    await transporter.verify();

    // Send welcome email
    const subject = "Your Anytime Shift beta app link";

    const text = [
      "Hi,",
      "",
      "Thanks for signing up for the Anytime Shift beta!",
      "",
      "Here is your app link:",
      appLink,
      "",
      `Platform: ${normalizedPlatform === "android" ? "Android" : "iOS"}`,
      `Role: ${normalizedRole === "employee" ? "Shift Seeker" : "Business"}`,
      "",
      wantsFeedback
        ? "You’ll receive a follow-up email later with a short feedback form."
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
          <a href="${appLink}"
             style="background:#1e3a8a;color:#fff;padding:12px 18px;
                    border-radius:8px;text-decoration:none;font-weight:bold">
            Open Beta App
          </a>
        </p>
        <p style="color:#555">Or copy: ${appLink}</p>
        <p><strong>${appLabel}</strong></p>
        <p>
          ${
            wantsFeedback
              ? "You’ll receive a follow-up email later with a short feedback form."
              : "You can reply to this email anytime with feedback."
          }
        </p>
        <p>Thank you,<br/>Anytime Shift Team</p>
      </div>
    `;

    await transporter.sendMail({
      from: '"Anytime Shift" <info@anytimeshift.com>',
      to: email,
      subject,
      text,
      html,
    });

    // Internal alert for Android signups (fire-and-forget)
    if (normalizedPlatform === "android") {
      transporter.sendMail({
        from: '"Anytime Shift Internal" <info@anytimeshift.com>',
        to: "info@anytimeshift.com",
        subject: `New beta signup – ${appLabel}`,
        text: `Email: ${email}\nPlatform: ${normalizedPlatform}\nRole: ${normalizedRole}`,
      }).catch(() => {});
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Signup processed successfully" }),
    };
  } catch (err) {
    console.error("Signup error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" }),
    };
  }
};
