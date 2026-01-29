/**
 * Script to create email templates for IB (Introducing Broker) actions
 * Run with: node scripts/create_ib_email_templates.js
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
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com';
const IB_PORTAL_URL = `${FRONTEND_URL}/ib-portal`;

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

// IB Email Template Generators
const ibTemplateGenerators = {
    // IB Request Rejected
    'IB Request Rejected Email - on IB Request Rejection': () => ({
        name: 'IB Request Rejected',
        description: 'Email sent when an IB partnership request is rejected',
        html_code: getEmailTemplate(
            'IB Request Rejected',
            'Partnership Application Update',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">❌</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We regret to inform you that your Introducing Broker (IB) partnership application has been reviewed and unfortunately, we are unable to approve it at this time.
              </p>
              
              <!-- Rejection Reason Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #fee2e2; border-radius: 12px; overflow: hidden; margin-bottom: 30px; background-color: #fef2f2;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="font-weight: 600; color: #991b1b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                      Rejection Reason
                    </div>
                    <div style="font-size: 15px; color: #7f1d1d; line-height: 1.6;">
                      {{rejectionReason}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                If you have any questions or would like to discuss this decision further, please don't hesitate to contact our support team.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{supportUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Contact Support
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'rejectionReason', 'supportUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'rejectionReason', 'supportUrl', 'currentYear'],
    }),

    // IB Locked
    'IB Locked Email - on IB Lock': () => ({
        name: 'IB Account Locked',
        description: 'Email sent when an IB account is locked/banned',
        html_code: getEmailTemplate(
            'Account Locked',
            'Account Status Update',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🔒</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We are writing to inform you that your Introducing Broker (IB) account has been temporarily locked for security and compliance reasons.
              </p>
              
              <!-- Lock Reason Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #fef3c7; border-radius: 12px; overflow: hidden; margin-bottom: 30px; background-color: #fffbeb;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="font-weight: 600; color: #92400e; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                      Account Status
                    </div>
                    <div style="font-size: 15px; color: #78350f; line-height: 1.6;">
                      Your IB account access has been restricted. During this time, you will not be able to access your IB portal or perform IB-related operations.
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                If you believe this is an error or have questions about your account status, please contact our support team immediately.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{supportUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Contact Support
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'supportUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'supportUrl', 'currentYear'],
    }),

    // IB Unlocked
    'IB Unlocked Email - on IB Unlock': () => ({
        name: 'IB Account Unlocked',
        description: 'Email sent when an IB account is unlocked',
        html_code: getEmailTemplate(
            'Account Unlocked',
            'Account Status Restored',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Great news! Your Introducing Broker (IB) account has been successfully unlocked and restored. You now have full access to your IB portal and all associated features.
              </p>
              
              <!-- Success Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #d1fae5; border-radius: 12px; overflow: hidden; margin-bottom: 30px; background-color: #f0fdf4;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="font-weight: 600; color: #065f46; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                      Account Status
                    </div>
                    <div style="font-size: 15px; color: #047857; line-height: 1.6;">
                      Your IB account is now active and fully operational. You can access your dashboard, view commissions, manage clients, and perform all IB-related activities.
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We apologize for any inconvenience caused during the temporary restriction period. If you have any questions or need assistance, please don't hesitate to contact our support team.
              </p>
              
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

    // IB Withdrawal Request
    'IB Withdrawal Request Email - on IB Withdrawal Request': () => ({
        name: 'IB Withdrawal Request',
        description: 'Email sent when an IB creates a withdrawal request',
        html_code: getEmailTemplate(
            'Withdrawal Request Received',
            'Commission Withdrawal Request',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">💳</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We have received your commission withdrawal request. Your request is currently being reviewed by our team.
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Request ID
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      #{{withdrawalId}}
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
                      $\{\{amount\}\}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Payment Method
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{paymentMethod}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Request Date
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
                      <strong>ℹ️ Processing Time:</strong> Withdrawal requests are typically processed within 1-3 business days. You will receive a notification once your request has been reviewed.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{ibPortalUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View IB Portal
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'withdrawalId', 'amount', 'paymentMethod', 'date', 'ibPortalUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'withdrawalId', 'amount', 'paymentMethod', 'date', 'ibPortalUrl', 'currentYear'],
    }),

    // IB Withdrawal Approved
    'IB Withdrawal Approved Email - on IB Withdrawal Approval': () => ({
        name: 'IB Withdrawal Approved',
        description: 'Email sent when an IB withdrawal request is approved',
        html_code: getEmailTemplate(
            'Withdrawal Approved',
            'Commission Withdrawal Approved',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">✅</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Great news! Your commission withdrawal request has been approved and is being processed. The funds will be transferred to your designated account shortly.
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #d1fae5; border-radius: 12px; overflow: hidden; margin-bottom: 30px; background-color: #f0fdf4;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Request ID
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      #{{withdrawalId}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Amount
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                      $\{\{amount\}\}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Payment Method
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{paymentMethod}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Approved Date
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
                      <strong>ℹ️ Processing Time:</strong> Funds are typically transferred within 1-3 business days depending on your payment method. You will receive a confirmation once the transfer is completed.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{ibPortalUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View IB Portal
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'withdrawalId', 'amount', 'paymentMethod', 'date', 'ibPortalUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'withdrawalId', 'amount', 'paymentMethod', 'date', 'ibPortalUrl', 'currentYear'],
    }),

    // IB Withdrawal Rejected
    'IB Withdrawal Rejected Email - on IB Withdrawal Rejection': () => ({
        name: 'IB Withdrawal Rejected',
        description: 'Email sent when an IB withdrawal request is rejected',
        html_code: getEmailTemplate(
            'Withdrawal Rejected',
            'Commission Withdrawal Update',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">❌</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We regret to inform you that your commission withdrawal request has been reviewed and unfortunately, we are unable to process it at this time.
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Request ID
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      #{{withdrawalId}}
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
                      $\{\{amount\}\}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Rejected Date
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{date}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Rejection Reason Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #fee2e2; border-radius: 12px; overflow: hidden; margin-bottom: 30px; background-color: #fef2f2;">
                <tr>
                  <td style="padding: 20px;">
                    <div style="font-weight: 600; color: #991b1b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
                      Rejection Reason
                    </div>
                    <div style="font-size: 15px; color: #7f1d1d; line-height: 1.6;">
                      {{rejectionReason}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                The funds remain in your IB account balance. If you have any questions or would like to discuss this decision, please contact our support team.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{supportUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      Contact Support
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'withdrawalId', 'amount', 'rejectionReason', 'date', 'supportUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'withdrawalId', 'amount', 'rejectionReason', 'date', 'supportUrl', 'currentYear'],
    }),
};

async function createIBTemplates() {
    try {
        console.log('🔍 Creating IB email templates...\n');

        let createdCount = 0;
        let updatedCount = 0;

        for (const [actionName, generator] of Object.entries(ibTemplateGenerators)) {
            try {
                const templateData = generator();

                // Check if template with this name already exists
                const existingTemplate = await pool.query(
                    'SELECT id FROM email_templates WHERE name = $1',
                    [templateData.name]
                );

                let templateId;

                if (existingTemplate.rows.length > 0) {
                    // Template exists, update it
                    templateId = existingTemplate.rows[0].id;
                    await pool.query(
                        `UPDATE email_templates 
                         SET description = $1, html_code = $2, variables = $3, updated_at = NOW()
                         WHERE id = $4`,
                        [
                            templateData.description,
                            templateData.html_code,
                            JSON.stringify(templateData.variables || []),
                            templateId
                        ]
                    );
                    updatedCount++;
                    console.log(`🔄 Updated template "${templateData.name}" (ID: ${templateId})`);
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

                // Find the action in unified_actions
                const actionResult = await pool.query(
                    'SELECT id FROM unified_actions WHERE action_name = $1',
                    [actionName]
                );

                if (actionResult.rows.length > 0) {
                    // Assign template to action
                    await pool.query(
                        `UPDATE unified_actions 
                         SET template_id = $1, updated_at = NOW()
                         WHERE id = $2`,
                        [templateId, actionResult.rows[0].id]
                    );
                    console.log(`   └─ Assigned to action: ${actionName}\n`);
                } else {
                    console.log(`   ⚠️  Action "${actionName}" not found in unified_actions\n`);
                }
            } catch (error) {
                console.error(`❌ Error processing template "${actionName}":`, error.message);
                console.error('');
            }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Summary:`);
        console.log(`   • Templates created: ${createdCount}`);
        console.log(`   • Templates updated: ${updatedCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the script
createIBTemplates()
    .then(() => {
        console.log('✨ Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
