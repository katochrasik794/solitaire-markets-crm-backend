/**
 * Script to create email templates for actions that don't have templates assigned
 * Run with: node scripts/create_missing_templates.js
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
const HEADER_GRADIENT = 'linear-gradient(135deg, #34495e 0%, #2c3e50 50%, #1a252f 100%)';
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
              <p style="font-size: 13px; color: #6b7280; margin: 0 0 16px 0; line-height: 1.5;">
                © {{currentYear}} ${BRAND_NAME}. All rights reserved.<br>
                <a href="mailto:${COMPANY_EMAIL}" style="color: ${PRIMARY_COLOR}; text-decoration: none;">${COMPANY_EMAIL}</a>
              </p>
              <p style="font-size: 11px; color: #9ca3af; margin: 0; line-height: 1.6; max-width: 560px; margin-left: auto; margin-right: auto;">
                <strong>Risk Warning:</strong> Trading in financial instruments involves a significant risk of loss. Past performance is not indicative of future results. Only invest capital that you can afford to lose. Before trading, please ensure you fully understand the risks involved and seek independent advice if necessary. ${BRAND_NAME} is not responsible for any losses incurred as a result of trading decisions.
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

// Template generators for different action types
const templateGenerators = {
    // Deposit Approved
    'Deposit Approved Email - on Deposit Approval': () => ({
        name: 'Deposit Approved',
        description: 'Email sent when a deposit request is approved',
        html_code: getEmailTemplate(
            'Deposit Approved',
            'Deposit Approved',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Great news! Your deposit request has been approved and processed successfully. The funds have been credited to your account.
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
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear'],
    }),

    // Transaction Completed - Deposit
    'Transaction Completed Email - Deposit': () => ({
        name: 'Transaction Completed - Deposit',
        description: 'Email sent when a deposit transaction is completed',
        html_code: getEmailTemplate(
            'Transaction Completed',
            'Deposit Completed',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Your deposit transaction has been completed successfully. The funds are now available in your trading account.
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
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Start Trading
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear'],
    }),

    // Withdrawal Approved
    'Withdrawal Approved Email - on Withdrawal Approval': () => ({
        name: 'Withdrawal Approved',
        description: 'Email sent when a withdrawal request is approved',
        html_code: getEmailTemplate(
            'Withdrawal Approved',
            'Withdrawal Approved',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Your withdrawal request has been approved and is being processed. The funds will be transferred to your designated account shortly.
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
                      <strong>ℹ️ Processing Time:</strong> Withdrawal processing typically takes 1-3 business days depending on your payment method.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear'],
    }),

    // Transaction Completed - Withdrawal
    'Transaction Completed Email - Withdrawal': () => ({
        name: 'Transaction Completed - Withdrawal',
        description: 'Email sent when a withdrawal transaction is completed',
        html_code: getEmailTemplate(
            'Transaction Completed',
            'Withdrawal Completed',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Your withdrawal transaction has been completed successfully. The funds have been transferred to your designated account.
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
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'currentYear'],
    }),

    // KYC Completion Email - on KYC Approval
    'KYC Completion Email - on KYC Approval': () => ({
        name: 'KYC Completion',
        description: 'Email sent when KYC documents are approved',
        html_code: getEmailTemplate(
            'KYC Approved',
            'Verification Complete',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Congratulations, {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Your KYC (Know Your Customer) verification has been successfully completed and approved. Your account is now fully verified, and you have access to all features and services.
              </p>
              
              <!-- Success Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #166534; line-height: 1.5;">
                      <strong>✅ Account Verified:</strong> Your identity has been verified. You can now enjoy full access to deposit, withdraw, and trade on our platform.
                    </div>
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
    }),

    // KYC Email - on KYC Submission
    'KYC Email - on KYC Submission': () => ({
        name: 'KYC Submission Confirmation',
        description: 'Email sent when KYC documents are submitted',
        html_code: getEmailTemplate(
            'KYC Submission',
            'Documents Received',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">📄</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Thank you for submitting your KYC (Know Your Customer) documents. We have received your submission and our compliance team is now reviewing your documents.
              </p>
              
              <!-- Info Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid ${PRIMARY_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
                      <strong>ℹ️ Review Process:</strong> Our compliance team typically reviews KYC submissions within 24-48 hours. You will receive an email notification once the review is complete.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'currentYear'],
    }),

    // IB Request Email
    'IB Request Email - on IB Request': () => ({
        name: 'IB Request Confirmation',
        description: 'Email sent when an IB (Introducing Broker) request is submitted',
        html_code: getEmailTemplate(
            'IB Request',
            'Request Received',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🤝</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Thank you for your interest in becoming an Introducing Broker (IB) with ${BRAND_NAME}. We have received your IB request and our team will review it shortly.
              </p>
              
              <!-- Info Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid ${PRIMARY_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
                      <strong>ℹ️ Next Steps:</strong> Our IB team will review your application and contact you within 2-3 business days. If approved, you will receive an email with your IB portal access details.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Visit Website
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'currentYear'],
    }),

    // IB Request Accepted
    'IB Request Accepted Email - on IB Request Approval': () => ({
        name: 'IB Request Accepted',
        description: 'Email sent when an IB request is approved',
        html_code: getEmailTemplate(
            'IB Request Accepted',
            'Welcome to Our IB Program',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🎉</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Congratulations, {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We're excited to inform you that your IB (Introducing Broker) request has been approved! You are now an official Introducing Broker with ${BRAND_NAME}.
              </p>
              
              <!-- Success Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #166534; line-height: 1.5;">
                      <strong>✅ Access Granted:</strong> Your IB portal access has been activated. You can now log in to track your referrals, commissions, and manage your IB account.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Credentials Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      IB Portal URL
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{ibPortalUrl}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{ibPortalUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Access IB Portal
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'ibPortalUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'ibPortalUrl', 'currentYear'],
    }),

    // Custom Email - on Admin Send Email
    'Custom Email - on Admin Send Email': () => ({
        name: 'Custom Admin Email',
        description: 'Template for custom emails sent by admins',
        html_code: getEmailTemplate(
            'Custom Message',
            'Important Update',
            `
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <div style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                {{content}}
              </div>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{actionUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      {{actionText}}
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'content', 'actionUrl', 'actionText', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'content', 'actionUrl', 'actionText', 'currentYear'],
    }),

    // Default template generator for actions without specific handlers
    default: (actionName) => ({
        name: actionName.split(' - ')[0] || actionName,
        description: `Email template for ${actionName}`,
        html_code: getEmailTemplate(
            actionName.split(' - ')[0] || actionName,
            '',
            `
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                {{content}}
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/user/dashboard" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'content', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'content', 'currentYear'],
    }),
};

async function createMissingTemplates() {
    try {
        console.log('🔍 Finding actions without templates...\n');

        // Get all actions without templates
        const actionsResult = await pool.query(`
            SELECT id, action_name, system_type
            FROM unified_actions
            WHERE template_id IS NULL
            ORDER BY system_type, action_name
        `);

        if (actionsResult.rows.length === 0) {
            console.log('✅ All actions already have templates assigned!');
            await pool.end();
            return;
        }

        console.log(`Found ${actionsResult.rows.length} action(s) without templates:\n`);
        actionsResult.rows.forEach((action, index) => {
            console.log(`${index + 1}. [${action.system_type}] ${action.action_name}`);
        });
        console.log('');

        let createdCount = 0;
        let assignedCount = 0;

        for (const action of actionsResult.rows) {
            try {
                // Get template generator for this action
                const generator = templateGenerators[action.action_name] || templateGenerators.default;
                const templateData = generator(action.action_name);

                // Check if template with this name already exists
                const existingTemplate = await pool.query(
                    'SELECT id FROM email_templates WHERE name = $1',
                    [templateData.name]
                );

                let templateId;

                if (existingTemplate.rows.length > 0) {
                    // Template exists, use it
                    templateId = existingTemplate.rows[0].id;
                    console.log(`⚠️  Template "${templateData.name}" already exists (ID: ${templateId}), using existing template`);
                } else {
                    // Create new template
                    const insertResult = await pool.query(
                        `INSERT INTO email_templates 
                         (name, description, html_code, variables, is_default, from_email, created_at, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                         RETURNING id`,
                        [
                            templateData.name,
                            templateData.description,
                            templateData.html_code,
                            JSON.stringify(templateData.variables || []),
                            false,
                            COMPANY_EMAIL
                        ]
                    );

                    templateId = insertResult.rows[0].id;
                    createdCount++;
                    console.log(`✅ Created template "${templateData.name}" (ID: ${templateId})`);
                }

                // Assign template to action
                await pool.query(
                    `UPDATE unified_actions 
                     SET template_id = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [templateId, action.id]
                );

                assignedCount++;
                console.log(`   └─ Assigned to action: ${action.action_name}\n`);
            } catch (error) {
                console.error(`❌ Error processing action "${action.action_name}":`, error.message);
                console.error('');
            }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Summary:`);
        console.log(`   • Templates created: ${createdCount}`);
        console.log(`   • Templates assigned: ${assignedCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the script
createMissingTemplates()
    .then(() => {
        console.log('✨ Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
