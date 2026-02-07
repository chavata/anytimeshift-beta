const axios = require('axios');
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  try {
    const payload = JSON.parse(event.body);
    payload.action = 'submitFeedback';

    const res = await axios.post(GAS_ENDPOINT, payload);
    
    return {
      statusCode: 200,
      body: JSON.stringify(res.data)
    };
  } catch (err) {
    console.error('Error submitting feedback:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' })
    };
  }
};
