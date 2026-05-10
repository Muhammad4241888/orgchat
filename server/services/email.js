// services/email.js
const nodemailer = require('nodemailer');

// Create reusable transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify connection on startup
transporter.verify((error) => {
  if (error) {
    console.log('Email service error:', error.message);
  } else {
    console.log('Email service ready');
  }
});

// Send join request accepted email
const sendJoinAccepted = async (toEmail, username, appName = 'OrgChat') => {
  try {
    await transporter.sendMail({
      from: `"${appName}" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `✅ Your request to join ${appName} has been accepted!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        </head>
        <body style="margin:0;padding:0;background:#0f1117;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2a2d3e;">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#1b2a4a,#0d1f3c);padding:40px;text-align:center;border-bottom:3px solid #00d4ff;">
                      <h1 style="margin:0;color:#00d4ff;font-size:32px;font-weight:700;letter-spacing:2px;">
                        🏢 ${appName}
                      </h1>
                      <p style="margin:8px 0 0;color:#8892a4;font-size:14px;letter-spacing:1px;">
                        ENTERPRISE COMMUNICATION PLATFORM
                      </p>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px;">
                      
                      <!-- Success icon -->
                      <div style="text-align:center;margin-bottom:28px;">
                        <div style="display:inline-block;width:72px;height:72px;background:rgba(39,174,96,.15);border-radius:50%;border:2px solid #27ae60;line-height:72px;font-size:36px;">
                          ✅
                        </div>
                      </div>

                      <!-- Greeting -->
                      <h2 style="color:#e8eaf0;font-size:22px;font-weight:600;text-align:center;margin:0 0 12px;">
                        Welcome aboard, ${username}!
                      </h2>
                      <p style="color:#8892a4;font-size:15px;text-align:center;margin:0 0 32px;line-height:1.6;">
                        Your request to join <strong style="color:#00d4ff;">${appName}</strong> has been 
                        reviewed and <strong style="color:#27ae60;">accepted</strong> by the administrator.
                      </p>

                      <!-- Divider -->
                      <div style="border-top:1px solid #2a2d3e;margin:0 0 28px;"></div>

                      <!-- What's next -->
                      <h3 style="color:#00d4ff;font-size:14px;letter-spacing:.1em;margin:0 0 16px;font-family:'Courier New',monospace;">
                        WHAT YOU CAN DO NOW
                      </h3>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding:10px 0;border-bottom:1px solid #2a2d3e;">
                            <span style="color:#00d4ff;margin-right:12px;font-size:18px;">💬</span>
                            <span style="color:#c8cdd8;font-size:14px;">Send messages in team channels</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 0;border-bottom:1px solid #2a2d3e;">
                            <span style="color:#00d4ff;margin-right:12px;font-size:18px;">📨</span>
                            <span style="color:#c8cdd8;font-size:14px;">Send direct messages to teammates</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 0;border-bottom:1px solid #2a2d3e;">
                            <span style="color:#00d4ff;margin-right:12px;font-size:18px;">📎</span>
                            <span style="color:#c8cdd8;font-size:14px;">Share files and images</span>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:10px 0;">
                            <span style="color:#00d4ff;margin-right:12px;font-size:18px;">📋</span>
                            <span style="color:#c8cdd8;font-size:14px;">View your assigned tasks and meetings</span>
                          </td>
                        </tr>
                      </table>

                      <!-- Divider -->
                      <div style="border-top:1px solid #2a2d3e;margin:28px 0;"></div>

                      <!-- CTA Button -->
                      <div style="text-align:center;">
                        <p style="color:#8892a4;font-size:13px;margin:0 0 16px;">
                          You can now log in to your account and start using ${appName}.
                        </p>
                        <a href="${process.env.CLIENT_URL || '#'}"
                          style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#0099bb);color:#000;font-weight:700;font-size:15px;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:.5px;">
                          Open ${appName} →
                        </a>
                      </div>

                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:#12151f;padding:20px 40px;border-top:1px solid #2a2d3e;text-align:center;">
                      <p style="color:#4a5568;font-size:12px;margin:0;line-height:1.6;">
                        This is an automated message from ${appName}.<br/>
                        Please do not reply to this email.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log(`Join acceptance email sent to ${toEmail}`);
    return true;
  } catch (err) {
    console.error('Failed to send email:', err.message);
    return false;
  }
};

// Send join request rejected email
const sendJoinRejected = async (toEmail, username, appName = 'OrgChat') => {
  try {
    await transporter.sendMail({
      from: `"${appName}" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `❌ Your request to join ${appName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="margin:0;padding:0;background:#0f1117;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1d2e;border-radius:12px;overflow:hidden;border:1px solid #2a2d3e;">
                  <tr>
                    <td style="background:linear-gradient(135deg,#1b2a4a,#0d1f3c);padding:40px;text-align:center;border-bottom:3px solid #00d4ff;">
                      <h1 style="margin:0;color:#00d4ff;font-size:32px;font-weight:700;letter-spacing:2px;">
                        🏢 ${appName}
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:40px;">
                      <div style="text-align:center;margin-bottom:28px;">
                        <div style="display:inline-block;width:72px;height:72px;background:rgba(231,76,60,.12);border-radius:50%;border:2px solid #e74c3c;line-height:72px;font-size:36px;">
                          ❌
                        </div>
                      </div>
                      <h2 style="color:#e8eaf0;font-size:22px;font-weight:600;text-align:center;margin:0 0 12px;">
                        Request Not Approved
                      </h2>
                      <p style="color:#8892a4;font-size:15px;text-align:center;margin:0 0 24px;line-height:1.6;">
                        Hi <strong style="color:#c8cdd8;">${username}</strong>, unfortunately your request 
                        to join <strong style="color:#00d4ff;">${appName}</strong> was not approved at this time.
                      </p>
                      <p style="color:#8892a4;font-size:14px;text-align:center;line-height:1.6;">
                        If you believe this is a mistake, please contact your organization administrator directly.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#12151f;padding:20px 40px;border-top:1px solid #2a2d3e;text-align:center;">
                      <p style="color:#4a5568;font-size:12px;margin:0;">
                        This is an automated message from ${appName}. Please do not reply.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });
    console.log(`Rejection email sent to ${toEmail}`);
    return true;
  } catch (err) {
    console.error('Failed to send rejection email:', err.message);
    return false;
  }
};

module.exports = { sendJoinAccepted, sendJoinRejected };