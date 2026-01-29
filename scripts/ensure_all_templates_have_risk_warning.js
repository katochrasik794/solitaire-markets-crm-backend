/**
 * Script to ensure all email templates have the Risk Warning disclaimer in footer
 * Run with: node scripts/ensure_all_templates_have_risk_warning.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

const BRAND_NAME = 'Solitaire Markets';
const RISK_WARNING_HTML = `
              <p style="font-size: 11px; color: #9ca3af; margin: 0; line-height: 1.6; max-width: 560px; margin-left: auto; margin-right: auto;">
                <strong>Risk Warning:</strong> Trading in financial instruments involves a significant risk of loss. Past performance is not indicative of future results. Only invest capital that you can afford to lose. Before trading, please ensure you fully understand the risks involved and seek independent advice if necessary. ${BRAND_NAME} is not responsible for any losses incurred as a result of trading decisions.
              </p>`;

async function ensureRiskWarning() {
  try {
    console.log('🚀 Checking all email templates for Risk Warning disclaimer...\n');

    const templatesResult = await pool.query(
      'SELECT id, name, html_code FROM email_templates ORDER BY id'
    );

    const templates = templatesResult.rows;
    let updatedCount = 0;
    let alreadyHasCount = 0;

    for (const template of templates) {
      const hasRiskWarning = template.html_code.includes('Risk Warning:') && 
                            template.html_code.includes('Trading in financial instruments involves a significant risk of loss');

      if (hasRiskWarning) {
        console.log(`✅ "${template.name}" (ID: ${template.id}) - Already has Risk Warning`);
        alreadyHasCount++;
        continue;
      }

      console.log(`📝 "${template.name}" (ID: ${template.id}) - Adding Risk Warning...`);

      // Find footer section and add risk warning before closing </td>
      let updatedHtml = template.html_code;

      // Pattern 1: Look for footer td that has "All rights reserved" but no Risk Warning
      const footerPattern = /(<td[^>]*style="background-color:\s*#f9fafb[^"]*"[^>]*>[\s\S]*?All rights reserved[\s\S]*?)(<\/td>\s*<\/tr>\s*<!-- \/Footer -->|<\/td>\s*<\/tr>\s*<\/table>)/i;
      
      if (footerPattern.test(updatedHtml)) {
        updatedHtml = updatedHtml.replace(
          footerPattern,
          (match, footerContent, closingTags) => {
            // Check if Risk Warning already exists
            if (footerContent.includes('Risk Warning:')) {
              return match;
            }
            // Add Risk Warning before closing </p> tag
            return footerContent.replace(
              /(<\/p>\s*)(<\/td>)/i,
              `$1${RISK_WARNING_HTML}$2`
            ) + closingTags;
          }
        );
      } else {
        // Pattern 2: Try to find any footer section and add risk warning
        const footerTdPattern = /(<td[^>]*style="[^"]*background-color:\s*#f9fafb[^"]*"[^>]*>[\s\S]*?)(<\/td>\s*<\/tr>)/i;
        if (footerTdPattern.test(updatedHtml)) {
          updatedHtml = updatedHtml.replace(
            footerTdPattern,
            (match, footerStart, closing) => {
              if (footerStart.includes('Risk Warning:')) {
                return match;
              }
              // Add before closing </td>
              return footerStart + RISK_WARNING_HTML + closing;
            }
          );
        } else {
          console.log(`   ⚠️  Could not find footer section, skipping`);
          continue;
        }
      }

      // Update template
      await pool.query(
        `UPDATE email_templates 
         SET html_code = $1, updated_at = NOW()
         WHERE id = $2`,
        [updatedHtml, template.id]
      );

      console.log(`   ✅ Added Risk Warning disclaimer\n`);
      updatedCount++;
    }

    console.log('\n✅ Risk Warning check completed!');
    console.log(`   Updated: ${updatedCount} templates`);
    console.log(`   Already had Risk Warning: ${alreadyHasCount} templates`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error ensuring Risk Warning:', error);
    process.exit(1);
  }
}

ensureRiskWarning();
