/**
 * Script to create ticket email templates in database
 * Run with: node scripts/create_ticket_email_templates.js
 */

import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://portal.solitairemarkets.com';
const LOGO_URL = 'https://portal.solitairemarkets.com/logo.svg';
const DASHBOARD_URL = `${FRONTEND_URL}/user/dashboard`;

const templates = [
  {
    name: 'Ticket Created',
    description: 'Email sent to user when they create a support ticket',
    html_code: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Support Ticket Created</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Logo -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="{{logoUrl}}" alt="Solitaire Markets" style="height: 60px; max-width: 250px;" />
    </div>
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
      <h2 style="margin: 0; font-size: 24px;">Support Ticket Created</h2>
    </div>
    
    <!-- Content -->
    <p style="font-size: 16px;">Hello {{recipientName}},</p>
    
    <p style="font-size: 16px;">Thank you for contacting Solitaire Markets support. We have received your ticket and our team will respond as soon as possible.</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
      <p style="margin: 5px 0; font-size: 14px;"><strong>Ticket Number:</strong> #{{ticketId}}</p>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Subject:</strong> {{ticketSubject}}</p>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Category:</strong> {{ticketCategory}}</p>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Priority:</strong> {{ticketPriority}}</p>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Status:</strong> Open</p>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Date:</strong> {{ticketDate}}</p>
    </div>
    
    <p style="font-size: 16px;">You can view and reply to your ticket by clicking the button below:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{dashboardUrl}}/support" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
        View Ticket
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666;">If you have any additional information, please reply directly to this ticket through your dashboard.</p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #666; text-align: center;">
      This is an automated message. Please do not reply to this email.<br>
      © {{currentYear}} Solitaire Markets. All rights reserved.
    </p>
  </div>
</body>
</html>
    `,
    variables: ['recipientName', 'ticketId', 'ticketSubject', 'ticketCategory', 'ticketPriority', 'ticketDate', 'logoUrl', 'dashboardUrl', 'currentYear'],
    email_type: 'ticket_created',
    category: 'support'
  },
  {
    name: 'Ticket Response',
    description: 'Email sent to user when admin replies to their support ticket',
    html_code: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Response on Support Ticket</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
  <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Logo -->
    <div style="text-align: center; margin-bottom: 30px;">
      <img src="{{logoUrl}}" alt="Solitaire Markets" style="height: 60px; max-width: 250px;" />
    </div>
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; margin-bottom: 30px;">
      <h2 style="margin: 0; font-size: 24px;">Response on Your Support Ticket</h2>
    </div>
    
    <!-- Content -->
    <p style="font-size: 16px;">Hello {{recipientName}},</p>
    
    <p style="font-size: 16px;">You have received a response on your support ticket:</p>
    
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #667eea; margin: 20px 0;">
      <p style="margin: 5px 0; font-size: 14px;"><strong>Ticket Number:</strong> #{{ticketId}}</p>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Subject:</strong> {{ticketSubject}}</p>
      <p style="margin: 5px 0; font-size: 14px;"><strong>Status:</strong> {{ticketStatus}}</p>
    </div>
    
    <div style="background-color: #fff; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: #667eea;">Admin Response:</p>
      <div style="font-size: 15px; color: #333; white-space: pre-wrap;">{{adminMessage}}</div>
    </div>
    
    <p style="font-size: 16px;">You can view the full conversation and reply by clicking the button below:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{dashboardUrl}}/support" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; font-weight: 700; font-size: 16px; padding: 16px 40px; border-radius: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
        View & Reply to Ticket
      </a>
    </div>
    
    <p style="font-size: 14px; color: #666;">If you need further assistance, please reply directly to this ticket through your dashboard.</p>
    
    <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
    
    <p style="font-size: 12px; color: #666; text-align: center;">
      This is an automated message. Please do not reply to this email.<br>
      © {{currentYear}} Solitaire Markets. All rights reserved.
    </p>
  </div>
</body>
</html>
    `,
    variables: ['recipientName', 'ticketId', 'ticketSubject', 'ticketStatus', 'adminMessage', 'logoUrl', 'dashboardUrl', 'currentYear'],
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
    
    // Check and add email_type and category columns if they don't exist
    console.log('🔍 Checking for email_type and category columns...');
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'email_templates' 
      AND column_name IN ('email_type', 'category')
    `);
    const existingColumns = columnCheck.rows.map(r => r.column_name);
    
    if (!existingColumns.includes('email_type')) {
      await pool.query(`ALTER TABLE email_templates ADD COLUMN email_type VARCHAR(100)`);
      console.log('✅ Added email_type column');
    }
    if (!existingColumns.includes('category')) {
      await pool.query(`ALTER TABLE email_templates ADD COLUMN category VARCHAR(50)`);
      console.log('✅ Added category column');
    }
    
    console.log(`📧 Creating ${templates.length} ticket email template(s)...\n`);
    
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
                 email_type = $4,
                 category = $5,
                 updated_at = NOW()
             WHERE name = $6`,
            [
              template.html_code,
              template.description,
              JSON.stringify(template.variables),
              template.email_type,
              template.category,
              template.name
            ]
          );
          console.log(`✅ Updated template: "${template.name}"`);
        } else {
          // Insert new template
          await pool.query(
            `INSERT INTO email_templates (name, description, html_code, variables, email_type, category, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW())`,
            [
              template.name,
              template.description,
              template.html_code,
              JSON.stringify(template.variables),
              template.email_type,
              template.category
            ]
          );
          console.log(`✅ Created template: "${template.name}"`);
        }
      } catch (error) {
        console.error(`❌ Error processing template "${template.name}":`, error.message);
      }
    }
    
    console.log(`\n🎉 Finished! Processed ${templates.length} template(s)`);
    
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

