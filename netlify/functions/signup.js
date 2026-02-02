const nodemailer = require('nodemailer');
const axios = require('axios');

const BETA_TESTERS_API = 'https://api.anytimeshift.com/beta_testers';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec/exec';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  try {
    const { email, platform, role, wantsFeedback } = JSON.parse(event.body || '{}');

    if (!email || !platform || !role || typeof wantsFeedback !== 'boolean') {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing required fields' }) };
    }

    // 1) Add to beta testers API
    try {
      await axios.post(BETA_TESTERS_API, { email, platform, role, wantsFeedback });
    } catch (apiErr) {
      console.error('Error calling beta_testers API:', apiErr.message);
    }

    // 2) Determine app link
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

    // 3) Send immediate email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: 'info@anytimeshift.com', pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: '"Anytime Shift" <info@anytimeshift.com>',
      to: email,
      subject: 'Your Anytime Shift beta app link',
      text: `Hi,\n\nThanks for enrolling in the Anytime Shift beta testing program.\nHere is your app link for ${appName}:\n${appLink}\n\nWe appreciate your support,\nAnytime Shift Team`
    });

    // 4) Register in Google Sheets
    try {
      await axios.post(GAS_ENDPOINT, {
        action: 'registerBetaTester',
        email, platform, role, wantsFeedback,
        initialEmailSentAt: new Date().toISOString()
      });
    } catch (gasErr) {
      console.error('Error calling GAS endpoint:', gasErr.message);
    }

    return { statusCode: 200, body: JSON.stringify({ message: 'Signup processed' }) };
  } catch (err) {
    console.error('Signup error:', err);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
