/**
 * Script to assign Deposit Rejected template to its action
 * Run with: node scripts/assign_deposit_rejected_template.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

async function assignDepositRejectedTemplate() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 60000, // 60 seconds timeout
    });

    try {
        console.log('🔍 Assigning Deposit Rejected template...\n');

        // Find the action
        const actionResult = await pool.query(
            'SELECT id, template_id FROM unified_actions WHERE action_name = $1',
            ['Deposit Rejected Email - on Deposit Rejection']
        );

        if (actionResult.rows.length === 0) {
            console.log('⚠️  Action "Deposit Rejected Email - on Deposit Rejection" not found in unified_actions');
            await pool.end();
            process.exit(1);
        }

        const action = actionResult.rows[0];

        if (action.template_id) {
            console.log(`✅ Action already has a template assigned (ID: ${action.template_id})`);
            await pool.end();
            process.exit(0);
        }

        // Find the template
        const templateResult = await pool.query(
            'SELECT id FROM email_templates WHERE name = $1',
            ['Deposit Rejected']
        );

        if (templateResult.rows.length === 0) {
            console.log('⚠️  Template "Deposit Rejected" not found');
            await pool.end();
            process.exit(1);
        }

        const templateId = templateResult.rows[0].id;

        // Assign template to action
        await pool.query(
            `UPDATE unified_actions 
             SET template_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [templateId, action.id]
        );

        console.log(`✅ Successfully assigned template "Deposit Rejected" (ID: ${templateId}) to action`);
        console.log(`   Action ID: ${action.id}`);
        console.log(`   Template ID: ${templateId}\n`);

        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        await pool.end();
        process.exit(1);
    }
}

assignDepositRejectedTemplate();
