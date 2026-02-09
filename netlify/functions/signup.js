const nodemailer = require("nodemailer");
const axios = require("axios");
const { google } = require("googleapis");

const BETA_TESTERS_API = "https://api.anytimeshift.com/beta_testers";
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec";

// (Optional) keep this if you ever want to manage Google Groups from Node;
// right now all group membership is handled in Apps Script, so this helper
// is intentionally unused.

// exports.addEmailToPlayStore = ...

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { platform, role, email, wantsFeedback } = body;

    if (!platform || !role || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Missing required fields" })
      };
    }

    const normalizedPlatform = platform.toLowerCase();
    const normalizedRole = role.toLowerCase();

    let appLink = "";
    let packageName = "";

    if (normalizedPlatform === "android") {
      if (normalizedRole === "employee") {
        appLink = "https://play.google.com/apps/internaltest/4701244117919733299";
        packageName = "com.anytimeshift.employee";
      } else {
        appLink = "https://play.google.com/apps/internaltest/4700935281386516321";
        packageName = "com.anytimeshift.employer";
      }
    } else if (normalizedPlatform === "ios") {
      if (normalizedRole === "employee") {
        appLink = "https://testflight.apple.com/join/hUTzGr2L";
      } else {
        appLink = "https://testflight.apple.com/join/g7Qp7977";
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid platform" })
      };
    }

    // Save to external API (optional, ignore errors)
    try {
      await axios.post(
        BETA_TESTERS_API,
        {
          platform: normalizedPlatform,
          role: normalizedRole,
          email,
          wantsFeedback: !!wantsFeedback
        },
        { timeout: 5000 }
      );
    } catch (err) {
      console.log("Warning: Failed to post to BETA_TESTERS_API:", err.message);
    }

    // Save to Google Apps Script (Sheet + feedback + group enrollment)
    try {
      await axios.post(
        GAS_ENDPOINT,
        {
          action: "registerBetaTester",
          email,
          platform: normalizedPlatform,
          role: normalizedRole,
          wantsFeedback: !!wantsFeedback,
          initialEmailSentAt: new Date().toISOString()
        },
        { timeout: 5000 }
      );
    } catch (err) {
      console.log("Warning: Failed to post to GAS_ENDPOINT:", err.message);
    }

    // Nodemailer transporter (user + internal emails)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "info@anytimeshift.com", pass: process.env.EMAIL_PASS }
    });

    // INTERNAL ALERT helper
    async function sendInternalAlert({ email, platform, role }) {
      try {
        const subject = `New ${platform} beta signup – ${role}`;
        const text = [
          `A new beta tester signed up.`,
          ``,
          `Email: ${email}`,
          `Platform: ${platform}`,
          `Role: ${role}`,
          ``,
          `Quick links:`,
          `Google Sheet: https://docs.google.com/spreadsheets/d/1RC1rOCwy_6erX-PDKWyW21j1LntRST02rKIFkSwiMIE/edit#gid=0`,
          `Play Console (Employee internal testing): https://play.google.com/console/u/2/developers/6639093078553189104/app/4974596505108916957/tracks/internal-testing?tab=testers`,
          `Play Console (Employer internal testing): https://play.google.com/console/u/2/developers/6639093078553189104/app/4972702056459215594/tracks/internal-testing?tab=testers`
        ].join("\n");

        await transporter.sendMail({
          from: '"Anytime Shift Internal" <info@anytimeshift.com>',
          to: "info@anytimeshift.com",
          subject,
          text
        });

        console.log("Internal alert email sent for", email);
      } catch (err) {
        console.error("Failed to send internal alert email:", err.message);
      }
    }

    // Send welcome email to user
    const subject = "Your Anytime Shift beta app link";
    const lines = [
      `Hi,`,
      ``,
      `Thanks for signing up for the Anytime Shift beta!`,
      ``,
      `Here is your app link:`,
      appLink,
      ``,
      `Platform: ${normalizedPlatform === "android" ? "Android" : "iOS"}`,
      `Role: ${
        normalizedRole === "employee"
          ? "Shift Seeker (Employee)"
          : "Business (Employer)"
      }`,
      ``,
      wantsFeedback
        ? "You'll receive a follow-up email in a few hours to share your feedback."
        : "If you change your mind, you can always reply to this email with your feedback.",
      ``,
      `Thank you,`,
      `Anytime Shift Team`
    ];

    await transporter.sendMail({
      from: '"Anytime Shift" <info@anytimeshift.com>',
      to: email,
      subject,
      text: lines.join("\n")
    });

    console.log("Welcome email sent to", email);

    // Fire-and-forget internal alert for Android signups
    if (normalizedPlatform === "android") {
      sendInternalAlert({
        email,
        platform: "Android",
        role: normalizedRole === "employee" ? "Employee" : "Business"
      }).catch((err) => {
        console.error("Error sending internal alert:", err.message);
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Signup processed successfully" })
    };
  } catch (err) {
    console.error("Error in signup function:", err.message);
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal Server Error" })
    };
  }
};
