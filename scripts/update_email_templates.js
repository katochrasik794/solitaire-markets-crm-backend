/**
 * Script to UPDATE email templates in the database
 * Run with: node scripts/update_email_templates.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Solitaire Markets Branding
const BRAND_NAME = 'Solitaire Markets';
const LOGO_URL = 'https://solitairemarkets.me/assets/images/logo.png';
const PRIMARY_COLOR = '#D4AF37'; // Gold
const SECONDARY_COLOR = '#000000'; // Black
const COMPANY_EMAIL = 'support@solitairemarkets.me';

const templates = [
    {
        name: 'Welcome Email',
        description: 'Welcome email sent to new users after signup',
        html_code: `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    @media only screen and (max-width: 600px) {
      .main-table { width: 100% !important; }
      .content-padding { padding: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:24px;background:#f9fafb;font-family:Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1)">
    <tr>
      <td style="background:linear-gradient(135deg,${SECONDARY_COLOR},#333333);padding:32px 24px;border-radius:16px 16px 0 0">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center">
              <img src="{{logoUrl}}" alt="${BRAND_NAME}" style="height:40px;margin-bottom:12px" />
              <div style="font-size:24px;color:${PRIMARY_COLOR};font-weight:700;margin-bottom:4px">${BRAND_NAME}</div>
              <div style="font-size:14px;color:rgba(255,255,255,0.9)">Welcome Aboard!</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:32px 24px 16px;text-align:center">
        <div style="font-size:64px">🎉</div>
      </td>
    </tr>
    <tr>
      <td class="content-padding" style="padding:0 24px 16px">
        <div style="font-size:20px;font-weight:600;color:#1f2937;margin-bottom:8px">Hi {{recipientName}}!</div>
        <p style="margin:0;font-size:16px;color:#4b5563;line-height:1.6">
          We're thrilled to have you join our trading community. Your account has been created successfully and you're all set to start your trading journey with us!
        </p>
      </td>
    </tr>
    <tr>
      <td class="content-padding" style="padding:16px 24px">
        <div style="background:#f8f9fa;border-radius:12px;padding:20px;border-left:4px solid ${PRIMARY_COLOR}">
          <div style="font-size:16px;font-weight:600;color:#1f2937;margin-bottom:12px">Get Started in 3 Easy Steps:</div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;vertical-align:top">
                <div style="display:inline-block;background:${PRIMARY_COLOR};color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:700;font-size:14px;margin-right:12px">1</div>
                <span style="font-size:14px;color:#374151;line-height:1.6">Complete your KYC verification to unlock all features</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;vertical-align:top">
                <div style="display:inline-block;background:${PRIMARY_COLOR};color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:700;font-size:14px;margin-right:12px">2</div>
                <span style="font-size:14px;color:#374151;line-height:1.6">Fund your account with your preferred payment method</span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;vertical-align:top">
                <div style="display:inline-block;background:${PRIMARY_COLOR};color:#fff;width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:700;font-size:14px;margin-right:12px">3</div>
                <span style="font-size:14px;color:#374151;line-height:1.6">Start trading on our powerful MT5 platform</span>
              </td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
    <tr>
      <td class="content-padding" style="padding:16px 24px 32px;text-align:center">
        <a href="{{companyEmail}}" style="display:inline-block;background:linear-gradient(135deg,${PRIMARY_COLOR},#b8860b);color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:10px;font-size:16px;box-shadow:0 4px 6px rgba(0,0,0,0.1)">Go to Dashboard</a>
      </td>
    </tr>
    <tr>
      <td style="background:#fafafa;padding:20px 24px;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;border-radius:0 0 16px 16px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center">
              <p style="margin:0 0 8px 0">© {{currentYear}} ${BRAND_NAME}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        variables: ['recipientName', 'logoUrl', 'companyEmail', 'currentYear'],
        is_default: false,
    },
    {
        name: 'MT5 Account Created',
        description: 'Email sent when a new MT5 account is created',
        html_code: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="background:linear-gradient(90deg, ${SECONDARY_COLOR}, #333333);padding:24px 24px;">
            <div style="display:flex;align-items:center;gap:10px">
              <img alt="${BRAND_NAME}" src="{{logoUrl}}" style="height:28px;border:0;outline:none;display:block" />
              <div style="font-size:20px;line-height:28px;color:${PRIMARY_COLOR};font-weight:700;">${BRAND_NAME}</div>
            </div>
            <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">MT5 Account Created</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 8px 24px;color:#1f2937;">
            <div style="font-size:16px;line-height:24px;font-weight:600;">Hi {{recipientName}},</div>
            <p style="margin:8px 0 0 0;color:#6b7280;font-size:14px;line-height:22px;">
              Your new MT5 trading account has been created successfully. Keep these credentials safe.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tbody>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Account Type</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{accountType}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Login</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{login}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Password</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{password}}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 24px 28px 24px;">
            <a href="{{companyEmail}}" style="display:inline-block;background:${PRIMARY_COLOR};background-image:linear-gradient(90deg, ${PRIMARY_COLOR}, #b8860b);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;">Open Dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:14px 24px;color:#6b7280;font-size:12px;line-height:18px;border-top:1px solid #e5e7eb;">
            © {{currentYear}} ${BRAND_NAME}. All rights reserved
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
        variables: ['recipientName', 'logoUrl', 'accountType', 'login', 'password', 'companyEmail', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Deposit Request Created',
        description: 'Email sent when a deposit request is created',
        html_code: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="background:linear-gradient(90deg, ${SECONDARY_COLOR}, #333333);padding:24px 24px;">
            <div style="display:flex;align-items:center;gap:10px">
              <img alt="${BRAND_NAME}" src="{{logoUrl}}" style="height:28px;border:0;outline:none;display:block" />
              <div style="font-size:20px;line-height:28px;color:${PRIMARY_COLOR};font-weight:700;">${BRAND_NAME}</div>
            </div>
            <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">Deposit Request Created</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 8px 24px;color:#1f2937;">
            <div style="font-size:16px;line-height:24px;font-weight:600;">Hi {{recipientName}},</div>
            <p style="margin:8px 0 0 0;color:#6b7280;font-size:14px;line-height:22px;">
              We have received your deposit request. Here are the details:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tbody>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Account</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{accountLogin}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Amount</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{amount}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Date</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{date}}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 24px 28px 24px;">
            <a href="{{companyEmail}}" style="display:inline-block;background:${PRIMARY_COLOR};background-image:linear-gradient(90deg, ${PRIMARY_COLOR}, #b8860b);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;">Open Dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:14px 24px;color:#6b7280;font-size:12px;line-height:18px;border-top:1px solid #e5e7eb;">
            © {{currentYear}} ${BRAND_NAME}. All rights reserved
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'companyEmail', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Withdrawal Request Created',
        description: 'Email sent when a withdrawal request is created',
        html_code: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="background:linear-gradient(90deg, ${SECONDARY_COLOR}, #333333);padding:24px 24px;">
            <div style="display:flex;align-items:center;gap:10px">
              <img alt="${BRAND_NAME}" src="{{logoUrl}}" style="height:28px;border:0;outline:none;display:block" />
              <div style="font-size:20px;line-height:28px;color:${PRIMARY_COLOR};font-weight:700;">${BRAND_NAME}</div>
            </div>
            <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">Withdrawal Request Created</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 8px 24px;color:#1f2937;">
            <div style="font-size:16px;line-height:24px;font-weight:600;">Hi {{recipientName}},</div>
            <p style="margin:8px 0 0 0;color:#6b7280;font-size:14px;line-height:22px;">
              We have received your withdrawal request. Here are the details:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tbody>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Account</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{accountLogin}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Amount</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{amount}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Date</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{date}}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 24px 28px 24px;">
            <a href="{{companyEmail}}" style="display:inline-block;background:${PRIMARY_COLOR};background-image:linear-gradient(90deg, ${PRIMARY_COLOR}, #b8860b);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;">Open Dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:14px 24px;color:#6b7280;font-size:12px;line-height:18px;border-top:1px solid #e5e7eb;">
            © {{currentYear}} ${BRAND_NAME}. All rights reserved
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'companyEmail', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Transaction Completed',
        description: 'Email sent when a deposit or withdrawal transaction is completed',
        html_code: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="background:linear-gradient(90deg, ${SECONDARY_COLOR}, #333333);padding:24px 24px;">
            <div style="display:flex;align-items:center;gap:10px">
              <img alt="${BRAND_NAME}" src="{{logoUrl}}" style="height:28px;border:0;outline:none;display:block" />
              <div style="font-size:20px;line-height:28px;color:${PRIMARY_COLOR};font-weight:700;">${BRAND_NAME}</div>
            </div>
            <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">{{transactionType}} Completed</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 8px 24px;color:#1f2937;">
            <div style="font-size:16px;line-height:24px;font-weight:600;">Hi {{recipientName}},</div>
            <p style="margin:8px 0 0 0;color:#6b7280;font-size:14px;line-height:22px;">
              Your {{transactionType}} has been completed successfully. Here are the details:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tbody>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Account</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{accountLogin}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Amount</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{amount}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Date</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{date}}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 24px 28px 24px;">
            <a href="{{companyEmail}}" style="display:inline-block;background:${PRIMARY_COLOR};background-image:linear-gradient(90deg, ${PRIMARY_COLOR}, #b8860b);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;">Open Dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:14px 24px;color:#6b7280;font-size:12px;line-height:18px;border-top:1px solid #e5e7eb;">
            © {{currentYear}} ${BRAND_NAME}. All rights reserved
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
        variables: ['recipientName', 'logoUrl', 'transactionType', 'accountLogin', 'amount', 'date', 'companyEmail', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Internal Transfer Completed',
        description: 'Email sent when an internal transfer is completed',
        html_code: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f9fafb;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 12px;">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.06);font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="background:linear-gradient(90deg, ${SECONDARY_COLOR}, #333333);padding:24px 24px;">
            <div style="display:flex;align-items:center;gap:10px">
              <img alt="${BRAND_NAME}" src="{{logoUrl}}" style="height:28px;border:0;outline:none;display:block" />
              <div style="font-size:20px;line-height:28px;color:${PRIMARY_COLOR};font-weight:700;">${BRAND_NAME}</div>
            </div>
            <div style="font-size:13px;line-height:20px;color:rgba(255,255,255,0.85);margin-top:4px;">Internal Transfer Completed</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 24px 8px 24px;color:#1f2937;">
            <div style="font-size:16px;line-height:24px;font-weight:600;">Hi {{recipientName}},</div>
            <p style="margin:8px 0 0 0;color:#6b7280;font-size:14px;line-height:22px;">
              Your internal transfer has been completed successfully. Here are the details:
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 24px 24px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
              <tbody>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">From Account</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{fromAccount}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">To Account</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{toAccount}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Amount</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{amount}}</td>
                </tr>
                <tr>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-weight:600;white-space:nowrap;color:#1f2937">Date</td>
                  <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;color:#1f2937">{{date}}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 24px 28px 24px;">
            <a href="{{companyEmail}}" style="display:inline-block;background:${PRIMARY_COLOR};background-image:linear-gradient(90deg, ${PRIMARY_COLOR}, #b8860b);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:10px;">Open Dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa;padding:14px 24px;color:#6b7280;font-size:12px;line-height:18px;border-top:1px solid #e5e7eb;">
            © {{currentYear}} ${BRAND_NAME}. All rights reserved
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
        variables: ['recipientName', 'logoUrl', 'fromAccount', 'toAccount', 'amount', 'date', 'companyEmail', 'currentYear'],
        is_default: false,
    },
    {
        name: 'OTP Verification',
        description: 'Email sent for OTP verification (password change, email verification, withdrawal, etc.)',
        html_code: `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="color-scheme" content="light dark"/>
  <style>
    body{margin:0;padding:24px;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;color:#1f2937}
    .card{max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden}
    .header{background:linear-gradient(90deg,${SECONDARY_COLOR},#333333);padding:16px 20px;display:flex;align-items:center;gap:10px}
    .title{margin:0;font-size:20px;color:${PRIMARY_COLOR}}
    .muted{color:#6b7280}
    .code{letter-spacing:6px;font-weight:700;font-size:28px;text-align:center;color:#111827;margin:18px 0 8px}
    .panel{margin-top:22px;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;color:#6b7280;font-size:12px}
    .foot{margin-top:24px;font-size:12px;color:#6b7280}
  </style>
</head>
<body>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card">
    <tr>
      <td class="header">
        <img src="{{logoUrl}}" alt="${BRAND_NAME}" style="height:28px;border:0;outline:none;display:block" />
        <h1 class="title">${BRAND_NAME}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:24px">
        <p class="muted" style="margin:0 0 12px 0;font-size:14px">{{recipientName ? \`Hi \${recipientName},\` : 'Hi,'}}</p>
        <p class="muted" style="margin:0 0 16px 0;font-size:14px">{{verificationMessage}}</p>
        <div class="code">{{otp}}</div>
        <p class="muted" style="margin:0 0 6px 0;font-size:12px;text-align:center">This code will expire in 10 minutes.</p>
        <div class="panel">If you didn't request this email, you can safely ignore it.</div>
        <p class="foot">— Team ${BRAND_NAME}</p>
      </td>
    </tr>
  </table>
</body>
</html>`,
        variables: ['recipientName', 'logoUrl', 'otp', 'verificationMessage'],
        is_default: false,
    },
    {
        name: 'Password Changed',
        description: 'Email sent when a user changes their password',
        html_code: `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    body{margin:0;padding:24px;background:#f6f6f6;font-family:Arial,sans-serif}
    .container{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.05)}
    .header{text-align:center;padding:40px 0 0 0}
    .content{padding:40px 24px;text-align:center}
    .footer{padding:40px 24px;text-align:center;background:#fafafa;border-radius:0 0 12px 12px}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="{{logoUrl}}" alt="${BRAND_NAME}" width="80" height="80" style="display:block;margin:0 auto;border-radius:50%" />
      <h1 style="font-size:28px;font-weight:bold;color:${SECONDARY_COLOR};margin:24px 0 0 0">
        Trade with <span style="color:${PRIMARY_COLOR}">${BRAND_NAME}</span>
      </h1>
      <p style="font-size:14px;color:#888;margin:12px 0 0 0">Premium Forex Trading</p>
      <h2 style="font-size:24px;font-weight:bold;color:${SECONDARY_COLOR};margin:40px 0 0 0">Congratulations</h2>
      <h3 style="font-size:20px;font-weight:600;color:${PRIMARY_COLOR};margin:24px 0 0 0">Your Password Has Been Changed</h3>
      <p style="font-size:14px;color:${SECONDARY_COLOR};font-weight:600;margin:24px 0 0 0">This is to confirm that your account password has been changed successfully.</p>
      <p style="font-size:16px;color:${SECONDARY_COLOR};font-weight:600;margin:24px 0 0 0">If you did not make this change, please contact our support team immediately.</p>
      <p style="font-size:14px;color:#888;font-weight:400;margin:16px 0 0 0">${BRAND_NAME} Team</p>
    </div>
    <div class="footer">
      <p style="font-size:16px;font-weight:bold;color:${PRIMARY_COLOR};margin:0 0 24px 0">Discover all the exclusive features and benefits waiting for you inside</p>
      <a href="{{companyEmail}}" style="display:inline-block;margin:24px 0;padding:14px 32px;background:linear-gradient(180deg, ${PRIMARY_COLOR} 0%, #b8860b 100%);color:#fff;font-weight:bold;border-radius:999px;text-decoration:none;box-shadow:0px 4px 20px rgba(212, 175, 55, 0.5)">Get Started</a>
    </div>
  </div>
</body>
</html>`,
        variables: ['recipientName', 'logoUrl', 'companyEmail'],
        is_default: false,
    },
];

async function updateTemplates() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('🔄 Updating email templates in database...\n');

        for (const template of templates) {
            // Check if template exists
            const checkRes = await client.query(
                'SELECT id FROM "email_templates" WHERE "name" = $1',
                [template.name]
            );

            if (checkRes.rows.length > 0) {
                // Update existing
                const updateRes = await client.query(
                    `UPDATE "email_templates" 
                     SET "description" = $2, 
                         "html_code" = $3, 
                         "variables" = $4::jsonb, 
                         "updated_at" = CURRENT_TIMESTAMP
                     WHERE "name" = $1
                     RETURNING id, name`,
                    [
                        template.name,
                        template.description,
                        template.html_code,
                        JSON.stringify(template.variables),
                    ]
                );
                console.log(`✅ Updated template: "${template.name}" (ID: ${updateRes.rows[0].id})`);
            } else {
                // Insert new
                const insertRes = await client.query(
                    `INSERT INTO "email_templates" 
                     ("name", "description", "html_code", "variables", "is_default", "created_at", "updated_at")
                     VALUES ($1, $2, $3, $4::jsonb, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     RETURNING id, name`,
                    [
                        template.name,
                        template.description,
                        template.html_code,
                        JSON.stringify(template.variables),
                        template.is_default,
                    ]
                );
                console.log(`✅ Added template: "${template.name}" (ID: ${insertRes.rows[0].id})`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✨ All templates updated successfully!');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error updating templates:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

// Run the script
updateTemplates()
    .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });
