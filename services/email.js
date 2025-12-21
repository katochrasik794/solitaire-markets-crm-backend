import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Solitaire Markets'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
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
    const info = await transporter.sendMail(mailOptions);
    console.log('OTP email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};
