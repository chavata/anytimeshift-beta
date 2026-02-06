const nodemailer = require("nodemailer");
const axios = require("axios");
const { google } = require("googleapis");

const BETA_TESTERS_API = "https://api.anytimeshift.com/beta_testers";
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec";

// Helper to add email to Play Store (kept for logging; API limitation prevents per-email adds)
async function addEmailToPlayStore(email, packageName, track) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_PLAY_API_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"]
    });
    const authClient = await auth.getClient();
    const androidpublisher = google.androidpublisher({ version: "v3", auth: authClient });

    // Create an edit
    const editResponse = await androidpublisher.edits.insert({
      packageName: packageName
    });
    const editId = editResponse.data.id;

    // Get the current testers list for the track
    let currentTesters = [];
    try {
      const testersResponse = await androidpublisher.edits.testers.get({
        packageName: packageName,
        editId: editId,
        track: track
      });

      // NOTE: API does not actually support per-email testers; this will not return what we expect
      currentTesters = testersResponse.data.testers || [];
    } catch (err) {
      console.log("No existing testers, starting fresh");
    }

    if (!currentTesters.includes(email)) {
      currentTesters.push(email);
    }

    // This PATCH body is rejected by the API (no 'testers' field),
    // but we keep it for logging; real per-email enrollment must be manual.
    await androidpublisher.edits.testers.patch({
      packageName: packageName,
      editId: editId,
      track: track,
      requestBody: {
        testers: currentTesters
      }
    });

    await androidpublisher.edits.commit({
      packageName: packageName,
      editId: editId
    });

    console.log("Successfully (attempted) to add", email, "to", packageName, "on", track);
    return true;
  } catch (err) {
    console.error("Error adding email to Play Store:", err.message);
    console.error("Full error:", err);
    return false;
  }
}

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

    // Save to Google Apps Script (Sheet + feedback scheduling)
    try {
      await axios.post(
        GAS_ENDPOINT,
        {
          platform: normalizedPlatform,
          role: normalizedRole,
          email,
          wantsFeedback: !!wantsFeedback
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

    // INTERNAL ALERT helper (new)
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
      `Role: ${normalizedRole === "employee" ? "Shift Seeker (Employee)" : "Business (Employer)"}`,
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

    // Attempt Play Store add (will fail due to API limitation, but safe)
    if (normalizedPlatform === "android" && packageName) {
      try {
        const ok = await addEmailToPlayStore(email, packageName, "internal");
        console.log("addEmailToPlayStore result:", ok);
      } catch (err) {
        console.log("Play Store add failed (expected limitation):", err.message);
      }
    }

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
