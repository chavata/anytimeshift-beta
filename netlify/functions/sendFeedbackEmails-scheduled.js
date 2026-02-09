const nodemailer = require('nodemailer');
const axios = require('axios');

const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxc5XmLcS3WgN8_jojcZFPz2HPqcKHYo4zEtDURqiQQ2Gb7IklEZ4m8yReqbBGrFGEb/exec';
const FEEDBACK_FORM_URL_BASE = 'https://anytimeshift-betatestingform.netlify.app/feedback';

exports.handler = async () => {
  console.log('=== Feedback Email Function Started ===');
  console.log('Time:', new Date().toISOString());
  
  // Check EMAIL_PASS
  if (!process.env.EMAIL_PASS) {
    console.error('ERROR: EMAIL_PASS not set');
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'EMAIL_PASS not configured' })
    };
  }

  try {
    // Fetch pending testers
    console.log('Fetching pending testers...');
    const res = await axios.get(GAS_ENDPOINT, { 
      params: { action: 'getPendingFeedbackEmails' },
      timeout: 10000 
    });
    
    const testers = res.data && Array.isArray(res.data.testers) ? res.data.testers : [];
    console.log(`Found ${testers.length} pending tester(s)`);

    if (!testers.length) {
      return { statusCode: 200, body: 'No pending feedback emails' };
    }

    // Create and verify transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { 
        user: 'info@anytimeshift.com', 
        pass: process.env.EMAIL_PASS 
      }
    });

    try {
      await transporter.verify();
      console.log('Email transporter verified');
    } catch (verifyError) {
      console.error('Email verification failed:', verifyError.message);
      return { 
        statusCode: 500, 
        body: JSON.stringify({ 
          error: 'Email authentication failed', 
          details: verifyError.message 
        })
      };
    }

    // Process each tester
    let successCount = 0;
    let failCount = 0;
    const errors = [];

    for (const tester of testers) {
      const { email, token } = tester;
      const feedbackLink = `${FEEDBACK_FORM_URL_BASE}?token=${encodeURIComponent(token)}`;

      console.log(`\nProcessing: ${email}`);

      try {
        // Send email
        const emailResult = await transporter.sendMail({
          from: '"Anytime Shift" <info@anytimeshift.com>',
          to: email,
          subject: "We'd love your feedback on Anytime Shift",
          text: `Hi,\n\nThanks again for installing the Anytime Shift beta app.\nWe'd really appreciate your feedback: ${feedbackLink}\n\nAnytime Shift Team`,
          html: `
            <p>Hi,</p>
            <p>Thanks again for installing the Anytime Shift beta app.</p>
            <p>We'd really appreciate your feedback:</p>
            <p><a href="${feedbackLink}" style="display:inline-block;background-color:#001f3f;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">Share Your Feedback</a></p>
            <p>Or copy this link: ${feedbackLink}</p>
            <p>Thank you,<br>Anytime Shift Team</p>
          `
        });
        
        console.log(`✓ Email sent to ${email} (Message ID: ${emailResult.messageId})`);

        // ONLY mark as sent if email actually went out
        try {
          await axios.post(GAS_ENDPOINT, { 
            action: 'markFeedbackEmailSent', 
            token 
          }, { timeout: 5000 });
          console.log(`✓ Marked as sent in sheet for ${email}`);
          successCount++;
        } catch (markError) {
          console.error(`WARNING: Email sent but failed to mark in sheet for ${email}:`, markError.message);
          // Email was sent successfully, so still count as success
          // The tester will get the email, even if tracking failed
          successCount++;
          errors.push({ email, stage: 'marking', error: markError.message });
        }

      } catch (sendError) {
        console.error(`✗ Failed to send email to ${email}:`, sendError.message);
        failCount++;
        errors.push({ email, stage: 'sending', error: sendError.message });
        // Don't mark as sent if email failed - let it retry next time
      }
    }

    const summary = {
      totalProcessed: testers.length,
      successCount,
      failCount,
      errors: errors.length > 0 ? errors : undefined
    };

    console.log('\n=== Summary ===');
    console.log(JSON.stringify(summary, null, 2));
    
    return { 
      statusCode: 200, 
      body: JSON.stringify(summary)
    };
    
  } catch (err) {
    console.error('FATAL ERROR:', err.message);
    console.error('Stack:', err.stack);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: 'Internal error', 
        details: err.message 
      })
    };
  }
};