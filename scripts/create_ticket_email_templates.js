/**
 * Script to create/update ticket email templates in database
 * Run with: node scripts/create_ticket_email_templates.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Solitaire Markets Branding (matching other templates)
const BRAND_NAME = 'Solitaire Markets';
const PRIMARY_COLOR = '#D4AF37'; // Gold
const SECONDARY_COLOR = '#081428'; // Dark Blue
const ACCENT_COLOR = '#E6C200'; // Bright Gold
const HEADER_GRADIENT = 'linear-gradient(135deg, #34495e 0%, #2c3e50 50%, #1a252f 100%)';
const COMPANY_EMAIL = 'support@solitairemarkets.me';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://solitairemarkets.me';

// Common email template structure helper (same as other templates)
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

const templates = [
  {
    name: 'Ticket Created',
    description: 'Email sent to user when they create a support ticket',
    html_code: getEmailTemplate(
      'Support Ticket Created',
      'Ticket Created',
      `
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="font-size: 64px; line-height: 1;">🎫</div>
        </div>
        
        <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
          Hi {{recipientName}}!
        </h1>
        
        <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
          Thank you for contacting ${BRAND_NAME} support. We have received your ticket and our team will respond as soon as possible.
        </p>
        
        <!-- Ticket Details Box -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Ticket Number
              </div>
            </td>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
              <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                #{{ticketId}}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Subject
              </div>
            </td>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
              <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                {{ticketSubject}}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Category
              </div>
            </td>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
              <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                {{ticketCategory}}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Priority
              </div>
            </td>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
              <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                {{ticketPriority}}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Status
              </div>
            </td>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
              <div style="font-weight: 600; color: #22c55e; font-size: 15px;">
                Open
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
                {{ticketDate}}
              </div>
            </td>
          </tr>
        </table>
        
        <!-- Info Box -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #eff6ff; border-left: 4px solid ${PRIMARY_COLOR}; border-radius: 8px; margin-bottom: 30px;">
          <tr>
            <td style="padding: 16px 20px;">
              <div style="font-size: 14px; color: #1e40af; line-height: 1.5;">
                <strong>ℹ️ Next Steps:</strong> Our support team will review your ticket and respond within 24-48 hours. You will receive an email notification when we reply.
              </div>
            </td>
          </tr>
        </table>
        
        <!-- CTA Button -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td align="center" style="padding: 10px 0;">
              <a href="{{dashboardUrl}}/support" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                View Ticket
              </a>
            </td>
          </tr>
        </table>
      `,
      ['recipientName', 'logoUrl', 'ticketId', 'ticketSubject', 'ticketCategory', 'ticketPriority', 'ticketDate', 'dashboardUrl', 'currentYear']
    ),
    variables: ['recipientName', 'logoUrl', 'ticketId', 'ticketSubject', 'ticketCategory', 'ticketPriority', 'ticketDate', 'dashboardUrl', 'currentYear'],
    email_type: 'ticket_created',
    category: 'support'
  },
  {
    name: 'Ticket Response',
    description: 'Email sent to user when admin replies to their support ticket',
    html_code: getEmailTemplate(
      'Support Ticket Response',
      'New Response',
      `
        <div style="text-align: center; margin-bottom: 30px;">
          <div style="font-size: 64px; line-height: 1;">💬</div>
        </div>
        
        <h1 style="font-size: 26px; font-weight: 700; color: #1f2937; margin: 0 0 16px 0; line-height: 1.3;">
          Hi {{recipientName}}!
        </h1>
        
        <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin: 0 0 30px 0;">
          You have received a response on your support ticket from our team.
        </p>
        
        <!-- Ticket Details Box -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border: 2px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 30px;">
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Ticket Number
              </div>
            </td>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
              <div style="font-weight: 700; color: ${PRIMARY_COLOR}; font-size: 18px;">
                #{{ticketId}}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Subject
              </div>
            </td>
            <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background-color: #ffffff;">
              <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                {{ticketSubject}}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 20px; background-color: #f9fafb;">
              <div style="font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">
                Status
              </div>
            </td>
            <td style="padding: 16px 20px; background-color: #ffffff;">
              <div style="font-weight: 600; color: #1f2937; font-size: 15px;">
                {{ticketStatus}}
              </div>
            </td>
          </tr>
        </table>
        
        <!-- Admin Response Box -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border-left: 4px solid ${PRIMARY_COLOR}; border-radius: 8px; margin-bottom: 30px;">
          <tr>
            <td style="padding: 20px;">
              <div style="font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 12px;">
                Admin Response:
              </div>
              <div style="font-size: 15px; line-height: 1.6; color: #1f2937; white-space: pre-wrap;">
                {{adminMessage}}
              </div>
            </td>
          </tr>
        </table>
        
        <!-- CTA Button -->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td align="center" style="padding: 10px 0;">
              <a href="{{dashboardUrl}}/support" style="display: inline-block; background: linear-gradient(135deg, ${PRIMARY_COLOR} 0%, ${ACCENT_COLOR} 100%); color: #1f2937; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);">
                View & Reply to Ticket
              </a>
            </td>
          </tr>
        </table>
      `,
      ['recipientName', 'logoUrl', 'ticketId', 'ticketSubject', 'ticketStatus', 'adminMessage', 'dashboardUrl', 'currentYear']
    ),
    variables: ['recipientName', 'logoUrl', 'ticketId', 'ticketSubject', 'ticketStatus', 'adminMessage', 'dashboardUrl', 'currentYear'],
    email_type: 'ticket_response',
    category: 'support'
  }
];

async function createTicketTemplates() {
  try {
    console.log('🔍 Checking if email_templates table exists...');
    
    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_templates'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('❌ email_templates table does not exist. Please create it first.');
      return;
    }
    
    console.log('✅ email_templates table exists');
    
    console.log(`📧 Updating ${templates.length} ticket email template(s)...\n`);
    
    let updatedCount = 0;
    let createdCount = 0;
    
    for (const template of templates) {
      try {
        // Check if template already exists
        const existing = await pool.query(
          'SELECT id FROM email_templates WHERE name = $1',
          [template.name]
        );
        
        if (existing.rows.length > 0) {
          // Update existing template
          await pool.query(
            `UPDATE email_templates 
             SET html_code = $1, 
                 description = $2, 
                 variables = $3::jsonb,
                 updated_at = NOW()
             WHERE name = $4`,
            [
              template.html_code,
              template.description,
              JSON.stringify(template.variables),
              template.name
            ]
          );
          updatedCount++;
          console.log(`✅ Updated template: "${template.name}"`);
        } else {
          // Insert new template
          await pool.query(
            `INSERT INTO email_templates (name, description, html_code, variables, is_default, from_email, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW())`,
            [
              template.name,
              template.description,
              template.html_code,
              JSON.stringify(template.variables),
              false,
              COMPANY_EMAIL
            ]
          );
          createdCount++;
          console.log(`✅ Created template: "${template.name}"`);
        }
      } catch (error) {
        console.error(`❌ Error processing template "${template.name}":`, error.message);
      }
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Summary:`);
    console.log(`   • Templates created: ${createdCount}`);
    console.log(`   • Templates updated: ${updatedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('❌ Error creating ticket templates:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
createTicketTemplates()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

