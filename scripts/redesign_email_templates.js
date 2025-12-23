/**
 * Script to REDESIGN and UPDATE all email templates with modern UI and prominent logo
 * Run with: node scripts/redesign_email_templates.js
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
const COMPANY_EMAIL = 'support@solitairemarkets.me';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://solitairemarkets.me';

// Base64 encoded logo - will be replaced with {{logoUrl}} variable
const templates = [
    {
        name: 'Welcome Email',
        description: 'Welcome email sent to new users after signup',
        html_code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Welcome to ${BRAND_NAME}</title>
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
            <td style="background: linear-gradient(135deg, ${SECONDARY_COLOR} 0%, #1a2332 100%); padding: 40px 30px; text-align: center;">
              <img src="{{logoUrl}}" alt="${BRAND_NAME}" style="height: 60px; max-width: 250px; display: block; margin: 0 auto 20px auto;" />
              <div style="font-size: 28px; font-weight: 700; color: ${PRIMARY_COLOR}; margin: 0; line-height: 1.2;">
                ${BRAND_NAME}
              </div>
              <div style="font-size: 16px; color: rgba(255, 255, 255, 0.9); margin-top: 8px;">
                Welcome Aboard!
              </div>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
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
</html>`,
        variables: ['recipientName', 'logoUrl', 'currentYear'],
        is_default: false,
    },
    {
        name: 'MT5 Account Created',
        description: 'Email sent when a new MT5 account is created',
        html_code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MT5 Account Created - ${BRAND_NAME}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f7fa; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, ${SECONDARY_COLOR} 0%, #1a2332 100%); padding: 35px 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center">
                    <img src="{{logoUrl}}" alt="${BRAND_NAME}" style="height: 55px; max-width: 250px; display: block; margin: 0 auto 15px auto;" />
                    <div style="font-size: 24px; font-weight: 700; color: ${PRIMARY_COLOR}; margin: 0; line-height: 1.2;">
                      ${BRAND_NAME}
                    </div>
                    <div style="font-size: 14px; color: rgba(255, 255, 255, 0.85); margin-top: 8px;">
                      MT5 Account Created
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 35px 30px;">
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
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 13px; color: #6b7280; margin: 0; line-height: 1.5;">
                © {{currentYear}} ${BRAND_NAME}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
        variables: ['recipientName', 'logoUrl', 'accountType', 'login', 'password', 'currentYear'],
        is_default: false,
    },
    // Add more templates here - keeping the script focused on Welcome and MT5 for now
    // The update_email_templates.js script already has all templates
];

async function updateTemplates() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('🎨 Redesigning email templates with modern UI and prominent logo...\n');

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
        console.log('📧 Logo is now prominently displayed using {{logoUrl}} variable');

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

