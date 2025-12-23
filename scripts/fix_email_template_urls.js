/**
 * Script to fix hardcoded URLs in email templates
 * This replaces all solitairemarkets.me URLs with portal.solitairemarkets.com
 * Run with: node scripts/fix_email_template_urls.js
 */

import pool from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const CORRECT_DOMAIN = 'https://portal.solitairemarkets.com';
const DASHBOARD_URL = `${CORRECT_DOMAIN}/user/dashboard`;
const WRONG_DOMAINS = [
  'https://solitairemarkets.me',
  'http://solitairemarkets.me',
  'https://www.solitairemarkets.me',
  'http://www.solitairemarkets.me',
  'http://localhost:3000',
  'https://localhost:3000'
];

async function fixEmailTemplates() {
  try {
    console.log('🔍 Fetching all email templates...');
    const result = await pool.query('SELECT id, name, html_code FROM email_templates');
    
    if (result.rows.length === 0) {
      console.log('✅ No email templates found in database.');
      return;
    }
    
    console.log(`📧 Found ${result.rows.length} email template(s)`);
    
    let updatedCount = 0;
    
    for (const template of result.rows) {
      let htmlCode = template.html_code;
      let wasUpdated = false;
      
      // Replace wrong domain URLs with correct dashboard URL
      WRONG_DOMAINS.forEach(wrongDomain => {
        const patterns = [
          new RegExp(`${wrongDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"'\s>]*`, 'gi'),
          new RegExp(`href=["']${wrongDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*["']`, 'gi')
        ];
        
        patterns.forEach(pattern => {
          if (pattern.test(htmlCode)) {
            htmlCode = htmlCode.replace(pattern, (match) => {
              // If it's an href attribute, replace the whole href
              if (match.includes('href=')) {
                return `href="${DASHBOARD_URL}"`;
              }
              // Otherwise replace the URL
              return DASHBOARD_URL;
            });
            wasUpdated = true;
          }
        });
      });
      
      // Replace any {{dashboardUrl}} or similar variables that might have wrong URLs
      htmlCode = htmlCode.replace(/\{\{\s*dashboardUrl\s*\}\}/gi, DASHBOARD_URL);
      htmlCode = htmlCode.replace(/\{\{\s*dashboard_url\s*\}\}/gi, DASHBOARD_URL);
      htmlCode = htmlCode.replace(/\{\{\s*DASHBOARD_URL\s*\}\}/gi, DASHBOARD_URL);
      
      if (wasUpdated || htmlCode !== template.html_code) {
        await pool.query(
          'UPDATE email_templates SET html_code = $1, updated_at = NOW() WHERE id = $2',
          [htmlCode, template.id]
        );
        console.log(`✅ Updated template: "${template.name}" (ID: ${template.id})`);
        updatedCount++;
      } else {
        console.log(`⏭️  No changes needed for: "${template.name}" (ID: ${template.id})`);
      }
    }
    
    console.log(`\n🎉 Finished! Updated ${updatedCount} out of ${result.rows.length} template(s)`);
    
  } catch (error) {
    console.error('❌ Error fixing email templates:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
fixEmailTemplates()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

