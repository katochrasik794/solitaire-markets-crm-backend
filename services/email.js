import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Validate required email environment variables
const requiredEmailVars = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
const missingVars = requiredEmailVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('[EMAIL CONFIG] Missing required environment variables:', missingVars.join(', '));
  console.error('[EMAIL CONFIG] Email functionality will not work until these are set.');
}

// Function to create transporter with current env vars
const createTransporter = () => {
  const emailHost = process.env.EMAIL_HOST;
  const emailPort = parseInt(process.env.EMAIL_PORT || '587');
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  
  // Validate required variables
  if (!emailHost || !emailUser || !emailPass) {
    throw new Error(`Missing email configuration: EMAIL_HOST=${!!emailHost}, EMAIL_USER=${!!emailUser}, EMAIL_PASS=${!!emailPass}`);
  }
  
  // Trim whitespace from API key (common issue)
  const cleanApiKey = emailPass.trim();
  
  // Validate SendGrid configuration
  if (emailHost.includes('sendgrid')) {
    // CRITICAL: SendGrid requires EMAIL_USER to be "apikey", not the API key name
    if (emailUser !== 'apikey') {
      const errorMsg = `[EMAIL CONFIG] ❌ CRITICAL ERROR: For SendGrid, EMAIL_USER must be "apikey", but it's currently set to "${emailUser}". This will cause authentication failures. Please update your environment variable EMAIL_USER to "apikey".`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    if (!cleanApiKey.startsWith('SG.')) {
      console.warn('[EMAIL CONFIG] ⚠️  WARNING: SendGrid API key should start with "SG." but yours starts with:', cleanApiKey.substring(0, 3));
      console.warn('[EMAIL CONFIG] Make sure you copied the full API key from SendGrid dashboard.');
    }
    if (cleanApiKey.length < 50) {
      console.warn('[EMAIL CONFIG] ⚠️  WARNING: SendGrid API key seems too short. Full keys are usually 69+ characters.');
    }
  }
  
  console.log('[EMAIL CONFIG] Creating transporter:', {
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465,
    user: emailUser,
    passLength: cleanApiKey.length,
    passStartsWith: cleanApiKey.substring(0, 3) + '...',
    passEndsWith: '...' + cleanApiKey.substring(cleanApiKey.length - 3),
    from: process.env.EMAIL_FROM || 'no_reply@solitairemarkets.me'
  });
  
  return nodemailer.createTransport({
    host: emailHost,
    port: emailPort,
    secure: emailPort === 465, // true for 465, false for other ports
    auth: {
      user: emailUser.trim(),
      pass: cleanApiKey,
    },
    // Add connection timeout
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
    // Add debug option in development
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  });
};

// Create transporter on module load
let transporter = null;
try {
  transporter = createTransporter();
  console.log('[EMAIL CONFIG] ✅ Transporter initialized successfully');
  
  // Warn if EMAIL_FROM doesn't match verified sender
  const verifiedSender = 'no_reply@solitairemarkets.me';
  if (process.env.EMAIL_FROM && process.env.EMAIL_FROM !== verifiedSender) {
    console.warn(`[EMAIL CONFIG] ⚠️  WARNING: EMAIL_FROM (${process.env.EMAIL_FROM}) does not match verified sender (${verifiedSender}). Emails may fail.`);
  }
} catch (error) {
  console.error('[EMAIL CONFIG] ❌ Failed to create transporter:', error.message);
  console.error('[EMAIL CONFIG] Please check your .env file and ensure EMAIL_HOST, EMAIL_USER, and EMAIL_PASS are set correctly.');
}

/**
 * Send password reset email
 * @param {string} email - Recipient email
 * @param {string} resetToken - Password reset token
 * @returns {Promise<object>} - Email send result
 */
export const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to: email,
    subject: 'Password Reset Request - Solitaire CRM',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Password Reset</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f4f4f4; padding: 20px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password for your Solitaire CRM account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #e6c200; color: #333; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666; font-size: 12px;">${resetUrl}</p>
          <p><strong>This link will expire in 1 hour.</strong></p>
          <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
      Password Reset Request
      
      Hello,
      
      We received a request to reset your password for your Solitaire CRM account.
      
      Click the following link to reset your password:
      ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
      
      This is an automated message, please do not reply to this email.
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send password reset email');
  }
};

/**
 * Verify email transporter connection
 */
export const verifyEmailConnection = async () => {
  try {
    await transporter.verify();
    console.log('Email server is ready to send messages');
    return true;
  } catch (error) {
    console.error('Email server connection failed:', error);
    return false;
  }
};


/**
 * Send operation email (Deposit, Withdrawal, Bonus)
 * @param {string} type - Type of operation (deposit, withdrawal, bonus_add, bonus_deduct)
 * @param {object} payload - Data for the email (email, account_login, amount, date, name)
 * @returns {Promise<object>} - Email send result
 */
export const sendOperationEmail = async (type, payload) => {
  try {
    const { email, account_login, amount, date, name } = payload || {};
    if (!email) return { ok: false, error: 'missing email' };

    const safeAmount = typeof amount === 'number' ? amount.toFixed(2) : String(amount || '0');
    const ts = date || new Date().toISOString();
    const subjectMap = {
      deposit: 'Deposit Approved',
      withdrawal: 'Withdrawal Approved',
      bonus_add: 'Bonus Added',
      bonus_deduct: 'Bonus Deducted',
    };
    const title = subjectMap[type] || 'Notification';
    const lineMap = {
      deposit: 'Deposit Approved',
      withdrawal: 'Withdrawal Approved',
      bonus_add: 'Bonus Added',
      bonus_deduct: 'Bonus Deducted',
    };
    const line = lineMap[type] || 'notification';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #222; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 24px;">${line}</h2>
        </div>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p style="margin: 0 0 15px 0; font-size: 16px;">Hi ${name || 'Valued Customer'},</p>
          <div style="background: white; padding: 15px; border-radius: 6px; border-left: 4px solid #667eea;">
            <p style="margin: 5px 0; font-size: 14px;"><strong>MT5:</strong> ${account_login || '-'}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Amount:</strong> ${safeAmount}</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Source:</strong> Admin</p>
            <p style="margin: 5px 0; font-size: 14px;"><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
        <p style="font-size: 14px; color: #666;">If you did not authorize this action, please contact support immediately.</p>
        <p style="font-size: 14px; margin-top: 30px;">Regards,<br/><strong>${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}</strong></p>
      </div>
    `;

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: line,
      text: `${line}\n\nHi ${name || 'Valued Customer'},\n\nMT5: ${account_login || '-'}\nAmount: ${safeAmount}\nSource: Admin\nDate: ${new Date().toLocaleString()}\n\nIf you did not authorize this action, please contact support immediately.\n\nRegards,\n${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}`,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Operation email sent:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (e) {
    console.warn('sendOperationEmail failed:', e.message);
    return { ok: false, error: e.message };
  }
};

/**
 * Send a generic email
 * @param {object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content
 * @param {string} options.text - Text content (optional)
 * @returns {Promise<object>} - Email send result
 */
export const sendEmail = async ({ to, subject, html, text, attachments }) => {
  try {
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Fallback text generation
      attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Generic email sent:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending generic email:', error);
    throw error;
  }
};

/**
 * Send OTP verification email
 * @param {string} email - Recipient email
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise<object>} - Email send result
 */
export const sendOTPEmail = async (email, otp) => {
  // Use verified sender email - must match the verified sender in email service
  // IMPORTANT: The verified sender is no_reply@solitairemarkets.me (with underscore, not hyphen)
  const verifiedSender = 'no_reply@solitairemarkets.me';
  const fromEmail = process.env.EMAIL_FROM || verifiedSender;
  const fromName = process.env.EMAIL_FROM_NAME || 'Solitaire Markets';
  
  // Validate that fromEmail matches verified sender
  if (fromEmail !== verifiedSender) {
    console.warn(`[EMAIL WARNING] From email (${fromEmail}) does not match verified sender (${verifiedSender}). Email may be rejected.`);
  }
  
  // Log configuration for debugging
  console.log('[EMAIL DEBUG] Sending OTP email:', {
    to: email,
    from: `${fromName} <${fromEmail}>`,
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER ? '***set***' : 'NOT SET'
  });

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: email,
    subject: 'Verify Your Email - Solitaire Markets',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verification</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f4f4f4; padding: 30px; border-radius: 10px;">
          <h2 style="color: #333; text-align: center; margin-bottom: 20px;">Email Verification</h2>
          <p>Hello,</p>
          <p>Thank you for registering with Solitaire Markets. Please verify your email address by entering the OTP code below:</p>
          <div style="text-align: center; margin: 30px 0;">
            <div style="background-color: #e6c200; color: #333; padding: 20px; border-radius: 8px; display: inline-block; font-size: 32px; font-weight: bold; letter-spacing: 8px; font-family: 'Courier New', monospace;">
              ${otp}
            </div>
          </div>
          <p style="text-align: center; color: #666; font-size: 14px;">This OTP will expire in 10 minutes.</p>
          <p>If you didn't create an account with us, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #666; text-align: center;">
            This is an automated message, please do not reply to this email.
          </p>
        </div>
      </body>
      </html>
    `,
    text: `
      Email Verification
      
      Hello,
      
      Thank you for registering with Solitaire Markets. Please verify your email address by entering the OTP code below:
      
      ${otp}
      
      This OTP will expire in 10 minutes.
      
      If you didn't create an account with us, please ignore this email.
      
      This is an automated message, please do not reply to this email.
    `,
  };

  try {
    // Recreate transporter if it doesn't exist (in case env vars were updated)
    if (!transporter) {
      console.log('[EMAIL DEBUG] Transporter not initialized, creating new one...');
      try {
        transporter = createTransporter();
        console.log('[EMAIL DEBUG] ✅ Transporter created successfully');
      } catch (createError) {
        console.error('[EMAIL DEBUG] ❌ Failed to create transporter:', createError.message);
        throw new Error(`Email transporter not initialized: ${createError.message}. Check EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS environment variables.`);
      }
    }
    
    // Double-check transporter is valid
    if (!transporter || typeof transporter.sendMail !== 'function') {
      console.error('[EMAIL DEBUG] ❌ Transporter is invalid, attempting to recreate...');
      try {
        transporter = createTransporter();
      } catch (recreateError) {
        throw new Error(`Email transporter is invalid and cannot be recreated: ${recreateError.message}`);
      }
    }

    // Test connection before sending (but don't fail if verify fails, just log it)
    try {
      await transporter.verify();
      console.log('[EMAIL DEBUG] ✅ SMTP connection verified successfully');
    } catch (verifyError) {
      console.error('[EMAIL DEBUG] ⚠️  SMTP verification failed, but attempting to send anyway:', {
        message: verifyError.message,
        code: verifyError.code,
        command: verifyError.command,
        response: verifyError.response,
        responseCode: verifyError.responseCode
      });
      
      // If it's an auth error, recreate transporter and try again
      if (verifyError.code === 'EAUTH' || verifyError.responseCode === 535) {
        console.log('[EMAIL DEBUG] Auth error detected, recreating transporter with fresh credentials...');
        try {
          transporter = createTransporter();
          // Try verify again
          await transporter.verify();
          console.log('[EMAIL DEBUG] ✅ SMTP connection verified after recreation');
        } catch (retryError) {
          console.error('[EMAIL DEBUG] ❌ Still failing after recreation:', retryError.message);
          throw new Error(`SMTP authentication failed: ${verifyError.message}. Please check EMAIL_USER (should be "apikey" for SendGrid) and EMAIL_PASS (your SendGrid API key).`);
        }
      } else {
        // For non-auth errors, continue anyway (some servers don't support verify)
        console.log('[EMAIL DEBUG] Non-auth error, continuing with send attempt...');
      }
    }

    // Send the email
    let info;
    try {
      info = await transporter.sendMail(mailOptions);
    } catch (sendError) {
      console.error('[EMAIL DEBUG] Error during sendMail:', {
        message: sendError.message,
        code: sendError.code,
        response: sendError.response,
        responseCode: sendError.responseCode
      });
      
      // If send fails with auth error, try recreating transporter once more
      if (sendError.code === 'EAUTH' || sendError.responseCode === 535) {
        console.log('[EMAIL DEBUG] Auth error during send, recreating transporter one more time...');
        try {
          transporter = createTransporter();
          info = await transporter.sendMail(mailOptions);
          console.log('[EMAIL DEBUG] ✅ Email sent successfully after transporter recreation');
        } catch (retrySendError) {
          throw new Error(`SMTP authentication failed: ${sendError.message}. Please check EMAIL_USER (should be "apikey" for SendGrid) and EMAIL_PASS (your SendGrid API key).`);
        }
      } else {
        throw sendError;
      }
    }
    console.log('[EMAIL DEBUG] OTP email sent successfully:', {
      messageId: info.messageId,
      response: info.response,
      accepted: info.accepted,
      rejected: info.rejected
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL DEBUG] Error sending OTP email:', {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode,
      stack: error.stack
    });
    
    // Provide more specific error messages
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      const errorMsg = error.response || error.message || '';
      if (errorMsg.includes('Invalid login') || errorMsg.includes('Authentication failed')) {
        throw new Error('Email authentication failed. Your SendGrid API key may be invalid, expired, or revoked. Please check EMAIL_PASS (should be your SendGrid API key) and EMAIL_USER (should be "apikey" for SendGrid).');
      }
      throw new Error('Email authentication failed. Please check EMAIL_USER and EMAIL_PASS. For SendGrid, EMAIL_USER should be "apikey" and EMAIL_PASS should be your API key.');
    } else if (error.code === 'ECONNECTION') {
      throw new Error('Cannot connect to email server. Please check EMAIL_HOST and EMAIL_PORT.');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Email server connection timed out. Please check your network and email server settings.');
    } else if (error.response) {
      throw new Error(`Email server rejected the request: ${error.response}`);
    } else {
      throw new Error(`Failed to send OTP email: ${error.message}`);
    }
  }
};
