/**
 * Script to add disclaimer to newly created email templates
 * Run with: node scripts/add_disclaimer_to_templates.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// List of template names that need the disclaimer added
const templatesToUpdate = [
    'Deposit Approved',
    'Transaction Completed - Deposit',
    'Withdrawal Approved',
    'Transaction Completed - Withdrawal',
    'KYC Completion',
    'KYC Submission Confirmation',
    'IB Request Accepted',
    'IB Request Confirmation',
    'Custom Admin Email'
];

// Standard risk warning disclaimer
const DISCLAIMER_HTML = `
              <p style="font-size: 11px; color: #9ca3af; margin: 0; line-height: 1.6; max-width: 560px; margin-left: auto; margin-right: auto;">
                <strong>Risk Warning:</strong> Trading in financial instruments involves a significant risk of loss. Past performance is not indicative of future results. Only invest capital that you can afford to lose. Before trading, please ensure you fully understand the risks involved and seek independent advice if necessary. Solitaire Markets is not responsible for any losses incurred as a result of trading decisions.
              </p>`;

async function addDisclaimerToTemplates() {
    try {
        console.log('🔍 Finding templates to update...\n');

        // Get all templates that need updating
        const placeholders = templatesToUpdate.map((_, i) => `$${i + 1}`).join(',');
        const result = await pool.query(
            `SELECT id, name, html_code 
             FROM email_templates 
             WHERE name = ANY(ARRAY[${placeholders}])`,
            templatesToUpdate
        );

        if (result.rows.length === 0) {
            console.log('✅ No templates found to update.');
            await pool.end();
            return;
        }

        console.log(`Found ${result.rows.length} template(s) to update:\n`);

        let updatedCount = 0;

        for (const template of result.rows) {
            try {
                // Check if disclaimer already exists
                if (template.html_code.includes('Risk Warning:') || template.html_code.includes('Risk warning:')) {
                    console.log(`⚠️  Template "${template.name}" already has a disclaimer, skipping...`);
                    continue;
                }

                // Find the footer section and add disclaimer before the closing </td>
                // Look for the footer pattern: © {{currentYear}} ... </p>
                const footerPattern = /(©\s*\{\{currentYear\}\}.*?<\/p>)(\s*<\/td>\s*<\/tr>\s*<\/table>)/is;
                
                if (footerPattern.test(template.html_code)) {
                    // Add disclaimer after the copyright text but before closing </td>
                    const updatedHtml = template.html_code.replace(
                        footerPattern,
                        `$1${DISCLAIMER_HTML}\n            $2`
                    );

                    // Update the template in database
                    await pool.query(
                        `UPDATE email_templates 
                         SET html_code = $1, updated_at = NOW()
                         WHERE id = $2`,
                        [updatedHtml, template.id]
                    );

                    updatedCount++;
                    console.log(`✅ Added disclaimer to template "${template.name}" (ID: ${template.id})`);
                } else {
                    console.log(`⚠️  Could not find footer pattern in template "${template.name}", skipping...`);
                }
            } catch (error) {
                console.error(`❌ Error updating template "${template.name}":`, error.message);
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Summary:`);
        console.log(`   • Templates updated: ${updatedCount}`);
        console.log(`   • Templates skipped: ${result.rows.length - updatedCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the script
addDisclaimerToTemplates()
    .then(() => {
        console.log('✨ Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });




