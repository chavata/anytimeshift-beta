const nodemailer = require('nodemailer');
const axios = require('axios');

const GAS_ENDPOINT = 'https://script.google.com/macros/s/https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec/exec';
const FEEDBACK_FORM_URL_BASE = 'https://your-site-name.netlify.app/feedback';

exports.handler = async () => {
  try {
    const res = await axios.get(GAS_ENDPOINT, { params: { action: 'getPendingFeedbackReminders' } });
    const testers = res.data && Array.isArray(res.data.testers) ? res.data.testers : [];

    if (!testers.length) return { statusCode: 200, body: 'No pending reminders' };

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: 'info@anytimeshift.com', pass: process.env.EMAIL_PASS }
    });

    for (const tester of testers) {
      const { email, token } = tester;
      const feedbackLink = `${FEEDBACK_FORM_URL_BASE}?token=${encodeURIComponent(token)}`;

      await transporter.sendMail({
        from: '"Anytime Shift" <info@anytimeshift.com>',
        to: email,
        subject: 'Friendly reminder: Anytime Shift beta feedback',
        text: `Hi,\n\nThis is a friendly reminder to share your feedback on the Anytime Shift beta app: ${feedbackLink}\n\nAnytime Shift Team`
      });

      await axios.post(GAS_ENDPOINT, { action: 'markFeedbackReminderSent', token });
    }

    return { statusCode: 200, body: `Processed ${testers.length} reminders` };
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
