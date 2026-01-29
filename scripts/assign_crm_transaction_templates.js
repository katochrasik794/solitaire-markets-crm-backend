/**
 * Script to assign existing CRM transaction email templates to their actions
 * Run with: node scripts/assign_crm_transaction_templates.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// Mapping of action names to template names
const actionTemplateMapping = {
    'Deposit Rejected Email - on Deposit Rejection': 'Deposit Rejected',
    'Deposit Cancelled Email - on Deposit Cancellation': 'Deposit Cancelled',
    'Withdrawal Rejected Email - on Withdrawal Rejection': 'Withdrawal Rejected',
    'Withdrawal Cancelled Email - on Withdrawal Cancellation': 'Withdrawal Cancelled',
};

async function assignTemplates() {
    try {
        console.log('🔍 Assigning CRM transaction email templates to unified_actions...\n');

        let assignedCount = 0;
        let skippedCount = 0;
        let notFoundCount = 0;

        for (const [actionName, templateName] of Object.entries(actionTemplateMapping)) {
            try {
                // Find the action
                const actionResult = await pool.query(
                    'SELECT id, template_id FROM unified_actions WHERE action_name = $1',
                    [actionName]
                );

                if (actionResult.rows.length === 0) {
                    console.log(`⚠️  Action "${actionName}" not found in unified_actions`);
                    notFoundCount++;
                    continue;
                }

                const action = actionResult.rows[0];

                // If template already assigned, skip
                if (action.template_id) {
                    console.log(`⏭️  Action "${actionName}" already has a template assigned (ID: ${action.template_id})`);
                    skippedCount++;
                    continue;
                }

                // Find the template
                const templateResult = await pool.query(
                    'SELECT id FROM email_templates WHERE name = $1',
                    [templateName]
                );

                if (templateResult.rows.length === 0) {
                    console.log(`⚠️  Template "${templateName}" not found`);
                    notFoundCount++;
                    continue;
                }

                const templateId = templateResult.rows[0].id;

                // Assign template to action
                await pool.query(
                    `UPDATE unified_actions 
                     SET template_id = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [templateId, action.id]
                );

                console.log(`✅ Assigned template "${templateName}" (ID: ${templateId}) to action "${actionName}"`);
                assignedCount++;
            } catch (error) {
                console.error(`❌ Error processing "${actionName}":`, error.message);
            }
        }

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Summary:`);
        console.log(`   • Templates assigned: ${assignedCount}`);
        console.log(`   • Already assigned (skipped): ${skippedCount}`);
        console.log(`   • Not found: ${notFoundCount}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        await pool.end();
        process.exit(1);
    }
}

assignTemplates();
