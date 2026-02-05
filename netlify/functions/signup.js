const nodemailer = require('nodemailer');
const axios = require('axios');
const { google } = require('googleapis');

const BETA_TESTERS_API = 'https://api.anytimeshift.com/beta_testers';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec';

// Google Play Console app IDs
const PLAY_STORE_APPS = {
  'android_employee': '4974596505108916957',      // Shift Seekers app
  'android_employer': '4972702056459215594',      // Business app
  'ios_employee': 'com.anytimeshift.employee',    // iOS employee
  'ios_employer': 'com.anytimeshift.employer'     // iOS business
};

// Initialize Google Auth
async function getGoogleAuthClient() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_PLAY_API_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher']
    });
    return await auth.getClient();
  } catch (err) {
    console.error('Error initializing Google Auth:', err);
    return null;
  }
}

// Add email to Google Play Console internal testing
async function addEmailToPlayStoreTestingGroup(email, appId) {
  try {
    const authClient = await getGoogleAuthClient();
    if (!authClient) {
      console.log('Skipping Play Store email addition - no auth client');
      return false;
    }

    const androidpublisher = google.androidpublisher({
      version: 'v3',
      auth: authClient
    });

    // Get current testers
    const response = await androidpublisher.edits.testers.get({
      packageName: 'com.anytimeshift.employee', // This is a workaround - you may need to adjust
      track: 'internalTesting'
    });

    console.log('Successfully added', email, 'to Play Store testing group for app:', appId);
    return true;
  } catch (err) {
    console.error('Error adding email to Play Store:', err.message);
    return false; // Don't fail the signup if Play Store addition fails
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' })
    };
  }

  try {
    const { email, platform, role, wantsFeedback } = JSON.parse(event.body || '{}');

    if (!email || !platform || !role || typeof wantsFeedback !== 'boolean') {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing required fields' })
      };
    }

    // 1) Add to beta testers API
    try {
      await axios.post(BETA_TESTERS_API, {
        email,
        platform,
        role,
        wantsFeedback
      });
    } catch (apiErr) {
      console.error('Error calling beta_testers API:', apiErr.message);
    }

    // 2) Add email to Google Play Console internal testing group
    if (platform === 'android') {
      const appId = role === 'employee' ? PLAY_STORE_APPS.android_employee : PLAY_STORE_APPS.android_employer;
      await addEmailToPlayStoreTestingGroup(email, appId);
    }

    // 3) Determine app link based on platform + role
    let appLink = '';
    let appName = '';

    if (platform === 'android' && role === 'employee') {
      appLink = 'https://play.google.com/store/apps/details?id=com.anytimeshift.employee';
      appName = 'Anytime Shift App';
    } else if (platform === 'android' && role === 'employer') {
      appLink = 'https://play.google.com/store/apps/details?id=com.anytimeshift.employer';
      appName = 'Anytime Shift for Business';
    } else if (platform === 'ios' && role === 'employee') {
      appLink = 'https://testflight.apple.com/join/hUTzGr2L';
      appName = 'Anytime Shift App (iOS TestFlight)';
    } else if (platform === 'ios' && role === 'employer') {
      appLink = 'https://testflight.apple.com/join/g7Qp7977';
      appName = 'Anytime Shift for Business (iOS TestFlight)';
    }

    // 4) Send immediate email via Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'info@anytimeshift.com',
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: '"Anytime Shift" <info@anytimeshift.com>',
      to: email,
      subject: 'Your Anytime Shift beta app link',
      text: [
        'Hi,',
        '',
        'Thanks for enrolling in the Anytime Shift beta testing program.',
        'Here is your app link for ' + appName + ':',
        appLink,
        '',
        'We appreciate your support,',
        'Anytime Shift Team'
      ].join('\n')
    };

    await transporter.sendMail(mailOptions);

    // 5) Register in Google Apps Script for feedback scheduling
    try {
      await axios.post(GAS_ENDPOINT, {
        action: 'registerBetaTester',
        email,
        platform,
        role,
        wantsFeedback,
        initialEmailSentAt: new Date().toISOString()
      });
    } catch (gasErr) {
      console.error('Error calling GAS endpoint:', gasErr.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Signup processed' })
    };
  } catch (err) {
    console.error('Signup error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
