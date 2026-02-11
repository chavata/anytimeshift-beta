const axios = require('axios');

// Apps Script endpoint (stores feedback into your Google Sheet)
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    payload.action = 'submitFeedback';

    // Minimal validation
    if (!payload.token) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing token' }) };
    }
    if (!payload.role) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Missing role' }) };
    }

    const res = await axios.post(GAS_ENDPOINT, payload, { timeout: 12000 });

    return { statusCode: 200, body: JSON.stringify(res.data) };
  } catch (err) {
    console.error('Error submitting feedback:', err);
    return { statusCode: 500, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
