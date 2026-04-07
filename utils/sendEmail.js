const SibApiV3Sdk = require('sib-api-v3-sdk');

// Initialize Brevo client
const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

/**
 * sendEmail - sends an email using Brevo API
 * @param {Object} options
 * @param {string} options.to - recipient email
 * @param {string} options.subject - email subject
 * @param {string} [options.text] - plain text content
 * @param {string} [options.html] - HTML content
 */
async function sendEmail({ to, subject, text, html }) {
  try {
    await tranEmailApi.sendTransacEmail({
      sender: { email: process.env.FROM_EMAIL, name: "Tiffin Seva" },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    });

    console.log(`✅ Email sent to ${to}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err);
    return { success: false, error: err };
  }
}

module.exports = sendEmail;
