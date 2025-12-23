/**
 * Script to REDESIGN ALL email templates with modern UI and prominent logo
 * Run with: node scripts/update_all_templates_modern.js
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
const PRIMARY_COLOR = '#D4AF37'; // Gold
const SECONDARY_COLOR = '#081428'; // Dark Blue
const ACCENT_COLOR = '#E6C200'; // Bright Gold
const HEADER_BG_COLOR = '#2c3e50'; // Modern Slate Blue
const HEADER_GRADIENT = 'linear-gradient(135deg, #34495e 0%, #2c3e50 50%, #1a252f 100%)'; // Elegant gradient
const COMPANY_EMAIL = 'support@solitairemarkets.me';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://solitairemarkets.me';

// Common email template structure helper
const getEmailTemplate = (title, subtitle, content, variables = []) => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title} - ${BRAND_NAME}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Logo -->
          <tr>
            <td style="background: ${HEADER_GRADIENT}; padding: 40px 30px; text-align: center;">
              <img src="{{logoUrl}}" alt="${BRAND_NAME}" style="height: 60px; max-width: 250px; display: block; margin: 0 auto 20px auto;" />
              <div style="font-size: 28px; font-weight: 700; color: ${PRIMARY_COLOR}; margin: 0; line-height: 1.2;">
                ${BRAND_NAME}
              </div>
              ${subtitle ? `<div style="font-size: 16px; color: rgba(255, 255, 255, 0.9); margin-top: 8px;">${subtitle}</div>` : ''}
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 13px; color: #6b7280; margin: 0; line-height: 1.5;">
                © {{currentYear}} ${BRAND_NAME}. All rights reserved.<br>
                <a href="mailto:${COMPANY_EMAIL}" style="color: ${PRIMARY_COLOR}; text-decoration: none;">${COMPANY_EMAIL}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const templates = [
    {
        name: 'Welcome Email',
        description: 'Welcome email sent to new users after signup',
        html_code: getEmailTemplate(
            'Welcome',
            'Welcome Aboard!',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🎉</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We're thrilled to have you join our trading community. Your account has been created successfully and you're all set to start your trading journey with us!
              </p>
              
              <!-- Steps Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 30px; border-left: 4px solid ${PRIMARY_COLOR};">
                <tr>
                  <td>
                    <div style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 20px;">
                      Get Started in 3 Easy Steps:
                    </div>
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 12px 0; vertical-align: top;">
                          <div style="display: inline-block; background: ${PRIMARY_COLOR}; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 16px; margin-right: 16px; vertical-align: middle;">
                            1
                          </div>
                          <span style="font-size: 15px; color: #374151; line-height: 1.6; vertical-align: middle;">
                            Complete your KYC verification to unlock all features
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; vertical-align: top;">
                          <div style="display: inline-block; background: ${PRIMARY_COLOR}; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 16px; margin-right: 16px; vertical-align: middle;">
                            2
                          </div>
                          <span style="font-size: 15px; color: #374151; line-height: 1.6; vertical-align: middle;">
                            Fund your account with your preferred payment method
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; vertical-align: top;">
                          <div style="display: inline-block; background: ${PRIMARY_COLOR}; color: #ffffff; width: 32px; height: 32px; border-radius: 50%; text-align: center; line-height: 32px; font-weight: 700; font-size: 16px; margin-right: 16px; vertical-align: middle;">
                            3
                          </div>
                          <span style="font-size: 15px; color: #374151; line-height: 1.6; vertical-align: middle;">
                            Start trading on our powerful MT5 platform
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'currentYear'],
        is_default: false,
    },
    {
        name: 'MT5 Account Created',
        description: 'Email sent when a new MT5 account is created',
        html_code: getEmailTemplate(
            'MT5 Account Created',
            'MT5 Account Created',
            `
              <h1 style="font-size: 22px; font-weight: 600; color: #1f2937; margin: 0 0 12px 0;">
                Hi {{recipientName}},
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #6b7280; margin: 0 0 25px 0;">
                Your new MT5 trading account has been created successfully. Keep these credentials safe.
              </p>
              
              <!-- Credentials Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Account Type
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{accountType}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Login
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${SECONDARY_COLOR}; font-size: 16px; font-family: 'Courier New', monospace;">
                      {{login}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Password
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${SECONDARY_COLOR}; font-size: 16px; font-family: 'Courier New', monospace;">
                      {{password}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Warning Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-left: 4px solid ${ACCENT_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #92400e; line-height: 1.5;">
                      <strong>⚠️ Important:</strong> Please save these credentials securely. We recommend storing them in a password manager.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Open Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountType', 'login', 'password', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountType', 'login', 'password', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Deposit Request Created',
        description: 'Email sent when a deposit request is created',
        html_code: getEmailTemplate(
            'Deposit Request',
            'Deposit Request Created',
            `
              <h1 style="font-size: 22px; font-weight: 600; color: #1f2937; margin: 0 0 12px 0;">
                Hi {{recipientName}},
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #6b7280; margin: 0 0 25px 0;">
                We have received your deposit request. Here are the details:
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Account
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{accountLogin}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Amount
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                      {{amount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Date
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{date}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Withdrawal Request Created',
        description: 'Email sent when a withdrawal request is created',
        html_code: getEmailTemplate(
            'Withdrawal Request',
            'Withdrawal Request Created',
            `
              <h1 style="font-size: 22px; font-weight: 600; color: #1f2937; margin: 0 0 12px 0;">
                Hi {{recipientName}},
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #6b7280; margin: 0 0 25px 0;">
                We have received your withdrawal request. Here are the details:
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Account
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{accountLogin}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Amount
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                      {{amount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Date
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{date}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Info Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid ${PRIMARY_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
                      <strong>ℹ️ Processing:</strong> Your withdrawal request is being reviewed. You will receive a confirmation email once it's processed.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Transaction Completed',
        description: 'Email sent when a deposit or withdrawal transaction is completed',
        html_code: getEmailTemplate(
            'Transaction Completed',
            '{{transactionType}} Completed',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 22px; font-weight: 600; color: #1f2937; margin: 0 0 12px 0;">
                Hi {{recipientName}},
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #6b7280; margin: 0 0 25px 0;">
                Your {{transactionType}} has been completed successfully. Here are the details:
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Account
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{accountLogin}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Amount
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                      {{amount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Date
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{date}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Success Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #d1fae5; border-left: 4px solid #10b981; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #065f46; line-height: 1.5;">
                      <strong>✓ Success:</strong> Your transaction has been processed and completed successfully.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'transactionType', 'accountLogin', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'transactionType', 'accountLogin', 'amount', 'date', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Internal Transfer Completed',
        description: 'Email sent when an internal transfer is completed',
        html_code: getEmailTemplate(
            'Internal Transfer',
            'Internal Transfer Completed',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">💸</div>
              </div>
              
              <h1 style="font-size: 22px; font-weight: 600; color: #1f2937; margin: 0 0 12px 0;">
                Hi {{recipientName}},
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #6b7280; margin: 0 0 25px 0;">
                Your internal transfer has been completed successfully. Here are the details:
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      From Account
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{fromAccount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      To Account
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{toAccount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Amount
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                      {{amount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Date
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{date}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'fromAccount', 'toAccount', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'fromAccount', 'toAccount', 'amount', 'date', 'currentYear'],
        is_default: false,
    },
    {
        name: 'OTP Verification',
        description: 'Email sent for OTP verification (password change, email verification, withdrawal, etc.)',
        html_code: getEmailTemplate(
            'OTP Verification',
            'Verification Code',
            `
              <h1 style="font-size: 22px; font-weight: 600; color: #1f2937; margin: 0 0 12px 0;">
                Hi {{recipientName}},
              </h1>
              <p style="font-size: 15px; line-height: 1.6; color: #6b7280; margin: 0 0 30px 0;">
                {{verificationMessage}}
              </p>
              
              <!-- OTP Code Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background: linear-gradient(135deg, ${PRIMARY_COLOR}15 0%, ${ACCENT_COLOR}15 100%); border: 2px solid ${PRIMARY_COLOR}; border-radius: 12px; margin-bottom: 30px;">
                <tr>
                  <td align="center" style="padding: 30px 20px;">
                    <div style="font-size: 36px; font-weight: 700; color: ${SECONDARY_COLOR}; letter-spacing: 8px; font-family: 'Courier New', monospace; margin-bottom: 12px;">
                      {{otp}}
                    </div>
                    <div style="font-size: 13px; color: #6b7280;">
                      This code will expire in 10 minutes
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Warning Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-left: 4px solid ${ACCENT_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #92400e; line-height: 1.5;">
                      <strong>⚠️ Security Notice:</strong> If you didn't request this code, please ignore this email or contact our support team immediately.
                    </div>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'otp', 'verificationMessage', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'otp', 'verificationMessage', 'currentYear'],
        is_default: false,
    },
    {
        name: 'Password Changed',
        description: 'Email sent when a user changes their password',
        html_code: getEmailTemplate(
            'Password Changed',
            'Password Changed Successfully',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🔒</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; text-align: center;">
                Password Changed Successfully
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 20px 0; text-align: center;">
                Hi {{recipientName}},
              </p>
              
              <p style="font-size: 15px; line-height: 1.6; color: #6b7280; margin: 0 0 30px 0;">
                This is to confirm that your account password has been changed successfully. If you did not make this change, please contact our support team immediately.
              </p>
              
              <!-- Security Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-left: 4px solid ${ACCENT_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #92400e; line-height: 1.5;">
                      <strong>🔐 Security Tip:</strong> For your account security, we recommend using a strong, unique password and enabling two-factor authentication if available.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Go to Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'currentYear'],
        is_default: false,
    },
];

async function updateAllTemplates() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('🎨 Redesigning ALL email templates with modern UI and prominent logo...\n');

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
                console.log(`✅ Redesigned: "${template.name}" (ID: ${updateRes.rows[0].id})`);
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
                console.log(`✅ Added: "${template.name}" (ID: ${insertRes.rows[0].id})`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✨ All templates redesigned successfully!');
        console.log('📧 Logo is now prominently displayed (60px height) in ALL templates using {{logoUrl}} variable');
        console.log('🎨 All templates now have consistent modern UI design');

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
updateAllTemplates()
    .then(() => {
        console.log('✅ Script completed successfully');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Script failed:', error);
        process.exit(1);
    });

