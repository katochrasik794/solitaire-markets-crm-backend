/**
 * Script to assign IB email templates to unified_actions
 * This script ensures all IB actions have their templates assigned
 * Run with: node scripts/assign_ib_templates.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});

// IB action names and their corresponding template names
const ibActionTemplateMap = {
    'IB Request Rejected Email - on IB Request Rejection': 'IB Request Rejected',
    'IB Locked Email - on IB Lock': 'IB Account Locked',
    'IB Unlocked Email - on IB Unlock': 'IB Account Unlocked',
    'IB Withdrawal Request Email - on IB Withdrawal Request': 'IB Withdrawal Request',
    'IB Withdrawal Approved Email - on IB Withdrawal Approval': 'IB Withdrawal Approved',
    'IB Withdrawal Rejected Email - on IB Withdrawal Rejection': 'IB Withdrawal Rejected',
};

async function assignIBTemplates() {
    try {
        console.log('🔍 Assigning IB email templates to unified_actions...\n');

        let assignedCount = 0;
        let skippedCount = 0;
        let notFoundCount = 0;

        for (const [actionName, templateName] of Object.entries(ibActionTemplateMap)) {
            try {
                // Find the action
                const actionResult = await pool.query(
                    'SELECT id FROM unified_actions WHERE action_name = $1',
                    [actionName]
                );

                if (actionResult.rows.length === 0) {
                    console.log(`⚠️  Action "${actionName}" not found in unified_actions`);
                    notFoundCount++;
                    continue;
                }

                const actionId = actionResult.rows[0].id;

                // Check if template already assigned
                const currentAssignment = await pool.query(
                    'SELECT template_id FROM unified_actions WHERE id = $1',
                    [actionId]
                );

                if (currentAssignment.rows[0].template_id) {
                    console.log(`⏭️  Action "${actionName}" already has a template assigned (ID: ${currentAssignment.rows[0].template_id})`);
                    skippedCount++;
                    continue;
                }

                // Find the template
                const templateResult = await pool.query(
                    'SELECT id FROM email_templates WHERE name = $1',
                    [templateName]
                );

                if (templateResult.rows.length === 0) {
                    console.log(`⚠️  Template "${templateName}" not found. Please run create_ib_email_templates.js first.`);
                    notFoundCount++;
                    continue;
                }

                const templateId = templateResult.rows[0].id;

                // Assign template to action
                await pool.query(
                    `UPDATE unified_actions 
                     SET template_id = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [templateId, actionId]
                );

                assignedCount++;
                console.log(`✅ Assigned template "${templateName}" (ID: ${templateId}) to action "${actionName}"`);
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
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the script
assignIBTemplates()
    .then(() => {
        console.log('✨ Script completed successfully!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });
