const nodemailer = require("nodemailer");
const axios = require("axios");
const { google } = require("googleapis");

const BETA_TESTERS_API = "https://api.anytimeshift.com/beta_testers";
const GAS_ENDPOINT = "https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec";

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
      currentTesters = testersResponse.data.testers || [];
    } catch (err) {
      console.log("No existing testers, starting fresh");
    }
    
    // Add the new email if not already in the list
    if (!currentTesters.includes(email)) {
      currentTesters.push(email);
    }
    
    // Update the testers list
    await androidpublisher.edits.testers.patch({
      packageName: packageName,
      editId: editId,
      track: track,
      requestBody: {
        testers: currentTesters
      }
    });
    
    // Commit the edit
    await androidpublisher.edits.commit({
      packageName: packageName,
      editId: editId
    });
    
    console.log("Successfully added", email, "to", packageName, "on", track);
    return true;
  } catch (err) {
    console.error("Error adding email to Play Store:", err.message);
    console.error("Full error:", err);
    return false;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const email = body.email;
    const platform = body.platform;
    const role = body.role;
    const wantsFeedback = body.wantsFeedback;

    if (!email || !platform || !role || wantsFeedback === undefined) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing required fields" }) };
    }

    // Try to post to beta_testers API (optional)
    try {
      await axios.post(BETA_TESTERS_API, { email, platform, role, wantsFeedback });
    } catch (apiErr) {
      console.error("Error calling beta_testers API:", apiErr.message);
    }

    // Add email to Play Store internal testing for Android
    if (platform === "android") {
      const packageName = role === "employee" ? "com.anytimeshift.employee" : "com.anytimeshift.employer";
      await addEmailToPlayStore(email, packageName, "internal");
    }

    // Determine app link and name based on platform and role
    let appLink = "";
    let appName = "";

    if (platform === "android" && role === "employee") {
      appLink = "https://play.google.com/apps/internaltest/4701244117919733299";
      appName = "Anytime Shift App";
    } else if (platform === "android" && role === "employer") {
      appLink = "https://play.google.com/apps/internaltest/4700935281386516321";
      appName = "Anytime Shift for Business";
    } else if (platform === "ios" && role === "employee") {
      appLink = "https://testflight.apple.com/join/hUTzGr2L";
      appName = "Anytime Shift App (iOS TestFlight)";
    } else if (platform === "ios" && role === "employer") {
      appLink = "https://testflight.apple.com/join/g7Qp7977";
      appName = "Anytime Shift for Business (iOS TestFlight)";
    }

    // Send email with app link
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "info@anytimeshift.com", pass: process.env.EMAIL_PASS }
    });

    const mailOptions = {
      from: "\"Anytime Shift\" <info@anytimeshift.com>",
      to: email,
      subject: "Your Anytime Shift beta app link",
      text: "Hi,\n\nThanks for enrolling in the Anytime Shift beta testing program.\nHere is your app link for " + appName + ":\n" + appLink + "\n\nWe appreciate your support,\nAnytime Shift Team"
    };

    await transporter.sendMail(mailOptions);

    // Register beta tester in Google Apps Script
    try {
      await axios.post(GAS_ENDPOINT, {
        action: "registerBetaTester",
        email, 
        platform, 
        role, 
        wantsFeedback,
        initialEmailSentAt: new Date().toISOString()
      });
    } catch (gasErr) {
      console.error("Error calling GAS endpoint:", gasErr.message);
    }

    return { statusCode: 200, body: JSON.stringify({ message: "Signup processed" }) };
  } catch (err) {
    console.error("Signup error:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
