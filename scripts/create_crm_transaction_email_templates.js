/**
 * Script to create email templates for missing CRM transaction actions
 * Run with: node scripts/create_crm_transaction_email_templates.js
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

// CRM Transaction Email Template Generators
const crmTransactionTemplateGenerators = {
    // Deposit Rejected
    'Deposit Rejected Email - on Deposit Rejection': () => ({
        name: 'Deposit Rejected',
        description: 'Email sent when a deposit request is rejected',
        html_code: getEmailTemplate(
            'Deposit Rejected',
            'Transaction Update',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">❌</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We regret to inform you that your deposit request has been reviewed and unfortunately, we are unable to process it at this time.
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
                If you have any questions or would like to discuss this decision, please contact our support team.
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
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'rejectionReason', 'date', 'supportUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'rejectionReason', 'date', 'supportUrl', 'currentYear'],
    }),

    // Deposit Cancelled
    'Deposit Cancelled Email - on Deposit Cancellation': () => ({
        name: 'Deposit Cancelled',
        description: 'Email sent when a deposit request is cancelled',
        html_code: getEmailTemplate(
            'Deposit Cancelled',
            'Transaction Cancelled',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🚫</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Your deposit request has been cancelled. No funds have been processed or deducted from your account.
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
                      $\{\{amount\}\}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Cancelled Date
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
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-left: 4px solid ${PRIMARY_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #92400e; line-height: 1.5;">
                      <strong>ℹ️ Note:</strong> This deposit request has been cancelled. If you wish to make a new deposit, please submit a new request from your dashboard.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{dashboardUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'dashboardUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'dashboardUrl', 'currentYear'],
    }),

    // Withdrawal Rejected
    'Withdrawal Rejected Email - on Withdrawal Rejection': () => ({
        name: 'Withdrawal Rejected',
        description: 'Email sent when a withdrawal request is rejected',
        html_code: getEmailTemplate(
            'Withdrawal Rejected',
            'Transaction Update',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">❌</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                We regret to inform you that your withdrawal request has been reviewed and unfortunately, we are unable to process it at this time.
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
                The funds remain in your account balance. If you have any questions or would like to discuss this decision, please contact our support team.
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
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'rejectionReason', 'date', 'supportUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'rejectionReason', 'date', 'supportUrl', 'currentYear'],
    }),

    // Withdrawal Cancelled
    'Withdrawal Cancelled Email - on Withdrawal Cancellation': () => ({
        name: 'Withdrawal Cancelled',
        description: 'Email sent when a withdrawal request is cancelled',
        html_code: getEmailTemplate(
            'Withdrawal Cancelled',
            'Transaction Cancelled',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🚫</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Your withdrawal request has been cancelled. No funds have been processed or deducted from your account.
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
                      $\{\{amount\}\}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Cancelled Date
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
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-left: 4px solid ${PRIMARY_COLOR}; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <div style="font-size: 14px; color: #92400e; line-height: 1.5;">
                      <strong>ℹ️ Note:</strong> This withdrawal request has been cancelled. The funds remain in your account balance. If you wish to make a new withdrawal, please submit a new request from your dashboard.
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="{{dashboardUrl}}" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Dashboard
                    </a>
                  </td>
                </tr>
              </table>
            `,
            ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'dashboardUrl', 'currentYear']
        ),
        variables: ['recipientName', 'logoUrl', 'accountLogin', 'amount', 'date', 'dashboardUrl', 'currentYear'],
    }),
};

async function createCRMTemplates() {
    try {
        console.log('🔍 Creating CRM transaction email templates...\n');

        let createdCount = 0;
        let updatedCount = 0;

        for (const [actionName, generator] of Object.entries(crmTransactionTemplateGenerators)) {
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
createCRMTemplates()
    .then(() => {
        console.log('✨ Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
