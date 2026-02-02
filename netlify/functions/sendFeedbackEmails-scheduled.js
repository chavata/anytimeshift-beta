const nodemailer = require('nodemailer');
const axios = require('axios');

const GAS_ENDPOINT = 'https://script.google.com/macros/s/https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec/exec';
const FEEDBACK_FORM_URL_BASE = 'https://your-site-name.netlify.app/feedback';

exports.handler = async () => {
  try {
    const res = await axios.get(GAS_ENDPOINT, { params: { action: 'getPendingFeedbackEmails' } });
    const testers = res.data && Array.isArray(res.data.testers) ? res.data.testers : [];

    if (!testers.length) return { statusCode: 200, body: 'No pending feedback emails' };

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: 'vasutapasvi@gmail.com', pass: process.env.EMAIL_PASS }
    });

    for (const tester of testers) {
      const { email, token } = tester;
      const feedbackLink = `${FEEDBACK_FORM_URL_BASE}?token=${encodeURIComponent(token)}`;

      await transporter.sendMail({
        from: '"Anytime Shift" <vasutapasvi@gmail.com>',
        to: email,
        subject: "We'd love your feedback on Anytime Shift",
        text: `Hi,\n\nThanks again for installing the Anytime Shift beta app.\nWe'd really appreciate your feedback: ${feedbackLink}\n\nAnytime Shift Team`
      });

      await axios.post(GAS_ENDPOINT, { action: 'markFeedbackEmailSent', token });
    }

    return { statusCode: 200, body: `Processed ${testers.length} feedback emails` };
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
