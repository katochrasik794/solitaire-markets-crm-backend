/**
 * Script to create email templates for bonus add/deduct actions
 * Run with: node scripts/create_bonus_email_templates.js
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

// Bonus Email Template Generators
const bonusTemplateGenerators = {
    // Bonus Added
    'Bonus Added Email - on Bonus Add': () => ({
        name: 'Bonus Added',
        description: 'Email sent when a bonus is added to an MT5 account',
        html_code: getEmailTemplate(
            'Bonus Added',
            'Bonus Credit',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">🎁</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                Great news! A bonus has been credited to your MT5 trading account. The bonus amount has been successfully added and is now available in your account balance.
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #d1fae5; border-radius: 12px; overflow: hidden; margin-bottom: 30px; background-color: #f0fdf4;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Account
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{accountLogin}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Bonus Amount
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #ffffff;">
                    <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                      {{amount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Date
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #a7f3d0; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{date}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Note
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 400; color: #1f2937; font-size: 14px;">
                      {{comment}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Info Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="font-size: 14px; color: #1e40af; margin: 0; line-height: 1.6;">
                      <strong>💡 Note:</strong> The bonus has been added to your account balance and is ready to use for trading. Please check your account balance in your MT5 platform to confirm the credit.
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; background: ${PRIMARY_COLOR}; background-image: linear-gradient(90deg, ${PRIMARY_COLOR}, ${ACCENT_COLOR}); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Account
                    </a>
                  </td>
                </tr>
              </table>
            `
        )
    }),

    // Bonus Deducted
    'Bonus Deducted Email - on Bonus Deduct': () => ({
        name: 'Bonus Deducted',
        description: 'Email sent when a bonus is deducted from an MT5 account',
        html_code: getEmailTemplate(
            'Bonus Deducted',
            'Bonus Deduction',
            `
              <div style="text-align: center; margin-bottom: 30px;">
                <div style="font-size: 64px; line-height: 1;">📉</div>
              </div>
              
              <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
                Hi {{recipientName}}!
              </h1>
              
              <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
                This is to inform you that a bonus amount has been deducted from your MT5 trading account. The deduction has been processed and your account balance has been updated accordingly.
              </p>
              
              <!-- Details Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #fee2e2; border-radius: 12px; overflow: hidden; margin-bottom: 30px; background-color: #fef2f2;">
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fecaca; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Account
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fecaca; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{accountLogin}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fecaca; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Deducted Amount
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fecaca; background-color: #ffffff;">
                    <div style="font-weight: 700; color: #dc2626; font-size: 18px;">
                      {{amount}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fecaca; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Date
                    </div>
                  </td>
                  <td style="padding: 16px 20px; border-bottom: 1px solid #fecaca; background-color: #ffffff;">
                    <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                      {{date}}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 16px 20px; background-color: #f9fafb;">
                    <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                      Reason
                    </div>
                  </td>
                  <td style="padding: 16px 20px; background-color: #ffffff;">
                    <div style="font-weight: 400; color: #1f2937; font-size: 14px;">
                      {{comment}}
                    </div>
                  </td>
                </tr>
              </table>
              
              <!-- Info Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="font-size: 14px; color: #92400e; margin: 0; line-height: 1.6;">
                      <strong>ℹ️ Note:</strong> The bonus deduction has been processed. Please check your account balance in your MT5 platform to view the updated balance. If you have any questions about this deduction, please contact our support team.
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 10px 0;">
                    <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; background: ${PRIMARY_COLOR}; background-image: linear-gradient(90deg, ${PRIMARY_COLOR}, ${ACCENT_COLOR}); color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                      View Account
                    </a>
                  </td>
                </tr>
              </table>
            `
        )
    }),
};

async function createBonusTemplates() {
    try {
        console.log('🚀 Starting bonus email template creation...\n');

        for (const [actionName, templateGenerator] of Object.entries(bonusTemplateGenerators)) {
            const templateData = templateGenerator();
            
            console.log(`📧 Creating template for: ${actionName}`);
            console.log(`   Name: ${templateData.name}`);
            console.log(`   Description: ${templateData.description}`);

            // Check if action exists in unified_actions
            const actionCheck = await pool.query(
                'SELECT id, template_id FROM unified_actions WHERE action_name = $1',
                [actionName]
            );

            if (actionCheck.rows.length === 0) {
                console.log(`   ⚠️  Action "${actionName}" not found in unified_actions. Creating action first...`);
                await pool.query(
                    `INSERT INTO unified_actions (action_name, system_type) 
                     VALUES ($1, 'crm_admin')
                     ON CONFLICT (action_name) DO NOTHING`,
                    [actionName]
                );
                console.log(`   ✅ Action created`);
            }

            // Check if template already exists
            const templateCheck = await pool.query(
                'SELECT id FROM email_templates WHERE name = $1',
                [templateData.name]
            );

            if (templateCheck.rows.length > 0) {
                const templateId = templateCheck.rows[0].id;
                console.log(`   📝 Template exists (ID: ${templateId}), updating...`);
                
                await pool.query(
                    `UPDATE email_templates 
                     SET description = $1, html_code = $2, updated_at = NOW()
                     WHERE id = $3`,
                    [
                        templateData.description,
                        templateData.html_code,
                        templateId
                    ]
                );

                // Update unified_actions to link to this template
                await pool.query(
                    `UPDATE unified_actions 
                     SET template_id = $1, updated_at = NOW()
                     WHERE action_name = $2`,
                    [templateId, actionName]
                );

                console.log(`   ✅ Template updated and linked to action\n`);
            } else {
                console.log(`   ✨ Creating new template...`);
                
                const insertResult = await pool.query(
                    `INSERT INTO email_templates 
                     (name, description, html_code, variables, is_default, from_email, created_at, updated_at)
                     VALUES ($1, $2, $3, $4, false, $5, NOW(), NOW())
                     RETURNING id`,
                    [
                        templateData.name,
                        templateData.description,
                        templateData.html_code,
                        JSON.stringify(['recipientName', 'accountLogin', 'amount', 'date', 'comment']),
                        COMPANY_EMAIL
                    ]
                );

                const templateId = insertResult.rows[0].id;
                console.log(`   ✅ Template created (ID: ${templateId})`);

                // Link template to action in unified_actions
                await pool.query(
                    `UPDATE unified_actions 
                     SET template_id = $1, updated_at = NOW()
                     WHERE action_name = $2`,
                    [templateId, actionName]
                );

                console.log(`   ✅ Template linked to action\n`);
            }
        }

        console.log('✅ Bonus email templates creation completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating bonus email templates:', error);
        process.exit(1);
    }
}

createBonusTemplates();
